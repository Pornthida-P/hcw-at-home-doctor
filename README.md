# HCW@Home — Doctor Frontend

This folder contains the **HCW@Home doctor/caregiver** frontend source code (Angular). The app is built and served by a web server such as Nginx in production. Build output goes to the `dist/` folder.

## Prerequisites

- Node.js (v18+ recommended)

## Setup (before first run)

Install the local shared library:

```bash
npm i --no-save ../../hug-angular/dist/hug-angular-lib
```

Then install app dependencies:

```bash
npm install
```

## Development server

```bash
npm start
```

Then open **http://localhost:4200/**. The app will reload when you change source files.

## Build

```bash
npm run build
```

For a production build with optimizations, use the production configuration (e.g. `ng build --configuration=production` if configured). Artifacts are in `dist/`.

## Code scaffolding

- New component: `ng generate component component-name`
- Other: `ng generate directive|pipe|service|class|guard|interface|enum|module`

## Tests

- **Unit tests:** `npm test` (Karma)
- **E2E tests:** `npm run e2e` (Protractor)

## Deploy

See: **https://docs.hcw-at-home.com/deploy/**

## Angular CLI

For more commands: `ng help` or [Angular CLI README](https://github.com/angular/angular-cli/blob/master/README.md).
