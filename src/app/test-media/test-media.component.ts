import { RoomService, LogService } from 'hcw-stream-lib';
import { AuthService } from './../auth/auth.service';
import { OpenViduService } from './../openvidu.service';
import {
  Component,
  OnInit,
  ViewChild,
  ElementRef,
  OnDestroy,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { ErrorDialogComponent } from '../error-dialog/error-dialog.component';
import { TranslateService } from '@ngx-translate/core';
import { MatDialog } from '@angular/material/dialog';

@Component({
  selector: 'app-test-media',
  templateUrl: './test-media.component.html',
  styleUrls: ['./test-media.component.scss'],
})
export class TestMediaComponent implements OnInit, OnDestroy {
  title: {
    title: 'Media test';
    icon: 'chat';
  };

  videoDeviceId: string;
  audioDeviceId: string;
  videoDevices = [];
  audioDevices = [];
  myCamStream;
  volumeLevel = 0;
  showSpinner;
  error;
  peerId: string;
  private destroyed = false;
  private loadingTimeout: any;
  // Max time to get a test session and connect to the media server
  private static readonly MEDIA_SERVER_TIMEOUT_MS = 8000;
  private timedOut = false;
  private subscriptions: Subscription[] = [];
  mediaServerStatus: 'idle' | 'connecting' | 'connected' | 'failed' = 'idle';
  localStream: MediaStream;
  private audioContext: AudioContext;
  private volumeFrame: number;
  private serverVolume = false;
  @ViewChild('videoElement') videoElement: ElementRef;

  @ViewChild('localVideo') set localVideo(ref: ElementRef<HTMLVideoElement>) {
    if (ref?.nativeElement && this.localStream) {
      ref.nativeElement.srcObject = this.localStream;
    }
  }

  constructor(
    private openviduSev: OpenViduService,
    private authService: AuthService,
    private logger: LogService,
    private roomService: RoomService,
    public dialog: MatDialog,
    private translate: TranslateService
  ) {}

  ngOnInit() {
    this.peerId = this.authService.currentUserValue.id;
    this.showSpinner = true;
    this.initMediaTests();
  }

  ngOnDestroy() {
    this.destroyed = true;
    clearTimeout(this.loadingTimeout);
    this.stopLocalPreview();
    this.subscriptions.forEach(sub => sub?.unsubscribe());
    this.roomService?.close();
  }

  initMediaTests() {
    if (this.destroyed) return;

    // Detect the devices first so that a computer without camera and
    // microphone gets the message right away instead of a long spinner.
    this.detectMediaDevices().then(({ hasCamera, hasMicrophone, error }) => {
      if (this.destroyed) return;

      if (error) {
        this.showSpinner = false;
        this.error = error;
        return;
      }
      if (!hasCamera && !hasMicrophone) {
        this.showSpinner = false;
        this.error = this.translate.instant('testMedia.noDevice');
        return;
      }
      if (!hasCamera || !hasMicrophone) {
        // Test what is available and say what is missing
        this.error = this.translate.instant(
          hasCamera ? 'testMedia.noMicrophone' : 'testMedia.noCamera'
        );
      }

      this.startLocalPreview(hasCamera, hasMicrophone);
      this.startMediaServerTest(hasCamera, hasMicrophone);
    });
  }

  private async startLocalPreview(video: boolean, audio: boolean) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video, audio });
      if (this.destroyed || this.myCamStream) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      this.localStream = stream;
      this.showSpinner = false;
      if (audio) {
        this.startLocalVolumeMeter(stream);
      }
    } catch (err) {
      if (this.destroyed) return;
      this.logger.debug('Local preview failed', err);
      this.handleDeviceError(err);
    }
  }

  private startLocalVolumeMeter(stream: MediaStream) {
    const AudioCtx =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx || !stream.getAudioTracks().length) {
      return;
    }
    try {
      this.audioContext = new AudioCtx();
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 512;
      this.audioContext.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const tick = () => {
        if (this.destroyed || this.serverVolume || !this.audioContext) return;
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        this.volumeLevel = Math.min(100, Math.sqrt(sum / data.length) * 300);
        this.volumeFrame = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      this.logger.debug('Volume meter unavailable', e);
    }
  }

  private stopLocalPreview() {
    if (this.volumeFrame) {
      cancelAnimationFrame(this.volumeFrame);
      this.volumeFrame = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
  }

  /**
   * Resolves which kinds of input devices exist. enumerateDevices() answers
   * immediately; when it lists nothing (some browsers hide devices before
   * permission is granted) getUserMedia() is used to confirm, which fails
   * immediately with NotFoundError when there really is no device.
   */
  private async detectMediaDevices(): Promise<{
    hasCamera: boolean;
    hasMicrophone: boolean;
    error?: string;
  }> {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.getUserMedia) {
      return { hasCamera: false, hasMicrophone: false };
    }

    let hasCamera = false;
    let hasMicrophone = false;
    if (mediaDevices.enumerateDevices) {
      try {
        const devices = await mediaDevices.enumerateDevices();
        hasCamera = devices.some(d => d.kind === 'videoinput');
        hasMicrophone = devices.some(d => d.kind === 'audioinput');
      } catch (e) {
        this.logger.debug('enumerateDevices failed', e);
      }
    }
    if (hasCamera || hasMicrophone) {
      return { hasCamera, hasMicrophone };
    }

    try {
      const stream = await mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
      hasCamera = stream.getVideoTracks().length > 0;
      hasMicrophone = stream.getAudioTracks().length > 0;
      stream.getTracks().forEach(track => track.stop());
      return { hasCamera, hasMicrophone };
    } catch (err) {
      return this.mediaErrorToResult(err);
    }
  }

  private mediaErrorToResult(err): {
    hasCamera: boolean;
    hasMicrophone: boolean;
    error?: string;
  } {
    const name = err?.name;
    if (
      name === 'NotFoundError' ||
      name === 'DevicesNotFoundError' ||
      name === 'OverconstrainedError'
    ) {
      return { hasCamera: false, hasMicrophone: false };
    }
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return {
        hasCamera: false,
        hasMicrophone: false,
        error: this.translate.instant('testMedia.permissionDenied'),
      };
    }
    return {
      hasCamera: false,
      hasMicrophone: false,
      error: `${this.translate.instant('testMedia.testError')} ${err?.message || err}`,
    };
  }

  private mediaReady() {
    this.showSpinner = false;
    this.mediaServerStatus = 'connected';
    clearTimeout(this.loadingTimeout);
    if (this.timedOut) {
      // Connected after the timeout message: clear it
      this.timedOut = false;
      this.error = null;
    }
  }

  private startMediaServerTest(joinVideo: boolean, joinAudio: boolean) {
    this.subscriptions.push(
      this.roomService.onVolumeChange.subscribe(change => {
        this.serverVolume = true;
        this.volumeLevel = change.volume * 1000;
        if (!joinVideo && this.showSpinner) {
          // Microphone only: the mic is producing
          this.mediaReady();
        }
      })
    );

    this.subscriptions.push(
      this.roomService.onCamError.subscribe(err => this.handleDeviceError(err)),
      this.roomService.onMicError.subscribe(err => this.handleDeviceError(err))
    );

    // Never leave the page on an endless spinner: getting the test session
    // and connecting to the media server must not take longer than this.
    clearTimeout(this.loadingTimeout);
    this.timedOut = false;
    this.mediaServerStatus = 'connecting';
    this.loadingTimeout = setTimeout(() => {
      if (this.destroyed || this.mediaServerStatus !== 'connecting') return;
      this.showSpinner = false;
      this.mediaServerStatus = 'failed';
      this.timedOut = true;
      this.error = this.translate.instant('testMedia.mediaServerTimeout');
    }, TestMediaComponent.MEDIA_SERVER_TIMEOUT_MS);

    this.openviduSev.getTestToken().then(
      response => {
        if (this.destroyed) return;

        const token = response?.token;
        if (!token) {
          this.handleTestError(this.translate.instant('testMedia.noTestToken'));
          return;
        }

        // The backend issues the test token for room/peer
        // "test_<uuid>" and returns that id; use it (like the patient app)
        // instead of the doctor's user id, otherwise the token does not
        // match the room we join.
        if (response?.peerId) {
          this.peerId = response.peerId;
        }

        try {
          this.roomService.init({ peerId: this.peerId });

          Promise.resolve(
            this.roomService.join({
              roomId: this.peerId,
              joinVideo,
              joinAudio,
              token,
            })
          ).catch(err => this.handleTestError(err));
        } catch (err) {
          this.handleTestError(err);
          return;
        }

        this.subscriptions.push(
          this.roomService.onCamProducing.subscribe(stream => {
            this.logger.debug('Cam producing ', stream);
            this.myCamStream = stream;
            this.mediaReady();
            if (this.localStream) {
              this.localStream
                .getVideoTracks()
                .forEach(track => track.stop());
            }

            this.openviduSev.getDevices().then(devices => {
              if (this.destroyed) return;
              this.videoDevices = devices.filter(
                device => device.kind === 'videoinput'
              );
              if (
                this.videoDevices.length &&
                this.videoDevices[0].deviceId !== ''
              ) {
                this.videoDeviceId = this.videoDevices[0].deviceId;
              }
              this.audioDevices = devices.filter(
                device => device.kind === 'audioinput'
              );
              if (
                this.audioDevices.length &&
                this.audioDevices[0].deviceId !== ''
              ) {
                this.audioDeviceId = this.audioDevices[0].deviceId;
              }
            });
          })
        );
      },
      err => this.handleTestError(err)
    );
  }

  /** Camera/microphone error while starting the test (e.g. NotFoundError) */
  private handleDeviceError(err) {
    if (this.destroyed) return;
    this.logger.debug('Media device error', err);
    const result = this.mediaErrorToResult(err);
    this.error = result.error || this.translate.instant('testMedia.noDevice');
    if (this.showSpinner) {
      this.showSpinner = false;
      clearTimeout(this.loadingTimeout);
    }
  }

  handleTestError(err) {
    if (this.destroyed) return;
    clearTimeout(this.loadingTimeout);
    const message =
      err?.error?.details ||
      err?.details ||
      err?.error?.message ||
      err?.statusText ||
      err?.message ||
      err;
    const errorMessage = `${this.translate.instant('testMedia.testError')} ${message}`;
    this.error = errorMessage;
    this.showErrorDialog(errorMessage, '');
    this.showSpinner = false;
    this.mediaServerStatus = 'failed';
  }

  showErrorDialog(message: string, title: string): void {
    this.dialog.open(ErrorDialogComponent, {
      width: '450px',
      autoFocus: false,
      data: {
        title,
        message,
      },
    });
  }
}
