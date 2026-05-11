# Architecture

## Purpose

Productivity Redirect is a standalone Angular application that serves as a shortcut launcher for the Qashboard workflow and a curated random Wikipedia experience.

## Runtime flow

- `src/main.ts` bootstraps the standalone Angular application.
- `src/app/app.config.ts` wires global providers for routing, HTTP, zone change detection, and the Angular service worker.
- `src/app/app.routes.ts` defines the top-level routes for the home launcher page and the Wikipedia page, with a fallback redirect to the home route.

## Feature areas

- `src/app/pages/home-page` contains the primary launcher UI.
- `src/app/pages/wikipedia-page` contains the Wikipedia browsing UI.
- `src/app/shared` contains reusable presentation components such as shortcut buttons and popups.
- `src/app/core/services` contains application services, including launching shortcuts and curating Wikipedia content.

## Build and deployment

- `package.json` defines local development, lint, test, and production build scripts.
- `.github/workflows/deploy-pages.yml` runs the GitHub Pages pipeline by checking out the repo, running `npm ci`, building with `npm run build:pages`, and publishing `dist/productivity-redirect/browser`.
- `package-lock.json` must stay in sync with `package.json` because the deployment workflow installs dependencies with `npm ci`, which requires an exact lockfile.
