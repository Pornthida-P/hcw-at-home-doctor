import { TranslateService } from "@ngx-translate/core";
import { Pipe, PipeTransform } from "@angular/core";
import { DatePipe, } from "@angular/common";

export function dateLocale(lang: string): string {
  return lang === "th" ? "th" : "en";
}

@Pipe({
  name: "msgTime",
  pure: false
})
export class MsgTimePipe implements PipeTransform {


  constructor(
    private translateSer: TranslateService
  ) {}
  datePipe = new DatePipe("en");


  transform(time: any, args?: any): any {
    if (!time) {
      return "";
    }

    let format = "LLL d";

    if (new Date().toDateString() === new Date(time).toDateString()) {
      format = "HH:mm";
    }

    if (new Date(Date.now() - 8.64e+7).toDateString() === new Date(time).toDateString()) {
      return this.translateSer.instant("dashboard.yesterday");
    }

    return this.datePipe.transform(time, format, undefined, dateLocale(this.translateSer.currentLang));

  }

}

@Pipe({
  name: "localDate",
  pure: false
})
export class LocalDatePipe implements PipeTransform {

  constructor(
    private translateSer: TranslateService
  ) {}
  datePipe = new DatePipe("en");

  transform(value: any, format?: string, timezone?: string): any {
    return this.datePipe.transform(value, format, timezone, dateLocale(this.translateSer.currentLang));
  }

}
