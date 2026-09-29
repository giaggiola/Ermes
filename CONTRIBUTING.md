# Contributing to Ermes

Start with the [roadmap](docs/roadmap.md), open an issue for a reproducible bug, or
use discussions to propose a larger change. Small, focused pull requests are
easier to review.

## Development environment

Use Node 22.12+ and Docker Compose. Install locked dependencies with `npm ci`.
The Docker setup in the README is the supported way to run the complete application.

```sh
npm ci
node scripts/setup.mjs
docker compose up --build -d
```

For an individual development process, load deployment variables from `.env` and
provide a `DATABASE_URL` reachable from that process, then run `npm run dev:web`
or `npm run dev:worker`. The default Compose database is only on the Docker network;
use a separate local PostgreSQL instance or a local Compose override for development.
Do not bind a development instance to a real merchant database.

## Checks

```sh
npm run format:check
npm test
npm run typecheck
npm run build
npm ci --prefix shopify-app
npm run build --prefix shopify-app
npm test --prefix shopify-app
```

Run `npm run format` to apply the shared formatting rules. CI checks formatting
and rejects unused local variables, parameters and imports through TypeScript.
Generated migrations, bundled assets and byte-exact upgrade fixtures are excluded
from formatting.

Without `TEST_DATABASE_URL`, database integration tests are skipped. To run them
against a disposable database in this Compose project:

```sh
docker compose up -d db
npm run test:database
```

This command creates and resets **only `ermes_test`** in the project's database
container. That database is owned by the test suite. CI runs the database tests too.

Browser checks require a **fresh disposable installation with no owner account**:

```sh
npm run build:packages
npx playwright install --with-deps chromium
ERMES_TEST_URL=http://127.0.0.1:3027 node --env-file=/path/to/disposable.env tests/browser-smoke.mjs
```

`ERMES_TEST_URL` is required and must match the disposable application origin. Use
`ERMES_ARTIFACT_DIR` for screenshots. The test creates a synthetic owner, store,
credentials and draft content; it does not enable sending or call Shopify/Resend.

For the extended Shopify browser path, use a separate database named exactly
`ermes_shopify_browser`, preload `tests/fixtures/shopify-fetch.mjs` in both web and
worker with `NODE_OPTIONS=--import=/absolute/path/to/that/file`, and set
`ERMES_SHOPIFY_FIXTURE=true` when running the browser test. The preload rejects any
other database and replaces only the synthetic Shopify host. This exercises the
real import API, connector activation, form editor, signed storefront proxy and
theme asset without contacting Shopify. Never preload fixtures in production.
Never run it against a merchant installation. Stop and remove your disposable
test installation when finished; do not reuse its synthetic settings.

## Pull requests

- Explain the user-facing problem and resulting behaviour.
- Keep provider-specific code separate from shared flow and delivery logic.
- Preserve consent, unsubscribe, signature validation and delivery idempotency.
- Add meaningful regression coverage when behaviour changes; document validation.
- Update setup/configuration docs when adding a required variable or integration.
- Include screenshots for visible UI changes and migration notes for schema changes.
- Keep credentials, customer records, database dumps and private endpoints out of
  commits, logs, screenshots and issue attachments.

Treat existing migration files as immutable. Generate a new migration for a schema
change, inspect its SQL and test it on an empty database and a synthetic upgrade
fixture. Package consumers should receive shared changes through reviewed versions.

## Licensing and conduct

By submitting a contribution, you agree to license it under this project's
AGPL-3.0-only license. Preserve third-party copyright and license notices.

Be respectful, assume good intent and discuss the work rather than the person.
Harassment, threats and publishing another person's private information are not
welcome in issues, discussions or pull requests.
