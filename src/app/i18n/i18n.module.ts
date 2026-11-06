import { NgModule } from '@angular/core';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import {
  TranslateLoader,
  TranslateModule,
  TranslateService,
} from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';
import { ConfigService } from '../core/config.service';
import { firstValueFrom } from 'rxjs';

export const APP_LANGUAGES = ['en', 'th'];
export let supportedLanguages = [...APP_LANGUAGES];

export function translateLoaderFactory(httpClient: HttpClient) {
  // Prefer the raw base attribute so deep routes do not break relative paths,
  // and always end with a single trailing slash before assets/.
  const baseTag = document.getElementsByTagName('base')[0];
  const raw = (baseTag && baseTag.getAttribute('href')) || '/';
  const normalized = raw.endsWith('/') ? raw : raw + '/';
  return new TranslateHttpLoader(httpClient, normalized + 'assets/i18n/', '.json');
}

/**
 * Resolve the active UI language and wait until its catalog is loaded
 * (or fall back to English). Used from APP_INITIALIZER so routing does
 * not race a still-loading Thai catalog.
 */
export function initDoctorTranslations(
  translate: TranslateService,
  config: ConfigService
): () => Promise<void> {
  return async () => {
    translate.setDefaultLang('en');

    let appConfig: any = null;
    try {
      appConfig = await firstValueFrom(config.getConfig());
    } catch (e) {
      appConfig = null;
    }

    const configuredLanguages = (appConfig?.doctorLanguages || []).filter(
      (lang: string) => APP_LANGUAGES.includes(lang)
    );
    // Always keep the full EN+TH set so a previously saved Thai preference
    // still boots even if the server config list is stale/incomplete.
    const dynamicLanguages = configuredLanguages.length
      ? Array.from(new Set([...configuredLanguages, ...APP_LANGUAGES]))
      : [...APP_LANGUAGES];

    supportedLanguages.splice(0, supportedLanguages.length, ...dynamicLanguages);
    translate.addLangs(dynamicLanguages);

    const savedLang = window.localStorage.getItem('hhw-lang');
    const browserLang = translate.getBrowserLang();
    const userLang = savedLang || browserLang;
    const defaultLang = dynamicLanguages.includes(userLang)
      ? userLang
      : dynamicLanguages.includes('en')
        ? 'en'
        : dynamicLanguages[0];

    document.documentElement.setAttribute('lang', defaultLang);

    try {
      await firstValueFrom(translate.use(defaultLang));
    } catch (e) {
      if (defaultLang !== 'en') {
        try {
          window.localStorage.setItem('hhw-lang', 'en');
          document.documentElement.setAttribute('lang', 'en');
          await firstValueFrom(translate.use('en'));
        } catch (e2) {
          // leave defaultLang 'en' unset; templates will show keys briefly
        }
      }
    }
  };
}

@NgModule({
  imports: [
    HttpClientModule,
    TranslateModule.forRoot({
      loader: {
        provide: TranslateLoader,
        useFactory: translateLoaderFactory,
        deps: [HttpClient],
      },
    }),
  ],
  exports: [TranslateModule],
})
export class I18nModule {
  constructor(translate: TranslateService) {
    // Language selection is completed by APP_INITIALIZER (initDoctorTranslations).
    translate.setDefaultLang('en');
  }
}
