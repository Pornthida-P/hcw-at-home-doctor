import { Injectable } from '@angular/core';
import { HttpClient, HttpResponse } from '@angular/common/http';
import {Observable, of, Subject} from "rxjs";
import { environment } from '../../environments/environment';
import {catchError, map, tap} from "rxjs/operators";
import {Title} from "@angular/platform-browser";

@Injectable({
  providedIn: 'root',
})
export class ConfigService {
  public configSub: Subject<any> = new Subject();
  public config;
  constructor(private http: HttpClient, private titleService: Title) {}

  getConfig() {
    return this.http.get<any>(`${environment.api}/config`).pipe(
        tap(config => {
          this.config = config;

          if (config.branding) {
            this.titleService.setTitle(config.branding);
          }

          if (config.matomoUrl && config.matomoId) {
            this.initializeMatomo(config.matomoUrl, config.matomoId);
          }

          if (config.doctorAppPrimaryColor) {
            this.updatePrimaryColor(config.doctorAppPrimaryColor);
          }

          this.configSub.next(config);
        }),
        catchError(error => {
          console.error('Failed to fetch configuration:', error);
          return of(null);
        })
    );
  }

  updatePrimaryColor(color: string) {
    document.documentElement.style.setProperty('--primary-color', color);
  }

  //Matomo
  initializeMatomo(url: string, siteId: string): void {
    // @ts-ignore
    const _paq = (window._paq = window._paq || []);
    _paq.push(['trackPageView']);
    _paq.push(['enableLinkTracking']);
    (function () {
      const u = url;
      _paq.push(['setTrackerUrl', u + 'matomo.php']);
      _paq.push(['setSiteId', siteId]);
      const d = document,
        g = d.createElement('script'),
        s = d.getElementsByTagName('script')[0];
      g.async = true;
      g.src = u + 'matomo.js';
      s.parentNode.insertBefore(g, s);
    })();
  }

  checkMarkdownExists(markdownUrl: string) {
    return this.http.get(markdownUrl, { responseType: 'text', observe: 'response' }).pipe(
      map((res: HttpResponse<string>) => {
        if (!ConfigService.isValidTermsResponse(res)) {
          throw new Error('markdown-not-found');
        }
        return res.body as string;
      })
    );
  }

  getCountries() {
    return this.http.get<string[]>('assets/terms/countries.json');
  }

  /**
   * Load a terms markdown file and return its content, or
   * null when it is not available. When the file is missing, the web server's
   * SPA fallback (try_files ... /index.html) answers HTTP 200 with index.html,
   * which used to be treated as "file exists" and rendered as raw HTML text.
   */
  loadTermsFile(path: string): Observable<string | null> {
    return this.http.get(path, { responseType: 'text', observe: 'response' }).pipe(
      map((res: HttpResponse<string>) => (ConfigService.isValidTermsResponse(res) ? res.body : null)),
      catchError(() => of(null))
    );
  }

  static isValidTermsResponse(res: HttpResponse<string>): boolean {
    if (!res || res.status !== 200 || typeof res.body !== 'string') {
      return false;
    }
    const contentType = (res.headers && res.headers.get('content-type')) || '';
    if (contentType.toLowerCase().includes('text/html')) {
      return false;
    }
    const head = res.body.trim().slice(0, 200).toLowerCase();
    if (!head) {
      return false;
    }
    return !(head.startsWith('<!doctype') || head.startsWith('<html') || head.includes('<app-root') || head.includes('<base href'));
  }

  checkTermsFileExists(fileName: string) {
    return this.loadTermsFile(`assets/terms/${fileName}`).pipe(map(content => !!content));
  }

}
