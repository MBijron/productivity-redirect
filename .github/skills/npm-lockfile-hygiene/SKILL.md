---
name: npm-lockfile-hygiene
description: Keep package-lock.json synchronized with package.json so npm ci stays green in CI and deploy workflows.
---

# npm lockfile hygiene

## When to use

- After changing dependencies in package.json
- When CI fails with npm ci EUSAGE about package-lock.json being out of sync

## Reliable fix

1. Run `npm install` from the repository root.
2. Commit both `package.json` and `package-lock.json` if either changed.
3. Run `npm ci` in a clean environment when you want to confirm the lockfile is complete.

## Notes

- This repo has seen stale lockfiles around optional peer resolution for `angular-eslint`, especially `chokidar@5` and `readdirp@5`.
- `.github/workflows/lockfile-check.yml` catches lockfile drift before deploy workflows rely on `npm ci`.