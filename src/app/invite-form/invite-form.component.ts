import { TranslateService } from '@ngx-translate/core';
import { TranslationOrganizationService } from '../core/translation-organization.service';
import { QueueService } from '../core/queue.service';
import { of, Subscription } from 'rxjs';
import { InviteService } from '../core/invite.service';
import { Component, Inject, OnDestroy, OnInit } from '@angular/core';
import {
  NgForm,
  FormArray,
  FormGroup,
  Validators,
  FormBuilder,
  FormControl,
  AbstractControl,
  UntypedFormGroup,
  UntypedFormControl,
  UntypedFormBuilder,
  FormGroupDirective,
} from '@angular/forms';
import * as moment from 'moment-timezone';
import { ErrorStateMatcher } from '@angular/material/core';
import { ConfigService } from '../core/config.service';
import {
  MatDialog,
  MatDialogRef,
  MAT_DIALOG_DATA,
} from '@angular/material/dialog';
import {
  phoneNumberRegex,
  phoneOrEmailValidator,
  normalizeThaiPhoneNumber,
} from '../shared/validators/phone-number-validator';
import { catchError, filter, switchMap } from 'rxjs/operators';
import { InviteLinkComponent } from '../invite-link/invite-link.component';
import { ConfirmationDialogComponent } from '../confirmation-dialog/confirmation-dialog.component';
import { TwilioWhatsappConfig } from '../../utils/twillo-whatsapp-config';
import { validateIf } from '../shared/validators/validate-if.validator';
import { IStepOption, TourService } from 'ngx-ui-tour-md-menu';
import { Direction, EventName, TourType } from '../models/tour';
import { SidenavToggleService } from '../core/sidenav-toggle.service';
import {DEFAULT_REQUIRED_FIELDS, MessageService} from "../contstants/invitations";
import { APP_LANGUAGES } from '../i18n/i18n.module';

interface DialogData {
  phoneNumber: string;
  messageService: MessageService;
  emailAddress: string;
  firstName: string;
  lastName: string;
  gender: string;
  queue: string;
  scheduledFor: Date | string;
  language: string;
  guestContact: string;
  patientContact: string;
  guestEmailAddress: string;
  guestPhoneNumber: string;
  guestMessageService: string;
  translationOrganization: string;
  doctorLanguage: string;
  isPatientInvite: boolean;
  edit: boolean;
  id?: string;
  status: string;
  inviteObj: any;
  experts: string[];
  sendLinkManually: boolean;
  patientTZ: string;
  metadata: { [key: string]: any };
}

export class MyErrorStateMatcher implements ErrorStateMatcher {
  isErrorState(
    control: UntypedFormControl | null,
    form: FormGroupDirective | NgForm | null
  ): boolean {
    const isSubmitted = form && form.submitted;
    return !!(
      control &&
      control.invalid &&
      (control.dirty || control.touched || isSubmitted)
    );
  }
}

@Component({
  selector: 'app-invite-form',
  templateUrl: './invite-form.component.html',
  styleUrls: ['./invite-form.component.scss'],
})
export class InviteFormComponent implements OnDestroy, OnInit, OnDestroy {
  isPatientInvite = true;
  matcher = new MyErrorStateMatcher();
  // only show errors once the user interacted with the field (not right after ticking a checkbox)
  touchedMatcher: ErrorStateMatcher = {
    isErrorState: (control: UntypedFormControl | null) =>
      !!(control && control.invalid && (control.dirty || control.touched)),
  };
  loading = false;
  createInviteSub: Subscription;
  error = '';
  myForm;
  queues = [];
  getQueuesSub;
  schedule = false;
  inviteTranslator = false;
  inviteGuest = false;
  now = new Date();
  languages = [];
  translationOrganizations;
  subscriptions: Subscription[] = [];
  isSubmitted = false;
  edit = false;
  showRadioGroup = false;
  showSuccessMessage = '';
  showGuestRadioGroup = false;
  showGuestSuccessMessage = '';
  selectedTimezone = '';
  wasSentManually = false;

