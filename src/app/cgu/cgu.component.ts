import { Component, Inject, Optional } from '@angular/core';
import { LocationStrategy } from '@angular/common';
import { ConfigService } from '../core/config.service';
import { User } from '../user';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TranslateService } from '@ngx-translate/core';
import { concat, Subscription } from 'rxjs';
import { defaultIfEmpty, filter, map, take } from 'rxjs/operators';

@Component({
  selector: 'app-cgu',
  templateUrl: './cgu.component.html',
  styleUrls: ['./cgu.component.scss'],
})
export class CguComponent {
  currentUser: User;
  error = false;
  countryError = false;
  selectedCountry = 'Any';
  countries = [];
  currentLang: string = 'en';
  selectedTermName = 'terms.en.md';
  // Markdown actually loaded (null = no valid terms file)
  termsContent: string | null = null;
  termsLoading = true;
  private termsRequest: Subscription;

  constructor(
    public configService: ConfigService,
    private translate: TranslateService,
    private locationStrategy: LocationStrategy,
    @Optional() public dialogRef: MatDialogRef<CguComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.currentLang = this.translate.currentLang;
  }

  ngOnInit() {
    this.getCountries();
  }

  onClose(): void {
    this.dialogRef.close();
  }

  onLanguageChange(language: string): void {
    this.currentLang = language;
    this.changeCountry(this.selectedCountry);
  }

  getCountries() {
    this.configService.getCountries().subscribe(
      res => {
        if (res) {
          res.unshift('Any');
          this.changeCountry('Any');
          this.countries = res;
          this.countryError = false;
        }
      },
      error => {
        this.countryError = true;
        this.selectedCountry = '';
        this.changeCountry('');
      }
    );
  }

  goBack() {
    if (this.data?.showCloseButton) {
      this.onClose();
    } else {
      this.locationStrategy.historyGo(-1);
    }
  }

  changeCountry(country: string) {
    this.selectedCountry = country;
    const fallbackTerms =  !country || country === 'Any' ? `terms.md` : `terms.${country}.md`;

    const specificTerms =  !country || country === 'Any' ? `terms.${this.currentLang}.md` :  `terms.${country}.${this.currentLang}.md`;

    // Try the files in order and keep the first one that is real
    // markdown (not the index.html SPA fallback); otherwise show a message.
    const candidates = [`assets/terms/${specificTerms}`, `assets/terms/${fallbackTerms}`, 'assets/terms.md'];
    this.error = false;
    this.termsLoading = true;
    if (this.termsRequest) {
      this.termsRequest.unsubscribe();
    }
    this.termsRequest = concat(
      ...candidates.map(path =>
        this.configService.loadTermsFile(path).pipe(map(content => ({ path, content })))
      )
    )
      .pipe(
        filter(result => !!result.content),
        take(1),
        defaultIfEmpty(null)
      )
      .subscribe(result => {
        this.termsLoading = false;
        if (result) {
          this.selectedTermName = result.path.replace('assets/terms/', '');
          this.termsContent = result.content;
          this.error = false;
        } else {
          this.termsContent = null;
          this.error = true;
        }
      });
  }
}
