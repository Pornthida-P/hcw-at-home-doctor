import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { IStepOption, TourService } from 'ngx-ui-tour-md-menu';
import { TourState } from 'ngx-ui-tour-core';
import { TourType } from '../models/tour';

export type GuidedTourMode = 'full' | 'page';

/**
 * The "Help" button used to start the full onboarding tour, whose
 * first step routes to /invitations (and later steps route to other pages),
 * so the user was taken away from the page they were working on.
 *
 * This service keeps the full tour (still used right after accepting the
 * terms, and on demand) and adds a "page" tour that only highlights elements
 * that are present on every page (side menu + profile menu) and never
 * navigates.
 */
@Injectable({ providedIn: 'root' })
export class GuidedTourService {
  mode: GuidedTourMode = 'full';
  private fullSteps: IStepOption[] = [];
  private stepDefaults: IStepOption = {};

  /** anchors that exist on every logged-in page (side nav + top nav) */
  private static readonly PAGE_TOUR_ANCHORS: string[] = [
    TourType.INVITES_MENU,
    TourType.WAITING_ROOM_MENU,
    TourType.OPENED_CONSULTATIONS_MENU,
    TourType.CONSULTATION_HISTORY_MENU,
    TourType.HEADER_PROFILE_MENU,
  ];

  constructor(
    private tourService: TourService,
    private router: Router
  ) {}

  /** called by AppComponent whenever the (translated) steps are (re)built */
  setSteps(steps: IStepOption[], stepDefaults: IStepOption) {
    this.fullSteps = steps;
    this.stepDefaults = stepDefaults;
    if (this.tourService.getStatus() === TourState.OFF) {
      this.mode = 'full';
      this.tourService.initialize(this.fullSteps, this.stepDefaults);
    }
  }

  isRunning(): boolean {
    return this.tourService.getStatus() !== TourState.OFF;
  }

  /** Full onboarding tour (navigates between pages). */
  startFullTour() {
    if (this.isRunning()) {
      return;
    }
    this.mode = 'full';
    this.tourService.initialize(this.fullSteps, this.stepDefaults);
    this.tourService.start();
  }

  /** Tour of the current page only: no step has a route, so no navigation. */
  startPageTour() {
    if (this.isRunning()) {
      return;
    }
    const steps = this.fullSteps
      .filter(s =>
        GuidedTourService.PAGE_TOUR_ANCHORS.includes(s.anchorId as string)
      )
      .map(s => {
        const step: IStepOption = { ...s };
        delete step.route;
        delete step.delayBeforeStepShow;
        return step;
      });
    if (!steps.length) {
      return;
    }
    this.mode = 'page';
    this.tourService.initialize(steps, this.stepDefaults);
    this.tourService.start();
  }
}