  constructor(
    private fb: FormBuilder,
    public dialog: MatDialog,
    private tourService: TourService,
    private queueServ: QueueService,
    public translate: TranslateService,
    public configService: ConfigService,
    private inviteService: InviteService,
    private formBuilder: UntypedFormBuilder,
    @Inject(MAT_DIALOG_DATA) public data: DialogData,
    private sidenavToggleService: SidenavToggleService,
    public dialogRef: MatDialogRef<InviteFormComponent>,
    private translationOrganizationService: TranslationOrganizationService
  ) {
    this.dialogRef.updateSize('100%', '100%');
    this.edit = data.edit;
    if (!this.data.emailAddress) {
      this.data.emailAddress = '';
    }
    if (!this.data.phoneNumber) {
      this.data.phoneNumber = '';
    }
    if (this.edit) {
      // restore the existing contact and delivery method when editing an invite
      this.data.patientContact =
        this.data.patientContact || this.data.emailAddress || this.data.phoneNumber || '';
      this.wasSentManually =
        this.data.messageService === '4' || (!this.data.emailAddress && !this.data.phoneNumber);
    }
    if (this.data.scheduledFor) {
      this.data.scheduledFor = new Date(this.data.scheduledFor);
      this.schedule = true;
    } else {
      this.data.scheduledFor = new Date();
      this.data.patientTZ = '';
    }

    if (this.data.guestContact) {
      this.inviteGuest = true;
    }

    if (this.data.translationOrganization) {
      this.inviteTranslator = true;
    }

    this.data.metadata = this.data.metadata || {};
    this.selectedTimezone = this.data.patientTZ || moment.tz.guess();
  }

  get expertsFormArray() {
    return this.myForm.get('experts') as FormArray;
  }

  addExpert() {
    this.expertsFormArray.push(
      this.fb.group({
        expertContact: [
          '',
          [
            phoneOrEmailValidator(),
            this.expertContactValidatorValidator.bind(this),
          ],
        ],
        messageService: [''],
        showRadioGroup: [false],
        showSuccessMessage: [''],
      })
    );
    this.handleValueChanges();
  }

  removeExpert(index: number) {
    this.expertsFormArray.removeAt(index);
  }

