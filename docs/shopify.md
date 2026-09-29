# Connect Shopify to Ermes

Ermes runs as your own app for one Shopify store. This version uses Shopify's
client-credentials grant: the app and store must be in the same Shopify
organisation. It is not an App Store installation or a multi-merchant OAuth app.

## 1. Give Ermes a public HTTPS address

Finish owner setup first. Configure a reverse proxy as described in
[self-hosting](self-hosting.md), set `APP_URL=https://messages.example.com` in
`.env`, and run `docker compose up -d web worker`. Use that same address in your
browser. Shopify must reach it for webhooks and storefront app-proxy requests.
An SSH tunnel alone is sufficient for browsing Ermes, but not for live Shopify
callbacks. Keep PostgreSQL private.

## 2. Create and install your own Shopify app

Create the app in your organisation's Shopify Dev Dashboard. Request:

```text
read_orders,read_customers,write_customers,read_products,read_inventory,
read_discounts,write_discounts,write_app_proxy
```

Orders include the normal last-60-days window. Ermes does not request
`read_all_orders`. Customer and order access may require configuring protected
customer data access in the Dev Dashboard. Grant access only for the store you
intend to connect, then install the app on that store.

The read scopes support sync, checkout checks and product information.
`write_customers` synchronises explicit newsletter subscriptions and opt-outs;
discount access supports the discount step in flows. `write_app_proxy` supports
the storefront extension. Starting sync checks these permissions.

See Shopify's [client-credentials setup](https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant)
and [protected customer data guidance](https://shopify.dev/docs/apps/launch/protected-customer-data).

## 3. Publish the app configuration and extension

The repository includes the complete popup/flyout theme extension. It is separate
from the three Docker services and is uploaded to Shopify using Shopify CLI.
Install Node 22.12+ and [Shopify CLI](https://shopify.dev/docs/api/shopify-cli), then:

```sh
cd shopify-app
npm ci
cp shopify.app.toml.example shopify.app.toml
```

Edit the ignored `shopify.app.toml`:

- Set `client_id` to your app's client ID. Never put the client secret in TOML.
- Replace **every** `https://ermes.example.com` with your public Ermes origin.
- Keep the app-proxy storefront path `/apps/ermes`; the extension uses it.
- Keep the provided webhook subscriptions and API version `2026-07`.

Then build, validate and publish:

```sh
npm run build
npm test
shopify app build
shopify app deploy
```

Select your own organisation/app when prompted and review the released
configuration in the Dev Dashboard. Approve changed permissions in Shopify if
requested. The supplied configuration sends webhooks to
`/api/shopify/webhooks` and forwards `/apps/ermes/*` to
`/api/shopify/storefront/*`. Do not create a second set of manual subscriptions for
the same app; the application configuration manages them.

Shopify documents [configuration](https://shopify.dev/docs/apps/build/cli-for-apps/app-configuration),
[webhook subscriptions](https://shopify.dev/docs/apps/build/webhooks/subscribe) and
[app proxies](https://shopify.dev/docs/apps/build/online-store/app-proxies).

## 4. Import store details and activate sync

In Ermes setup, choose **Import from Shopify** or open the **Shopify** step. Save
your `your-store.myshopify.com` domain, client ID and client secret. The server
encrypts credentials; it never returns them or an Admin API access token to the
browser. Tokens refresh automatically.

Import proposes the store name, primary storefront URL, timezone, sender name
and public contact email. Review and save those details. Existing sender choices
are preserved. Add a logo manually or with your image library. A Shopify contact
address does not establish permission to send through Resend: verify that domain
separately.

Choose **Verify connection**, then **Start Shopify sync**. The worker imports
customers, products and recent order metadata in resumable pages. Existing customer
opt-ins are imported without welcome emails. Existing local opt-outs, deleted
profiles and delivery suppressions are preserved. Backfilled orders do not start
order flows. New webhooks feed the messaging engine, while periodic reconciliation
repairs cached data. Setup shows record counts, initial import completion, the
latest webhook/checkout scan and failed jobs awaiting retry.

One installation stays linked to one store after activation. Use another Ermes
installation to connect a different store. **Pause Shopify sync** stops connector
work; **Pause email delivery** separately stops sends from published flows and
campaigns. Pausing ingestion does not remove already queued messages.

## 5. Publish a signup form

In Ermes, open **Signup forms**, create a popup or flyout, edit its content,
targeting and appearance, preview it, then publish. Autosaving edits preserves the
previous published version until you publish again. The most recently published
popup/flyout occupies the storefront overlay slot.

In Shopify's theme editor, open **App embeds**, enable **Ermes signup forms**, and
save the theme. Test in a separate storefront session that matches the form's
device/page/login targeting and cooldown. Theme-editor previews do not subscribe
customers or count impressions. Use Ermes' editor for draft previews.

Newsletter submissions record explicit email consent, update the Ermes profile
and queue the welcome event atomically. Retries cannot create duplicate welcomes
or reverse a later unsubscribe. Consent is synchronised to Shopify with retry
and timestamp checks. Form impression counters require Shopify analytics consent;
submission counts record successful form operations. Advanced experiment analytics
are not included. Embedded and full-page documents can be edited, but this theme
embed renders popup/flyout placements only.

## Recovery behaviour

- The worker polls Shopify `abandonedCheckouts` for activity since connector
  activation. Candidates become eligible after **one hour of inactivity** and
  expire after **seven days**. Flow delays add to that initial hour.
- Before dispatch and again immediately before sending, Ermes checks current
  consent, local suppressions, purchases, checkout completion, unchanged activity,
  and whether Shopify already sent or scheduled a recovery email. Missing or
  failed eligibility responses prevent the send and are retried.
- Pre-checkout cart recovery needs the theme embed, an identified shopper and
  Shopify marketing privacy permission. Identity comes from an explicit signup,
  a previously issued opaque capability, or Shopify's signed logged-in customer
  identifier. Anonymous visitors are not emailed.
- Cart contents come from signed Shopify cart webhooks. Private cart-token keys
  are discarded. Checkout/purchase webhooks cancel cart recovery before they are
  acknowledged, and purchase tombstones prevent late cart updates from reviving it.
- Unsupported cart custom properties, selling plans and truncated cart contents
  prevent cart recovery because a permalink could not restore them faithfully.
  Shopify's recovery URL is used for checkouts; supported carts use item permalinks.
- Expired recovery identities and snapshots are cleared after seven days,
  including while syncing is paused. Processed webhook payloads are cleared;
  opaque delivery IDs remain for deduplication. Imported profiles and messaging
  records follow the normal Ermes data lifecycle.

Publish the relevant cart/checkout flows and configure your sender before enabling
delivery. Review Shopify's own recovery automation settings to avoid operating two
recovery systems. Ermes suppresses Shopify-sent/scheduled checkout recoveries but
cannot coordinate every third-party app or simultaneous external send.

## Verify your installation

Use a development store and dedicated test recipients first. Confirm import counts,
receive a test Shopify webhook, submit a published form with explicit consent,
withdraw consent, and check that an order cancels recovery. Check worker logs and
the setup status if events do not arrive. Never print credentials or customer
webhook bodies into logs when troubleshooting.

Repository tests exercise synthetic Shopify responses, real PostgreSQL transactions,
signature rejection, pagination retries, consent ordering, duplicates, recovery
checks and storefront behaviour. They do not replace testing your own Shopify app,
theme, public URL and email provider together.
