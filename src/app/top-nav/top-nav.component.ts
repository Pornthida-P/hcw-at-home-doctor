import {
  Input,
  OnInit,
  NgZone,
  Output,
  OnDestroy,
  Component,
  EventEmitter,
} from "@angular/core";
import { AuthService } from '../auth/auth.service';
import { ConfigService } from '../core/config.service';
import { ConsultationService } from '../core/consultation.service';
import { SidenavToggleService } from '../core/sidenav-toggle.service';
import {IStepOption, TourService} from "ngx-ui-tour-md-menu";
import {BreakpointObserver, Breakpoints} from "@angular/cdk/layout";
import {Direction, EventName, TourType} from "../models/tour";
import {Subscription} from "rxjs";
import {Router} from "@angular/router";
import {StartTourComponent} from "../shared/components/start-tour/start-tour.component";
import {MatDialog} from "@angular/material/dialog";
import {TranslateService} from "@ngx-translate/core";
import {InviteFormComponent} from "../invite-form/invite-form.component";
import {GuidedTourService} from "../core/guided-tour.service";

// page the user was on when starting the guided tour, so the tour can bring them back
const TOUR_RETURN_URL_KEY = 'hcw-tour-return-url';

@Component({
  selector: 'app-top-nav',
  templateUrl: './top-nav.component.html',
  styleUrls: ['./top-nav.component.scss'],
})
export class TopNavComponent implements OnInit, OnDestroy {
  @Input() consultation;
  @Input() title: string;
  @Input() icon: string;
  currentUser;
  logoutToggle = false;
  @Input() showCloseConsBtn;
  @Output() closeCon = new EventEmitter<boolean>();
  isMobile = false;
  private stepHideSubscription: Subscription;
  // profile drop-down opened by the tour (closed again when a page-only tour ends)
  private profileMenuOpenedByTour = false;

  constructor(
    private zone: NgZone,
    private router: Router,
    public dialog: MatDialog,
    private authService: AuthService,
    private tourService: TourService,
    private guidedTourService: GuidedTourService,
    public configService: ConfigService,
    private translate: TranslateService,
    private breakpointObserver: BreakpointObserver,
    private consultationService: ConsultationService,
    private sidenavToggleService: SidenavToggleService,
  ) {}

  ngOnInit() {
    if (this.consultation) {
      this.title = this.consultation.nurse
        ? this.consultation.nurse.firstName +
          ' ' +
          this.consultation.nurse.lastName.toUpperCase()
        : '';
      this.icon = 'info';
    }
    this.currentUser = this.authService.currentUserValue;
    this.breakpointObserver.observe([Breakpoints.XSmall]).subscribe(result => {
      this.isMobile = result.matches;
    });
    this.listenToTourSubscriptions();
  }