  createFormGroup() {
    const enabledFieldsRaw = this.configService.config?.enableFieldsFormDoctor;
    const enabledFields = (enabledFieldsRaw && enabledFieldsRaw.length)
        ? enabledFieldsRaw
        : DEFAULT_REQUIRED_FIELDS;

    const queueValidators = this.configService.config?.requireSharedQueue ? [Validators.required] : [];
    const queueFormControl = new UntypedFormControl(undefined, queueValidators);

    this.myForm = this.formBuilder.group(
      {
        patientContactFormControl: new UntypedFormControl(
          '',
          this.isPatientInvite
            ? [Validators.required, phoneOrEmailValidator()]
            : []
        ),
        messageService: new UntypedFormControl(),
        emailFormControl: new UntypedFormControl(
          '',
          this.isPatientInvite ? [Validators.email] : []
        ),
        phoneNumberFormControl: new UntypedFormControl(
          '',
          this.isPatientInvite ? [Validators.pattern(phoneNumberRegex)] : []
        ),
        firstNameFormControl: new UntypedFormControl(
            '',
            this.isPatientInvite
                ? [validateIf(() => enabledFields.includes('firstName'), Validators.required)]
                : []
        ),
        lastNameFormControl: new UntypedFormControl(
            '',
            this.isPatientInvite
                ? [validateIf(() => enabledFields.includes('lastName'), Validators.required)]
                : []
        ),
        genderFormControl: new UntypedFormControl(
            '',
            this.isPatientInvite
                ? [validateIf(() => enabledFields.includes('gender'), Validators.required)]
                : []
        ),
        languageFormControl: new UntypedFormControl(
          'en',
          this.isPatientInvite ? [Validators.required] : []
        ),
        dateTimeFormControl: new UntypedFormControl(''),
        patientTZ: new UntypedFormControl(
          this.data.patientTZ || this.selectedTimezone
        ),
        isScheduled: new UntypedFormControl(false),
        sendLinkManually: new UntypedFormControl(false),
        inviteTranslatorFormControl: new UntypedFormControl(false),
        inviteGuestFormControl: new UntypedFormControl(false),
        guestContactFormControl: new UntypedFormControl('', [
          phoneOrEmailValidator(),
          this.guestContactValidatorValidator.bind(this),
        ]),
        guestContactMessageService: new UntypedFormControl(),
        inviteExpert: new UntypedFormControl(false),
        experts: this.fb.array([
          this.fb.group({
            expertContact: [
              '',
              [this.expertContactValidatorValidator.bind(this)],
            ],
            messageService: [''],
            showRadioGroup: [false],
            showSuccessMessage: [false],
          }),
        ]),
        translationOrganizationFormControl: new UntypedFormControl(null, [
          validateIf(
            (group: FormControl) => group.value.inviteTranslatorFormControl,
            Validators.compose([Validators.required])
          ),
        ]),
        queueFormControl,
      },
      {
        validators: this.atLeastAGuestOrTranslator.bind(this),
      }
    );

    if (this.configService.config?.formMeta?.length) {
      this.configService.config.formMeta.forEach((field: string) => {
        if (!this.myForm.contains(field)) {
          this.myForm.addControl(
            field,
            new FormControl(this.data.metadata[field] || '')
          );
        }
      });
    }

    (window as any).myForm = this.myForm;

    this.myForm.get('inviteExpert').valueChanges.subscribe(value => {
      (this.myForm.get('experts') as FormArray).controls.forEach(control => {
        const expertContactControl = control.get('expertContact');
        if (value) {
          expertContactControl.setValidators([
            phoneOrEmailValidator(),
            this.expertContactValidatorValidator.bind(this),
          ]);
        } else {
          expertContactControl.setValidators([
            this.expertContactValidatorValidator.bind(this),
          ]);
        }
        expertContactControl.updateValueAndValidity();
      });
    });

    this.myForm.get('inviteGuestFormControl').valueChanges.subscribe(value => {
      const control = this.myForm.get('guestContactFormControl');
      if (value) {
        control.setValidators([
          phoneOrEmailValidator(),
          this.guestContactValidatorValidator.bind(this),
        ]);
      } else {
        control.setValidators([this.guestContactValidatorValidator.bind(this)]);
      }
      control.updateValueAndValidity();
    });

    this.myForm.get('sendLinkManually').valueChanges.subscribe(value => {
      const control = this.myForm.get('patientContactFormControl');
      if (value) {
        control.disable();
        control.setValidators([]);
        control.setValue('');
        control.updateValueAndValidity();
      } else {
        control.enable();
        control.setValidators([Validators.required, phoneOrEmailValidator()]);
        control.updateValueAndValidity();
      }
    });

    this.myForm
      .get('patientContactFormControl')
      .valueChanges.subscribe(value => {
        this.valueChangesPatientContactAndScheduled();
      });

    this.myForm.get('isScheduled').valueChanges.subscribe(value => {
      if (!this.showRadioGroup) {
        this.valueChangesPatientContactAndScheduled();
      }
      this.sendInviteExperts();
      this.valueChangesGuestContactFormControl();
    });

    this.myForm.get('guestContactFormControl').valueChanges.subscribe(value => {
      this.valueChangesGuestContactFormControl();
    });

    this.myForm.get('languageFormControl').valueChanges.subscribe(value => {
      this.valueChangesPatientContactAndScheduled();
      this.sendInviteExperts();
      this.valueChangesGuestContactFormControl();
    });

    if (this.isPatientInvite && this.edit && this.wasSentManually) {
      this.myForm.get('sendLinkManually').setValue(true);
    }

    this.handleValueChanges();
  }

