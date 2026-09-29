# Roadmap

Ermes is an early developer preview. Shipped capabilities are listed separately
from future work; no delivery dates are promised.

## Shipped in the developer preview

- Shopify store-detail import, resumable customer/product/order sync and signed webhooks.
- Checkout reconciliation, identified-cart tracking and recovery checks before sends.
- Shopify discount creation and consent synchronisation with retries.
- Signup form editor, pinned published versions and a popup/flyout theme extension.
- Basic consent-gated form impression and submission counters, plus connection health.
- Optional Cloudinary uploads and a reusable image library.

See [Shopify setup and limits](shopify.md). These are implemented capabilities;
live-store validation remains part of each operator's installation.

## Merchant experience

- Public OAuth installation across different Shopify organisations.
- Embedded/full-page storefront form placements, advanced analytics and experiments.
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
