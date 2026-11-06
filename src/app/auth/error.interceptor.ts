import { Injectable } from "@angular/core";
import {
  HttpEvent,
  HttpHandler,
  HttpRequest,
  HttpInterceptor,
} from "@angular/common/http";
import { catchError } from "rxjs/operators";
import { Observable, throwError } from "rxjs";
import { MatDialog } from "@angular/material/dialog";
import { TranslateService } from "@ngx-translate/core";

import { AuthService } from "./auth.service";
import { ErrorDialogComponent } from '../error-dialog/error-dialog.component';

@Injectable()
export class ErrorInterceptor implements HttpInterceptor {
  constructor(
    private dialog: MatDialog,
    private authService: AuthService,
    private translate: TranslateService,
  ) {}

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(request).pipe(
      catchError((err: any) => {
        console.log("Error encountered:", err);

        // A failed REST request (status 0 / "Unknown Error") does NOT mean the
        // WebSocket is down. Flagging it as a socket "connect_failed" showed the
        // misleading "connection lost / you can no longer receive consultations"
        // banner while the socket was still connected. The banner is now driven
        // solely by real socket events (see SocketEventsService).

        const refreshTokenEndpoint = 'refresh-token';
        if (err.status === 401 && request.url.includes(refreshTokenEndpoint)) {
          this.authService.logout();
        }

        const excludedExtensions = ['.json', '.md', '.txt', '.svg', 'verify-refresh-token'];
        const shouldSkipPopup = excludedExtensions.some(ext => request.url.endsWith(ext));

        if (shouldSkipPopup) {
          return throwError(() => err);
        }

        let titleKey = 'error.defaultTitle';
        let messageKey = 'error.defaultMessage';

        if (err) {
          if (err.error?.error && err.error?.text?.includes('<html>')) {
            titleKey = 'error.blockedTitle';
            const title = this.translate.instant(titleKey);
            const message = err.error.text

            this.dialog.open(ErrorDialogComponent, {
              data: {
                title,
                message,
                isHtml: true
              }
            });
          }
        }

        return throwError(() => err);
      })
    );
  }
}