  valueChangesGuestContactFormControl(): void {
    const guestContactFormControl = this.myForm.get('guestContactFormControl');
    const languageFormControl = this.myForm.get('languageFormControl');
    const isScheduledControl = this.myForm.get('isScheduled');
    const messageServiceControl = this.myForm.get('guestContactMessageService');
    const type = isScheduledControl.value
      ? TwilioWhatsappConfig.scheduledGuestInvite
      : TwilioWhatsappConfig.guestInvite;
    if (phoneNumberRegex.test(guestContactFormControl.value)) {
      if (guestContactFormControl.valid) {
        setTimeout(() => {
          const { value } = this.myForm.get('guestContactFormControl');
          this.inviteService
            .checkPrefix(value, languageFormControl.value, type)
            .subscribe({
              next: res => {
                switch (res.status) {
                  case 0:
                    guestContactFormControl.setErrors({ cantSend: true });
                    break;
                  case 1:
                    this.showGuestSuccessMessage = res.message;
                    this.resetValidators(true, 'guestContactMessageService');
                    this.showGuestRadioGroup = true;
                    break;
                  case 2:
                    this.showGuestSuccessMessage = res.message;
                    messageServiceControl.setValidators([]);
                    messageServiceControl.setValue('1');
                    messageServiceControl.updateValueAndValidity();
                    break;
                  case 3:
                    this.showGuestSuccessMessage = res.message;
                    messageServiceControl.setValidators([]);
                    messageServiceControl.setValue('2');
                    messageServiceControl.updateValueAndValidity();
                    break;
                }
              },
            });
        }, 100);
      }
      this.resetValidators(false, 'guestContactMessageService');
      this.showGuestRadioGroup = false;
      this.showGuestSuccessMessage = '';
    }
  }

  valueChangesPatientContactAndScheduled(): void {
    const controlPatientContact = this.myForm.get('patientContactFormControl');
    const languageFormControl = this.myForm.get('languageFormControl');
    const controlScheduledCheckbox = this.myForm.get('isScheduled');
    const messageServiceControl = this.myForm.get('messageService');
    const type = controlScheduledCheckbox.value
      ? TwilioWhatsappConfig.scheduledPatientInvite
      : TwilioWhatsappConfig.patientInvite;
    if (phoneNumberRegex.test(controlPatientContact.value)) {
      if (controlPatientContact.valid) {
        setTimeout(() => {
          const { value } = this.myForm.get('patientContactFormControl');
          this.inviteService
            .checkPrefix(value, languageFormControl.value, type)
            .subscribe({
              next: res => {
                switch (res.status) {
                  case 0:
                    controlPatientContact.setErrors({ cantSend: true });
                    break;
                  case 1:
                    this.showSuccessMessage = res.message;
                    this.resetValidators(true, 'messageService');
                    this.showRadioGroup = true;
                    break;
                  case 2:
                    this.showSuccessMessage = res.message;
                    messageServiceControl.setValidators([]);
                    messageServiceControl.setValue('1');
                    messageServiceControl.updateValueAndValidity();
                    break;
                  case 3:
                    this.showSuccessMessage = res.message;
                    messageServiceControl.setValidators([]);
                    messageServiceControl.setValue('2');
                    messageServiceControl.updateValueAndValidity();
                    break;
                }
              },
            });
        }, 100);
      }
      this.resetValidators(false, 'messageService');
      this.showRadioGroup = false;
      this.showSuccessMessage = '';
    }
  }

  sendInviteExperts(): void {
    this.expertsFormArray.controls.forEach((group: FormGroup, index) => {
      const expertControl = group.get('expertContact');
      const showRadio = group.get('showRadioGroup');
      const showSuccessMessage = group.get('showSuccessMessage');
      const messageService = group.get('messageService');
      const languageFormControl = this.myForm.get('languageFormControl');
      const isScheduledControl = this.myForm.get('isScheduled');

      showRadio.setValue(false);
      showSuccessMessage.setValue('');
      messageService.setValue('');
      messageService.setValidators([]);
      messageService.updateValueAndValidity();

      const value = expertControl.value;
      const type = isScheduledControl.value
        ? TwilioWhatsappConfig.scheduledGuestInvite
        : TwilioWhatsappConfig.guestInvite;

      if (phoneNumberRegex.test(value) && expertControl.valid) {
        this.inviteService
          .checkPrefix(
            value,
            languageFormControl.value,
            type
          )
          .pipe(
            catchError(err => {
              console.error(err);
              return of(null);
            })
          )
          .subscribe(res => {
            if (res) {
              switch (res.status) {
                case 0:
                  expertControl.setErrors({ cantSend: true });
                  break;
                case 1:
                  showSuccessMessage.setValue(res.message);
                  showRadio.setValue(true, { emitEvent: false });
                  messageService.setValidators([Validators.required]);
                  messageService.updateValueAndValidity();
                  break;
                case 2:
                  showSuccessMessage.setValue(res.message);
                  messageService.setValidators([]);
                  messageService.setValue('1');
                  messageService.updateValueAndValidity();
                  break;
                case 3:
                  showSuccessMessage.setValue(res.message);
                  messageService.setValidators([]);
                  messageService.setValue('2');
                  messageService.updateValueAndValidity();
                  break;
              }
            }
          });
      }
    });
  }

