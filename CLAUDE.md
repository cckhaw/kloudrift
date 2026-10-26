# kloudrift: project rules for Claude

## Deployment policy (standing instruction from the owner)
Vercel hosting. Production is `https://kloudrift.vercel.app` (project `kloudrift`, team `cckhaw-5201`).

- **No preview deployments.** `previewDeploymentsDisabled` is enabled on the Vercel project. Do not turn it back on. Pushing a branch or opening a PR does not build anything, so verify changes locally (`npm test`, `npm run build`, browser tests against `vite`).
- **Keep only the latest production deployment.** After every merge to `main` (which deploys production automatically):
  1. Wait until the new production deployment is `READY` and confirm the live site serves it (for example the bundle hashes in `https://kloudrift.vercel.app/` match the build).
  2. Delete everything else: `VERCEL_TOKEN=... npm run prune:deployments` for a dry run, then add `-- --yes`. The script keeps only the newest READY production deployment and refuses to run while a newer production build is still in flight.
  3. Confirm exactly one deployment remains and the site returns HTTP 200.
- The `VERCEL_TOKEN` comes from the environment. Never print it, commit it, or ask for it in chat.
- Merging pull requests and deleting deployments are only done when the owner asks. The cleanup above is part of any request to merge or deploy.

## Working rules
- Run `npm test` and `npm run build` before every push. Tests need no database (they run with the in-memory store).
- Wind-bottle storage is Neon Postgres via `DATABASE_URL` (see README). Check `/api/bottles?status=1` after deploys.
