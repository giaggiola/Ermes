# Roadmap

Ermes is an early developer preview. This roadmap describes planned work, not
features already available or promised delivery dates.

## Shopify automation

- Signed webhook ingestion for order, customer and product events.
- Idempotent event processing, retries and reconciliation.
- Abandoned-checkout ingestion and a final eligibility check before recovery sends.
- Cancellation when a customer completes checkout or withdraws consent.
- Discount creation and consent synchronisation.
- Storefront identification, cart tracking and a storefront extension.

Cart tracking before checkout needs its own identification and consent flow.
Shopify credential verification alone does not provide that information.

## Merchant experience

- A standalone signup form editor, preview and publishing flow.
- Form analytics, asset uploads and experiments.
- Clear connection health and setup diagnostics.
- Owner password recovery and account administration.
- Guided provider credential removal and encryption-key rotation.

## Reliable self-hosting

- Repeatable upgrades and backup/restore rehearsals.
- End-to-end tests using a development store and dedicated test email recipients.
- Versioned release images and migration notes.
- Dependency maintenance, including the development-only Drizzle Kit/esbuild
  advisories in the current toolchain.

## Extensibility

- Documented integration contracts and reusable UI packages.
- Additional email providers, based on community demand.
- Clear boundaries between store integrations and the automation engine.

The initial target remains one store and one owner per installation. Multi-store
hosting, SMS and a hosted commercial service are not part of the current scope.

Discuss proposed work in [GitHub discussions](https://github.com/giaggiola/Ermes/discussions)
before starting a large implementation. Keep changes focused and include validation.