  handleValueChanges(): void {
    this.expertsFormArray.controls.forEach((group: FormGroup, index) => {
      const expertControl = group.get('expertContact');
      const showRadio = group.get('showRadioGroup');
      const showSuccessMessage = group.get('showSuccessMessage');
      const messageService = group.get('messageService');
      const languageFormControl = this.myForm.get('languageFormControl');
      const isScheduledControl = this.myForm.get('isScheduled');

      expertControl.valueChanges
        .pipe(
          filter(value => {
            showRadio.setValue(false);
            showSuccessMessage.setValue('');
            messageService.setValue('');
            messageService.setValidators([]);
            messageService.updateValueAndValidity();
            return phoneNumberRegex.test(value) && expertControl.valid;
          }),
          switchMap(value => {
            const type = isScheduledControl.value
              ? TwilioWhatsappConfig.scheduledGuestInvite
              : TwilioWhatsappConfig.guestInvite;
            return this.inviteService
              .checkPrefix(
                value,
                languageFormControl.value,
                type
              )
              .pipe(
                catchError(err => {
                  console.error(err);
                  return of(null);
                })
              );
          })
        )
        .subscribe(res => {
          if (res) {
            switch (res.status) {
              case 0:
                expertControl.setErrors({ cantSend: true });
                break;
              case 1:
                showSuccessMessage.setValue(res.message);
                showRadio.setValue(true, { emitEvent: false });
                messageService.setValidators([Validators.required]);
                messageService.updateValueAndValidity();
                break;
              case 2:
                showSuccessMessage.setValue(res.message);
                messageService.setValidators([]);
                messageService.setValue('1');
                messageService.updateValueAndValidity();
                break;
              case 3:
                showSuccessMessage.setValue(res.message);
                messageService.setValidators([]);
                messageService.setValue('2');
                messageService.updateValueAndValidity();
                break;
            }
          }
        });
    });
  }

  guestContactValidatorValidator(control: AbstractControl) {
    if (!this.myForm?.get('inviteGuestFormControl')?.value) {
      return null;
    }
    if (!control.value) {
      return { required: true };
    }

    return null;
  }

  expertContactValidatorValidator(control: AbstractControl) {
    if (!this.myForm?.get('inviteExpert')?.value) {
      return null;
    }

    if (!control.value) {
      return { required: true };
    }

    return null;
  }

  resetValidators(set: boolean, formControl: string) {
    if (set) {
      const control = this.myForm.get(formControl);
      control.setValidators([Validators.required]);
      control.updateValueAndValidity();
    } else {
      const control = this.myForm.get(formControl);
      control.setValidators([]);
      control.setValue('');
      control.updateValueAndValidity();
    }
  }

  changeTel() {
    if (this.data.phoneNumber.trim().length > 0) {
      this.myForm.controls.emailFormControl.disable();
      this.data.emailAddress = '';
    } else {
      this.myForm.controls.emailFormControl.enable();
    }
  }

