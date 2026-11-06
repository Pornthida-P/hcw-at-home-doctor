import {
  AbstractControl,
  ValidatorFn,
  Validators,
  ValidationErrors,
} from '@angular/forms';
import { PhoneNumberUtil } from 'google-libphonenumber';

export const phoneNumberRegex = new RegExp(/^(\+|00)[0-9 ]+$/);

const localThaiPhoneRegex = new RegExp(/^0[0-9][0-9 ().-]{6,14}$/);
const internationalPhoneRegex = new RegExp(/^(\+|00)[0-9 ().-]+$/);
const thaiCountryCodeRegex = new RegExp(/^66[0-9]{8,9}$/);

export function normalizeThaiPhoneNumber(value: any): any {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes('@')) {
    return value;
  }
  const digits = trimmed.replace(/[\s().-]/g, '');
  let candidate = '';
  if (localThaiPhoneRegex.test(trimmed) && /^0[0-9]{8,9}$/.test(digits)) {
    candidate = '+66' + digits.substring(1);
  } else if (/^00[1-9][0-9]{6,14}$/.test(digits)) {
    candidate = '+' + digits.substring(2);
  } else if (thaiCountryCodeRegex.test(digits)) {
    candidate = '+' + digits;
  } else if (internationalPhoneRegex.test(trimmed) && /[().-]/.test(trimmed)) {
    candidate = digits;
  } else {
    return value;
  }
  try {
    const phoneUtil = PhoneNumberUtil.getInstance();
    if (phoneUtil.isValidNumber(phoneUtil.parse(candidate))) {
      return candidate;
    }
  } catch (error) {}
  return value;
}

export function phoneOrEmailValidator(): ValidatorFn {
  const phoneUtil = PhoneNumberUtil.getInstance();

  return (control: AbstractControl): ValidationErrors | null => {
    if (!control.value) {
      return null;
    }

    const value = normalizeThaiPhoneNumber(control.value);
    const looksLikeLocalPhone =
      typeof control.value === 'string' &&
      !control.value.includes('@') &&
      /^[0-9 ().+-]+$/.test(control.value.trim());

    if (phoneNumberRegex.test(value) || looksLikeLocalPhone) {
      try {
        const number = phoneUtil.parse(value);
        const isValid = phoneUtil.isValidNumber(number);
        return isValid ? null : { emailOrPhoneControl: true };
      } catch (error) {
        return { emailOrPhoneControl: true };
      }
    } else {
      return Validators.email(control);
    }
  };
}
