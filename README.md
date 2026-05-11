# Productivity Redirect

An Angular-based launcher for the Elevate workflow and related shortcuts.

## Local development

Run the app locally with:

```bash
npm start
```

## Builds

Use the standard Angular production build with:

```bash
npm run build
```

Use the GitHub Pages build with the repository base path baked in:

```bash
npm run build:pages
```

## Structure

- `src/app/pages/home-page` contains the launcher screen.
- `src/app/pages/wikipedia-page` contains the curated random Wikipedia view.
- `src/app/shared` contains reusable UI components.
- `src/app/core/services` contains redirect and Wikipedia data logic.