  ngOnInit() {
    this.listenToTourSubscriptions();

    this.dialogRef.updateSize('50%', '50%');
    this.data.doctorLanguage = window.localStorage.getItem('hhw-lang');

    if (this.data.patientContact || this.data.firstName || (this.edit && this.wasSentManually)) {
      this.showPatientForm();
    }
    this.loading = true;
    this.subscriptions.push(
      this.translationOrganizationService
        .getTranslationOrganizations()
        .subscribe(translationOrganizations => {
          this.translationOrganizations = translationOrganizations;
          this.loading = false;
        })
    );

    this.translationOrganizationService.getLanguages().subscribe({
      next: res => {
        if (res?.length) {
          this.languages = res.filter(l => APP_LANGUAGES.includes(l)).map(l => {
            return {
              code: l,
              translated: this.translate.instant('inviteForm.' + l),
            };
          });
          const browserLanguage = this.translate.getBrowserLang();
          const supportedLanguage = this.languages.find(
            i => i.code === browserLanguage
          );
          if (this.data.language && APP_LANGUAGES.includes(this.data.language)) {
            return;
          }
          if (APP_LANGUAGES.includes(this.configService.config?.defaultPatientLocale)) {
            this.data.language = this.configService.config.defaultPatientLocale;
          } else if (supportedLanguage) {
            this.data.language = supportedLanguage.code;
          } else {
            this.data.language = APP_LANGUAGES[0];
          }
        }
      },
      error: err => {
        console.log(err, 'err');
      },
    });
  }

  showTierFrom() {
    this.isPatientInvite = false;
    this.dialogRef.updateSize('70%', '83%');

    this.queues = [];
    this.inviteGuest = true;

    this.createFormGroup();
  }

  showPatientForm() {
    this.isPatientInvite = true;

    this.loading = true;
    this.getQueuesSub = this.queueServ.getQueues().subscribe(queues => {
      this.loading = false;
      this.queues = queues;

      this.createFormGroup();
      this.dialogRef.updateSize('70%', '83%');
    });
  }

  atLeastAGuestOrTranslator(group: UntypedFormGroup): { [s: string]: boolean } {
    if (!this.isPatientInvite) {
      if (group) {
        if (
          group.controls.guestContactFormControl.value ||
          group.controls.translationOrganizationFormControl.value
        ) {
          return null;
        }
      }
      if (
        this.isSubmitted ||
        group.controls.guestContactFormControl.touched ||
        group.controls.translationOrganizationFormControl.touched
      ) {
        return { atLeastAGuestOrTranslator: true };
      }
    }
    return null;
  }

  onNoClick(): void {
    this.dialogRef.close();
  }

  get isSwitchingFromManual(): boolean {
    return (
      this.isPatientInvite &&
      this.edit &&
      this.wasSentManually &&
      !this.myForm?.get('sendLinkManually')?.value
    );
  }

  normalizePhoneControl(control: AbstractControl, field?: string) {
    if (!control) {
      return;
    }
    const value = control.value;
    const normalized = normalizeThaiPhoneNumber(value);
    if (normalized !== value) {
      if (field) {
        this.data[field] = normalized;
      }
      control.setValue(normalized);
    }
  }

  normalizeContactFields() {
    this.normalizePhoneControl(this.myForm.get('patientContactFormControl'), 'patientContact');
    this.normalizePhoneControl(this.myForm.get('guestContactFormControl'), 'guestContact');
    this.expertsFormArray.controls.forEach(group => {
      this.normalizePhoneControl(group.get('expertContact'));
    });
  }

  onSubmit() {
    this.normalizeContactFields();
    if (!this.myForm.valid) {
      return;
    }

    if (this.loading) {
      return;
    }

    if (this.isSwitchingFromManual) {
      const confirmRef = this.dialog.open(ConfirmationDialogComponent, {
        id: 'confirmation_dialog',
        data: {
          question: this.translate.instant('inviteForm.confirmSwitchFromManual'),
          yesText: this.translate.instant('inviteForm.confirmSwitchFromManualYes'),
          noText: this.translate.instant('inviteForm.confirmSwitchFromManualNo'),
          title: this.translate.instant('inviteForm.confirmSwitchFromManualTitle'),
        },
        autoFocus: false,
      });
      confirmRef.afterClosed().subscribe(result => {
        if (result) {
          this.submitInvite();
        }
      });
      return;
    }

    this.submitInvite();
  }

