import { Injectable } from '@angular/core';
import {
  Router,
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
} from '@angular/router';

import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { AuthService } from '../auth/auth.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard {
  constructor(
    private router: Router,
    private authService: AuthService
  ) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> {
    return this.authService.resolveCurrentUser().pipe(
      map(currentUser => {
        if (currentUser && this.authService.isAllowedUser(currentUser)) {
          return true;
        }

        this.router.navigate(['/login'], {
          queryParams: { returnUrl: state.url, ...state.root.queryParams },
        });
        return false;
      })
    );
  }
}
