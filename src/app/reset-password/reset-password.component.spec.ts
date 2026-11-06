import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { of, throwError } from 'rxjs';
import { ResetPasswordComponent } from './reset-password.component';
import { AuthService } from '../auth/auth.service';
import { ConfigService } from '../core/config.service';
import { TranslateModule } from '@ngx-translate/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

describe('ResetPasswordComponent', () => {
  let component: ResetPasswordComponent;
  let fixture: ComponentFixture<ResetPasswordComponent>;
  let authService: jasmine.SpyObj<AuthService>;
  let configService: jasmine.SpyObj<ConfigService>;

  beforeEach(async () => {
    const authServiceSpy = jasmine.createSpyObj('AuthService', ['resetPassword', 'activateAccount']);
    const configServiceSpy = jasmine.createSpyObj('ConfigService', [], {
      config: { branding: 'Test', logo: null }
    });

    await TestBed.configureTestingModule({
      declarations: [ResetPasswordComponent],
      imports: [
        ReactiveFormsModule,
        HttpClientTestingModule,
        RouterTestingModule,
        TranslateModule.forRoot(),
        MatFormFieldModule,
        MatInputModule,
        MatButtonModule,
        MatProgressSpinnerModule,
        BrowserAnimationsModule
      ],
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: ConfigService, useValue: configServiceSpy }
      ]
    }).compileComponents();

    authService = TestBed.inject(AuthService) as jasmine.SpyObj<AuthService>;
    configService = TestBed.inject(ConfigService) as jasmine.SpyObj<ConfigService>;
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ResetPasswordComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Token Type Detection', () => {
    it('should detect password-reset token type', () => {
      const mockToken = createMockJWT({ type: 'password-reset', email: 'test@example.com' });
      spyOn(component, 'GetParam').and.returnValue(mockToken);

      fixture.detectChanges();

      expect(component.tokenType).toBe('password-reset');
      expect(component.isActivation).toBe(false);
    });

    it('should detect account-activation token type', () => {
      const mockToken = createMockJWT({ type: 'account-activation', email: 'test@example.com' });
      spyOn(component, 'GetParam').and.returnValue(mockToken);

      fixture.detectChanges();

      expect(component.tokenType).toBe('account-activation');
      expect(component.isActivation).toBe(true);
    });

    it('should set error when token is missing', () => {
      spyOn(component, 'GetParam').and.returnValue('');

      fixture.detectChanges();

      expect(component.error).toBe('token-missing');
    });

    it('should set error when token is invalid', () => {
      spyOn(component, 'GetParam').and.returnValue('invalid-token');

      fixture.detectChanges();

      expect(component.error).toBe('invalid-token');
    });
  });

  describe('Password Reset Flow', () => {
    beforeEach(() => {
      const mockToken = createMockJWT({ type: 'password-reset', email: 'test@example.com' });
      spyOn(component, 'GetParam').and.returnValue(mockToken);
      fixture.detectChanges();
    });

    it('should call resetPassword API for password-reset token', async () => {
      authService.resetPassword.and.returnValue(of({ success: true }));
      component.resetPasswordForm.patchValue({
        password: 'NewPass123',
        confirmPassword: 'NewPass123'
      });

      component.resetPassword();
      await fixture.whenStable();

      expect(authService.resetPassword).toHaveBeenCalled();
      expect(authService.activateAccount).not.toHaveBeenCalled();
      expect(component.success).toBe(true);
      expect(component.error).toBe('');
    });

    it('should handle token-expired error', async () => {
      authService.resetPassword.and.returnValue(
        throwError({ error: { message: 'token-expired' } })
      );
      component.resetPasswordForm.patchValue({
        password: 'NewPass123',
        confirmPassword: 'NewPass123'
      });

      component.resetPassword();
      await fixture.whenStable();

      expect(component.error).toBe('token-expired');
      expect(component.success).toBe(false);
    });

    it('should handle invalid-token error', async () => {
      authService.resetPassword.and.returnValue(
        throwError({ error: { message: 'invalid-token' } })
      );
      component.resetPasswordForm.patchValue({
        password: 'NewPass123',
        confirmPassword: 'NewPass123'
      });

      component.resetPassword();
      await fixture.whenStable();

      expect(component.error).toBe('invalid-token');
    });

    it('should handle password-too-weak error', async () => {
      authService.resetPassword.and.returnValue(
        throwError({ error: { message: 'password-too-weak' } })
      );
      component.resetPasswordForm.patchValue({
        password: 'weak',
        confirmPassword: 'weak'
      });

      component.resetPassword();
      await fixture.whenStable();

      expect(component.error).toBe('password-too-weak');
    });
  });

  describe('Account Activation Flow', () => {
    beforeEach(() => {
      const mockToken = createMockJWT({ type: 'account-activation', email: 'newuser@example.com' });
      spyOn(component, 'GetParam').and.returnValue(mockToken);
      fixture.detectChanges();
    });

    it('should call activateAccount API for account-activation token', async () => {
      authService.activateAccount.and.returnValue(of({ success: true }));
      component.resetPasswordForm.patchValue({
        password: 'NewPass123',
        confirmPassword: 'NewPass123'
      });

      component.resetPassword();
      await fixture.whenStable();

      expect(authService.activateAccount).toHaveBeenCalled();
      expect(authService.resetPassword).not.toHaveBeenCalled();
      expect(component.success).toBe(true);
    });

    it('should handle activation errors', async () => {
      authService.activateAccount.and.returnValue(
        throwError({ error: { message: 'token-expired' } })
      );
      component.resetPasswordForm.patchValue({
        password: 'NewPass123',
        confirmPassword: 'NewPass123'
      });

      component.resetPassword();
      await fixture.whenStable();

      expect(component.error).toBe('token-expired');
      expect(component.success).toBe(false);
    });
  });

  describe('Password Validation', () => {
    beforeEach(() => {
      const mockToken = createMockJWT({ type: 'password-reset', email: 'test@example.com' });
      spyOn(component, 'GetParam').and.returnValue(mockToken);
      fixture.detectChanges();
    });

    it('should validate password strength', () => {
      const passwordControl = component.resetPasswordForm.get('password');

      passwordControl?.setValue('weak');
      expect(passwordControl?.hasError('pattern')).toBe(true);

      passwordControl?.setValue('Strong1');
      expect(passwordControl?.hasError('pattern')).toBe(false);

      passwordControl?.setValue('abcDEF');
      expect(passwordControl?.hasError('pattern')).toBe(false);

      passwordControl?.setValue('abc123');
      expect(passwordControl?.hasError('pattern')).toBe(false);
    });

    it('should validate password confirmation matches', () => {
      component.resetPasswordForm.patchValue({
        password: 'Pass123',
        confirmPassword: 'Different123'
      });

      expect(component.resetPasswordForm.hasError('mustMatch')).toBe(true);

      component.resetPasswordForm.patchValue({
        password: 'Pass123',
        confirmPassword: 'Pass123'
      });

      expect(component.resetPasswordForm.hasError('mustMatch')).toBe(false);
    });
  });

  describe('JWT Decoding', () => {
    it('should decode valid JWT', () => {
      const payload = { type: 'password-reset', email: 'test@example.com' };
      const token = createMockJWT(payload);

      const decoded = component.decodeJWT(token);

      expect(decoded).toBeTruthy();
      expect(decoded.type).toBe('password-reset');
      expect(decoded.email).toBe('test@example.com');
    });

    it('should return null for invalid JWT', () => {
      const decoded = component.decodeJWT('not-a-jwt');
      expect(decoded).toBeNull();
    });

    it('should return null for malformed JWT', () => {
      const decoded = component.decodeJWT('part1.part2');
      expect(decoded).toBeNull();
    });
  });
});

function createMockJWT(payload: any): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  const signature = 'mock-signature';
  return `${header}.${body}.${signature}`;
}