  submitInvite() {
    if (this.loading) {
      return;
    }
    this.normalizeContactFields();
    this.loading = true;
    this.isSubmitted = true;

    const { value } = this.myForm;
    const isPatientContactAnPhoneNumber = phoneNumberRegex.test(
      this.data.patientContact
    );
    if (this.isPatientInvite && this.myForm.get('sendLinkManually').value) {
      this.data.patientContact = '';
      this.data.phoneNumber = '';
      this.data.emailAddress = '';
      this.data.messageService = MessageService.manual;
    } else if (isPatientContactAnPhoneNumber) {
      this.data.phoneNumber = this.data.patientContact;
      this.data.emailAddress = '';
      this.data.messageService =
        value.messageService ||
        (this.data.messageService === MessageService.whatsapp
          ? MessageService.whatsapp
          : MessageService.sms);
    } else {
      this.data.emailAddress = this.data.patientContact || '';
      this.data.phoneNumber = '';
      this.data.messageService = this.data.emailAddress
        ? MessageService.email
        : this.data.messageService;
    }

    if (
      this.inviteGuest &&
      this.data.guestContact &&
      value.inviteGuestFormControl
    ) {
      const isGuestContactAPhoneNumber = phoneNumberRegex.test(
        this.data.guestContact
      );
      if (isGuestContactAPhoneNumber) {
        this.data.guestPhoneNumber = this.data.guestContact;
        this.data.guestMessageService = value.guestContactMessageService;
      } else {
        this.data.guestEmailAddress = this.data.guestContact;
      }
    }
    if (!this.inviteTranslator) {
      this.data.translationOrganization = undefined;
    }

    if (this.schedule) {
      this.data.patientTZ = this.myForm.get('patientTZ').value;
    } else {
      this.data.scheduledFor = '';
    }

    this.data.experts = null;
    if (this.myForm.get('inviteExpert').value) {
      this.data.experts = this.myForm.get('experts').value.filter(expert => {
        const value = expert.expertContact;
        return (
          value !== null &&
          value !== '' &&
          value !== undefined &&
          value?.trim() !== ''
        );
      });
    }

    if (!this.myForm.valid || this.atLeastAGuestOrTranslator(this.myForm)) {
      // this to show error messages
      this.validateAllFormFields(this.myForm);

      if (!this.myForm.valid || this.atLeastAGuestOrTranslator(this.myForm)) {
        this.loading = false;
        return;
      }
    }

    this.data.isPatientInvite = this.isPatientInvite;
    this.data.sendLinkManually = this.myForm.get('sendLinkManually').value;

    if (this.configService.config?.formMeta?.length) {
      this.configService.config.formMeta.forEach(field => {
        const control = this.myForm.get(field);
        if (control) {
          this.data.metadata[field] = control.value;
        }
      });
    }

    if (this.edit) {
      let cancelScheduledFor = false;
      let cancelGuestInvite = false;
      let cancelTranslationRequestInvite = false;

      if (this.data.inviteObj.scheduledFor && !this.schedule) {
        cancelScheduledFor = true;
      }
      if (this.data.inviteObj.guestInvite && !this.inviteGuest) {
        cancelGuestInvite = true;
      }

      if (
        this.data.inviteObj.translationOrganization &&
        !this.inviteTranslator
      ) {
        cancelTranslationRequestInvite = true;
      }

      const {
        firstName,
        lastName,
        emailAddress,
        phoneNumber,
        scheduledFor,
        queue,
        translationOrganization,
        gender,
        language,
        guestEmailAddress,
        guestPhoneNumber,
        patientTZ,
        messageService,
        sendLinkManually,
        metadata,
      } = this.data;

      this.inviteService
        .updateInvite(
          {
            firstName,
            lastName,
            emailAddress,
            phoneNumber,
            scheduledFor,
            queue,
            translationOrganization,
            gender,
            language,
            guestEmailAddress,
            guestPhoneNumber,
            cancelGuestInvite,
            cancelScheduledFor,
            cancelTranslationRequestInvite,
            patientTZ,
            sendLinkManually,
            messageService,
            metadata,
          },
          this.data.id
        )
        .subscribe(
          res => {
            this.dialogRef.close(true);
            if (this.data.sendLinkManually && res?.invite?.patientURL) {
              this.dialog.open(InviteLinkComponent, {
                width: '600px',
                data: { link: res.invite.patientURL },
                autoFocus: false,
              });
            }
          },
          err => {
            this.loading = false;

            this.error =
              err.details ||
              err.error?.message ||
              err.message ||
              err.error?.error ||
              err.statusText ||
              err;
          }
        );
    } else {
      this.createInviteSub = this.inviteService
        .createInvitation(this.data)
        .subscribe(
          res => {
            this.dialogRef.close(true);
            if (this.data.sendLinkManually && res?.invite?.patientURL) {
              this.dialog.open(InviteLinkComponent, {
                width: '600px',
                data: { link: res.invite.patientURL },
                autoFocus: false,
              });
            }
          },
          err => {
            this.loading = false;

            this.error =
              err.details ||
              err.error?.message ||
              err.error?.error ||
              err.message ||
              err.statusText ||
              err;
          }
        );
    }
  }