  listenToTourSubscriptions() {
    this.stepHideSubscription = this.tourService.events$.subscribe(events => {
      const value = events.value as { step: IStepOption; direction: Direction };
      const pageTour = this.guidedTourService.mode === 'page';
      if (events.name === 'end') {
        if (pageTour) {
          // Page-only tour never navigated; just tidy up the profile menu
          sessionStorage.removeItem(TOUR_RETURN_URL_KEY);
          if (this.profileMenuOpenedByTour && this.logoutToggle) {
            this.toggleLogout();
          }
          this.profileMenuOpenedByTour = false;
        } else {
          // full tour closed before its last step: go back to where the user started it
          const returnUrl = sessionStorage.getItem(TOUR_RETURN_URL_KEY);
          if (returnUrl) {
            sessionStorage.removeItem(TOUR_RETURN_URL_KEY);
            if (returnUrl !== this.router.url) {
              this.router.navigateByUrl(returnUrl);
            }
          }
        }
      }
      if (
          events.name === EventName.StepHide &&
          value &&
          value.step &&
          value.step.anchorId === TourType.CONSULTATION_HISTORY_MENU &&
          value.direction === Direction.Forwards
      ) {
        if (!this.logoutToggle) {
          this.profileMenuOpenedByTour = true;
          this.toggleLogout();
        }
      }
      if (
          events.name === EventName.StepShow &&
          value &&
          value.step &&
          value.step.anchorId === TourType.INVITES_MENU &&
          value.direction === Direction.Forwards
      ) {
        this.sidenavToggleService.toggleSidenav('open');
      }
      if (
          events.name === EventName.StepShow &&
          value &&
          value.step &&
          value.step.anchorId === TourType.NEW_INVITE_BUTTON &&
          value.direction === Direction.Forwards &&
          this.isMobile
      ) {
        this.sidenavToggleService.toggleSidenav('close');
      }
      if (
          events.name === EventName.StepHide &&
          value &&
          value.step &&
          value.step.anchorId === TourType.WAITING_ROOM_MENU &&
          value.direction === Direction.Backwards &&
          !pageTour
      ) {
        this.openInviteDialog()
      }
      if (
          events.name === EventName.StepHide &&
          value &&
          value.step &&
          value.step.anchorId === TourType.NEW_INVITE_BUTTON &&
          value.direction === Direction.Backwards &&
          this.isMobile
      ) {
        this.sidenavToggleService.toggleSidenav('open');
      }
      if (
          events.name === EventName.StepHide &&
          value &&
          value.step &&
          value.step.anchorId === TourType.HEADER_PROFILE_MENU &&
          value.direction === Direction.Forwards &&
          pageTour
      ) {
        // End of the page-only tour: stay on this page and offer the full tour
        sessionStorage.removeItem(TOUR_RETURN_URL_KEY);
        if (this.profileMenuOpenedByTour && this.logoutToggle) {
          this.toggleLogout();
        }
        this.profileMenuOpenedByTour = false;
        this.offerFullTour();
      } else if (
          events.name === EventName.StepHide &&
          value &&
          value.step &&
          value.step.anchorId === TourType.HEADER_PROFILE_MENU &&
          value.direction === Direction.Forwards
      ) {
        const returnUrl = sessionStorage.getItem(TOUR_RETURN_URL_KEY);
        sessionStorage.removeItem(TOUR_RETURN_URL_KEY);
        if (returnUrl) {
          this.router.navigateByUrl(returnUrl);
        } else {
          this.router.navigate([`/profile`]);
        }
         this.dialog.open(StartTourComponent, {
          autoFocus: false,
           data: {
             title: this.translate.instant('tour.endTourTitle'),
             description: this.translate.instant('tour.endTourDescription'),
             submitBtnTitle: this.translate.instant('tour.endTourSubmitBtnTitle'),
           }
        });
      }
      setTimeout(() => {
        const dialogElement2 = document.querySelector('.cdk-overlay-connected-position-bounding-box');
        if (dialogElement2) {
          dialogElement2.classList.add('z-index-9999');
          document.body.appendChild(dialogElement2);
        }
      }, 0)

    });
  }

  toggleLogout() {
    this.zone.run(() => {
      this.logoutToggle = !this.logoutToggle;
    });
  }

  /**
   * Help button: run a tour of the current page without navigating
   * away. The full onboarding tour (which visits Invitations, waiting room,
   * ... and brings the user back here at the end) is offered afterwards.
   */
  startTour() {
    if (this.guidedTourService.isRunning()) {
      return;
    }
    sessionStorage.setItem(TOUR_RETURN_URL_KEY, this.router.url);
    this.sidenavToggleService.toggleSidenav('open');
    this.guidedTourService.startPageTour();
  }

  private offerFullTour() {
    const dialogRef = this.dialog.open(StartTourComponent, {
      autoFocus: false,
      width: '450px',
      data: {
        title: this.translate.instant('tour.pageTourEndTitle'),
        description: this.translate.instant('tour.pageTourEndDescription'),
        dismissBtnTitle: this.translate.instant('tour.pageTourCloseBtnTitle'),
        submitBtnTitle: this.translate.instant('tour.pageTourFullTourBtnTitle'),
      },
    });
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        // remember where we are so the full tour brings the user back here
        sessionStorage.setItem(TOUR_RETURN_URL_KEY, this.router.url);
        this.sidenavToggleService.toggleSidenav('open');
        this.guidedTourService.startFullTour();
      }
    });
  }

  toggleSidenav() {
    this.sidenavToggleService.toggleSidenav();
  }

  openInviteDialog() {
    const dialogRef = this.dialog.open(InviteFormComponent, {
      id: 'invite_form_dialog',
      data: {},
    });
  }

  logout() {
    this.authService.logout(true);
  }

  switchUser() {
    this.authService.switchUser();
  }

  acceptNextConsultation() {
    this.consultationService.acceptNext();
  }

  openNurse() {
    if (this.configService.config.doctorExternalLink) {
      window.open(this.configService.config.doctorExternalLink, '_blank');
    }
  }

  showCloseModal() {
    this.closeCon.emit(true);
  }

  ngOnDestroy() {
    if (this.stepHideSubscription) {
      this.stepHideSubscription?.unsubscribe();
    }
  }

  protected readonly TourType = TourType;
}
