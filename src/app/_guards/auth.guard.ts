import { Injectable } from '@angular/core';
import {
  Router,
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
} from '@angular/router';

import { AuthService } from '../auth/auth.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard {
  constructor(
    private router: Router,
    private authService: AuthService
  ) {}

  private readonly allowedRoles = ['doctor', 'scheduler', 'admin'];

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot) {
    const currentUser = this.authService.currentUserValue;
    if (currentUser && this.allowedRoles.includes(currentUser.role)) {
      return true;
    }
    if (currentUser && !this.allowedRoles.includes(currentUser.role)) {
      this.authService.logout(true);
      return false;
    }
    this.router.navigate(['/login'], {
      queryParams: { returnUrl: state.url, ...state.root.queryParams },
    });
    return false;
  }
}