  ngOnDestroy() {
    if (this.createInviteSub) {
      this.createInviteSub.unsubscribe();
    }
    if (this.getQueuesSub) {
      this.getQueuesSub.unsubscribe();
    }
    this.subscriptions.forEach(subscription => {
      subscription.unsubscribe();
    });
  }

  validateAllFormFields(formGroup: UntypedFormGroup) {
    Object.keys(formGroup.controls).forEach(field => {
      const control = formGroup.get(field);
      if (control instanceof UntypedFormControl) {
        control.markAsTouched({ onlySelf: true });
        control.updateValueAndValidity();
      } else if (control instanceof UntypedFormGroup) {
        this.validateAllFormFields(control);
      }
    });
  }

  languageSelectChanged() {
    this.data.translationOrganization = null;
  }

  onDateTimeSelected(dateTime: any) {
    this.myForm.get('dateTimeFormControl').setValue(dateTime);
    this.data.scheduledFor = dateTime;
  }

  onTimeZoneSelect(timezone: string) {
    this.data.patientTZ = timezone;
    this.selectedTimezone = timezone;
    this.myForm.get('patientTZ').setValue(timezone);
  }

  listenToTourSubscriptions() {
    this.subscriptions.push(
      this.tourService.events$.subscribe(events => {
        const value = events.value as {
          step: IStepOption;
          direction: Direction;
        };
        if (
          events.name === EventName.StepHide &&
          value &&
          value.step &&
          value.step.anchorId === TourType.REMOTE_PATIENT_INVITE &&
          value.direction === Direction.Forwards
        ) {
          this.showPatientForm();
        }
        if (
          events.name === EventName.StepHide &&
          value &&
          value.step &&
          value.step.anchorId === TourType.REMOTE_PATIENT_INVITE &&
          value.direction === Direction.Backwards
        ) {
          this.onNoClick();
        }
        if (
          events.name === EventName.StepHide &&
          value &&
          value.step &&
          value.step.anchorId === TourType.INVITE_FORM_CONTACT_INPUT &&
          value.direction === Direction.Backwards
        ) {
          this.isPatientInvite = false;
          this.myForm = null;
        }
        if (
          events.name === EventName.StepHide &&
          value &&
          value.step &&
          value.step.anchorId ===
            TourType.INVITE_FORM_SEND_LINK_MANUALLY_INPUT &&
          value.direction === Direction.Forwards
        ) {
          this.dialogRef.close();
          this.sidenavToggleService.toggleSidenav('open');
        }
      })
    );
  }

  get enabledFields(): string[] {
    const fields = this.configService.config?.enableFieldsFormDoctor;
    return fields && fields.length ? fields : DEFAULT_REQUIRED_FIELDS;
  }

  isFieldEnabled(field: string): boolean {
    return this.enabledFields.includes(field);
  }


  protected readonly TourType = TourType;
}
