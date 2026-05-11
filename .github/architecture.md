# Architecture

## Purpose

Productivity Redirect is a standalone Angular application that serves as a shortcut launcher for the Q-board workflow and a curated random Wikipedia experience.

## Runtime flow

- `src/main.ts` bootstraps the standalone Angular application.
- `src/app/app.config.ts` wires global providers for routing, HTTP, zone change detection, the Angular service worker, and eager initialization of the Daily Fact reminder service.
- `src/app/app.routes.ts` defines the top-level routes for the home launcher page and the Wikipedia page, with a fallback redirect to the home route.

## Feature areas

- `src/app/pages/home-page` contains the primary launcher UI, ranks important shortcuts by recent usage, surfaces daily and weekly shortcut urgency state, and keeps shortcut launching fully manual.
- `src/app/pages/wikipedia-page` contains the Wikipedia browsing UI.
- `src/app/shared` contains reusable presentation components such as shortcut buttons and popups.
- `src/app/core/services` contains application services, including shortcut launching, daily and weekly shortcut usage persistence, Daily Fact reminders, and Wikipedia data curation.
- `docs/daily-fact-usage-plan.md` documents the Angular implementation approach for daily shortcut usage tracking and post-3pm Daily Fact reminders.

## Build and deployment

- `package.json` defines local development, lint, test, and production build scripts.
- `.github/workflows/deploy-pages.yml` runs the GitHub Pages pipeline by checking out the repo, running `npm ci`, building with `npm run build:pages`, and publishing `dist/productivity-redirect/browser`.
- `.github/workflows/lockfile-check.yml` verifies that `package-lock.json` stays aligned with `package.json` before deployment workflows rely on `npm ci`.
- `package-lock.json` must stay in sync with `package.json` because the deployment workflow installs dependencies with `npm ci`, which requires an exact lockfile.
