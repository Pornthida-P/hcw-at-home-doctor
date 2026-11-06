import { SocketEventsService } from '../core/socket-events.service';

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, Subject, of, throwError } from 'rxjs';
import {
  catchError,
  finalize,
  map,
  shareReplay,
  switchMap,
} from 'rxjs/operators';
import { environment } from '../../environments/environment';

import { Router } from '@angular/router';
import { User } from '../user';
import { ConfigService } from '../core/config.service';

// Roles that are allowed to use the doctor application. Sessions/tokens of
// other roles (patient, nurse, guest...) must not give access to this app.
export const DOCTOR_APP_ALLOWED_ROLES = ['doctor', 'admin', 'scheduler'];
export const CLIENT_APP = 'doctor';

@Injectable({ providedIn: 'root' })
export class AuthService {
  public currentUserSubject: BehaviorSubject<any>;
  private loggedIn: Subject<User> = new Subject();
  public currentUser: Observable<User>;
  private currentUserRequest: Observable<User> = null;

  constructor(
    private http: HttpClient,
    private router: Router,
    private configService: ConfigService,
    private socketEventsService: SocketEventsService
  ) {
    this.currentUserSubject = new BehaviorSubject<User>(null);
    this.currentUser = this.currentUserSubject.asObservable();
  }

  public get currentUserValue(): User {
    return this.currentUserSubject.value;
  }

  public loggedInSub() {
    return this.loggedIn;
  }

  /**
   * Returns the user kept in memory or, after a page reload / direct URL,
   * the user of the existing server session (single shared request), so the
   * guards don't have to bounce through the /login page.
   */
  resolveCurrentUser(): Observable<User> {
    if (this.currentUserValue) {
      return of(this.currentUserValue);
    }
    if (!this.currentUserRequest) {
      this.currentUserRequest = this.getCurrentUser().pipe(
        catchError(() => of(null)),
        finalize(() => (this.currentUserRequest = null)),
        shareReplay(1)
      );
    }
    return this.currentUserRequest;
  }

  isAllowedUser(user): boolean {
    return !!user && DOCTOR_APP_ALLOWED_ROLES.includes(user.role);
  }

  /**
   * Called when the backend authenticated a user whose role is not meant for
   * the doctor app: forget the user locally and close the server session that
   * was just created by this login attempt.
   */
  private rejectUser() {
    this.currentUserSubject.next(null);
    this.http.get(`${environment.api}/logout?app=${CLIENT_APP}`).subscribe(
      () => {},
      () => {}
    );
    return throwError(() => this.roleNotAllowedError());
  }

  roleNotAllowedError() {
    return {
      message:
        'This account is not allowed to use the doctor application.',
      code: 'ROLE_NOT_ALLOWED',
    };
  }

  login(token) {
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return this.http
      .get<any>(
        `${environment.api}/current-user?_version=${environment.version}&app=${CLIENT_APP}`,
        { headers }
      )
      .pipe(
        switchMap(res => {
          if (res.user && res.user.token && !this.isAllowedUser(res.user)) {
            return this.rejectUser();
          }
          return of(res);
        }),
        map(res => {
          if (res.user && res.user.token) {
            this.currentUserSubject.next(res.user);
            return res.user;
          }
        })
      );
  }
  storeCurrentUser(user) {
    this.currentUserSubject.next(user);
  }

  verifyRefreshToken() {
    const currentUser = this.currentUserValue;
    const refreshToken = currentUser?.refreshToken;
    return this.http.post<any>(`${environment.api}/verify-refresh-token`, {
      refreshToken,
    });
  }

  refreshTokens() {
    const currentUser = this.currentUserValue;
    const refreshToken = currentUser.refreshToken;
    return this.http.post<any>(`${environment.api}/refresh-token`, {
      refreshToken,
    });
  }

  loginLocal(email, password) {
    const opts = { withCredentials: true };

    return this.http
      .post<any>(
        `${environment.api}/login-local`,
        { email, password, _version: environment.version, _app: CLIENT_APP },
        opts
      )
      .pipe(
        switchMap(res => {
          const role = res.user && res.user.token ? res.user.role : res.role;
          if (role && !DOCTOR_APP_ALLOWED_ROLES.includes(role)) {
            return this.rejectUser();
          }
          return of(res);
        }),
        map(res => {
          if (res.user && res.user.token) {
            this.currentUserSubject.next(res.user);
          }
          return res;
        })
      );
  }

  getResetPasswordLink(email) {
    return this.http.post<any>(
      `${environment.api}/forgot-password`,
      { email },
      {}
    );
  }

  resetPassword(token, password) {
    return this.http.post<any>(
      `${environment.api}/reset-password`,
      { password, token },
      {}
    );
  }

  activateAccount(token, password) {
    return this.http.post<any>(
      `${environment.api}/activate-account`,
      { password, token },
      {}
    );
  }

  loginSms(smsVerificationCode: string, user: string) {
    return this.http.post<any>(`${environment.api}/login-sms`, {
      smsVerificationCode,
      user,
    });
  }

  login2FA(localLoginToken, smsLoginToken, user) {
    const opts = { withCredentials: true };

    return this.http
      .post<any>(
        `${environment.api}/login-2fa`,
        { localLoginToken, smsLoginToken, user, _app: CLIENT_APP },
        opts
      )
      .pipe(
        switchMap(res => {
          if (res.user && res.user.token && !this.isAllowedUser(res.user)) {
            return this.rejectUser();
          }
          return of(res);
        }),
        map(res => {
          if (res.user && res.user.token) {
            // sessionStorage.setItem('currentUser', JSON.stringify(res.user));
            this.currentUserSubject.next(res.user);
            return res.user;
          }
        })
      );
  }

  logout(hard = false) {
    // sessionStorage.removeItem('currentUser');
    this.currentUserSubject.next(null);
    this.socketEventsService.disconnect();
    this.http.get(`${environment.api}/logout?app=${CLIENT_APP}`).subscribe(
      r => {
        if (hard) {
          if (this.configService.config.method === 'openid') {
            window.location.href = this.configService.config.openIdLogoutUri;
          } else {
            this.router.navigate(['/login']);
          }
        } else {
          this.router.navigate(['/login']);
        }
      },
      err => {
        this.router.navigate(['/login']);
      }
    );
  }

  switchUser() {
    localStorage.removeItem('currentUser');
    this.currentUserSubject.next(null);
    this.socketEventsService.disconnect();
    this.http.get(`${environment.api}/logout?app=${CLIENT_APP}`).subscribe(
      () => this.router.navigate(['/login']),
      () => this.router.navigate(['/login'])
    );
  }

  getToken() {
    return this.currentUserSubject.value.token;
  }

  getLang() {
    return (
      window.localStorage.getItem('hhw-lang') ||
      window.navigator.language.slice(0, 2)
    );
  }

  getCurrentUser(token?) {
    const opts = { withCredentials: true };

    return this.http
      .get<any>(`${environment.api}/current-user?app=${CLIENT_APP}`, opts)
      .pipe(
        map(res => {
          // Ignore a session that belongs to a user whose role is not meant for
          // the doctor app (e.g. a patient or nurse logged in on the same origin).
          const user = this.isAllowedUser(res.user) ? res.user : null;
          this.currentUserSubject.next(user);

          return user;
        })
      );
  }
}
