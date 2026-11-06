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
      this.tokenType = decodedToken?.type || null;
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
    if (this.resetPasswordForm.valid) {
      this.loading = true;
      this.error = '';

      const token = this.resetPasswordForm.get("token").value;
      const password = this.resetPasswordForm.get("password").value;

      const request = this.isActivation
        ? this.authService.activateAccount(token, password)
        : this.authService.resetPassword(token, password);

      request.toPromise().then(result => {
        this.error = '';
        this.success = true;
      }).catch(err => {
        const errorMessage = err?.error?.message || err?.message || err;
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
      }).finally(() => {
        this.loading = false;
      })
    }
  }

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
