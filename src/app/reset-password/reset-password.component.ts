import { Component, OnInit } from '@angular/core';
import { FormControl, Validators, UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';

import { MustMatch } from './_helpers/must-match.validator';
import { AuthService } from '../auth/auth.service';
import { ConfigService } from '../core/config.service';

@Component({
  selector: 'app-reset-password',
  templateUrl: './reset-password.component.html',
  styleUrls: ['./reset-password.component.scss']
})
export class ResetPasswordComponent implements OnInit {

  token = "";
  resetPasswordForm: UntypedFormGroup;
  loading = false;
  error = "";
  success = false;
  tokenType: 'password-reset' | 'account-activation' | null = null;
  isActivation = false;

  constructor(private formBuilder: UntypedFormBuilder, private authService: AuthService,
    public configService: ConfigService) { }

  ngOnInit() {
    this.token = this.GetParam("token");

    if (!this.token) {
      this.error = 'token-missing';
      return;
    }

    try {
      const decodedToken = this.decodeJWT(this.token);
      const type = decodedToken?.type;
      
      if (type !== 'password-reset' && type !== 'account-activation') {
        this.error = 'invalid-token';
        return;
      }
      
      this.tokenType = type;
      this.isActivation = this.tokenType === 'account-activation';
    } catch (e) {
      this.error = 'invalid-token';
      return;
    }

    this.resetPasswordForm = this.formBuilder.group({
      token: [this.token],
      password: ['', [Validators.required, Validators.pattern(new RegExp("^(((?=.*[a-z])(?=.*[A-Z]))|((?=.*[a-z])(?=.*[0-9]))|((?=.*[A-Z])(?=.*[0-9])))(?=.{6,})"))]],
      confirmPassword: ['', Validators.required],
    }, {
      validator: MustMatch('password', 'confirmPassword')
    });
  }

  resetPassword() {
    if (this.resetPasswordForm.valid && !this.loading) {
      this.loading = true;
      this.error = '';

      const token = this.resetPasswordForm.get("token").value;
      const password = this.resetPasswordForm.get("password").value;

      // Route to appropriate endpoint based on JWT type decoded in ngOnInit.
      // Backend verifies token type and authorization.
      // DO NOT implement fallback logic (try reset then activation on error).
      const request = this.isActivation
        ? this.authService.activateAccount(token, password)
        : this.authService.resetPassword(token, password);

      request.toPromise().then(result => {
        this.error = '';
        this.success = true;
      }).catch(err => {
        const statusCode = err?.status;
        const errorMessage = err?.error?.message || err?.message || err;
        
        if (statusCode === 429) {
          this.error = 'rate-limit';
        } else if (statusCode === 0 || !navigator.onLine) {
          this.error = 'network-error';
        } else {
          switch (errorMessage) {
            case 'token-missing':
            case 'token-expired':
            case 'invalid-token':
            case 'password-too-weak':
              this.error = errorMessage;
              break;
            default:
              this.error = "unknown";
              break;
          }
        }
      }).finally(() => {
        this.loading = false;
      })
    }
  }

  /**
   * Decode JWT payload for CLIENT-SIDE ROUTING HINT ONLY.
   * Backend is authoritative for token validation, signature, expiry, and purpose.
   * This decode is NOT for authorization - only to determine UI flow and endpoint selection.
   */
  decodeJWT(token: string): any {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }
      const payload = parts[1];
      const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(decoded);
    } catch (e) {
      return null;
    }
  }

  GetParam(name) {
    const results = new RegExp('[\\?&]' + name + '=([^&#]*)').exec(window.location.href);
    if (!results) {
      return '';
    }
    return results[1] || '';
  }
}
