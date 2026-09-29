# Onboard your store

Start Ermes using the [Docker quick start](../README.md#quick-start). On a remote
server, follow [the SSH tunnel or HTTPS instructions](self-hosting.md) first.

## 1. Create the owner account

Choose an email address and a password of at least 12 characters. Registration
closes automatically after the first owner is created. Complete this step locally
or through your SSH tunnel before exposing a new installation publicly.

A setup key is optional. If the operator has set `ERMES_SETUP_TOKEN` in `.env`,
the form also asks for that key. Normal login always uses email and password.
Password recovery and additional users are not available yet.

## 2. Add store and sender details

Choose **Import from Shopify** to connect your app and review its store name, URL,
timezone and suggested sender. Importing does not save or enable delivery. You can
also enter your store name, HTTPS storefront URL, sender name, sender email, timezone
and optional HTTPS logo URL. The store name and URL personalise template content;
the sender name and address identify outgoing email. The timezone is stored with
your profile; existing campaign scheduling uses explicit dates and UTC storage.

## 3. Configure email delivery

1. Create a Resend account and add a domain you control.
2. Complete the DNS records requested by Resend and wait for domain verification.
3. Create an API key with access to your sending domain and enter it in Ermes.
4. Add a Resend webhook pointing to `https://your-ermes-domain/api/resend/webhook`.
   Subscribe to the supported `email.sent`, `email.delivered`, `email.opened`,
   `email.clicked`, `email.bounced` and `email.complained` events, then copy its
   signing secret into Ermes. Opens and clicks also depend on provider tracking settings.

See [Resend domain setup](https://resend.com/docs/dashboard/domains/introduction)
and [Resend webhooks](https://resend.com/docs/dashboard/webhooks/introduction).
The webhook must be reachable from Resend; a localhost-only setup is suitable for
exploring the workspace, not end-to-end provider delivery.

Saving keys does not send email. Empty credential fields preserve saved values.
You can skip provider setup while exploring templates and draft flows.

## 4. Prepare Shopify credentials

Follow [Shopify setup](shopify.md) to create your app, configure the required
permissions, publish webhook subscriptions and install the theme extension.
Save your `myshopify.com` domain and the installed app's client ID/secret, then
choose **Verify connection** and **Start Shopify sync**. Import progress, cached
record counts, the latest webhook, checkout scanning and retry errors appear here.

The app and store must belong to the same Shopify organisation for the
[client-credentials grant](https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant).
Sync activation is separate from email delivery. Customers/products and the last
60 days of orders import without starting historical automations. New events can
start published flows. Checkout recovery considers activity since activation.

## 5. Connect image storage

Open **Image storage** in setup and enter your Cloudinary cloud name, API key and
API secret from the [Cloudinary console](https://console.cloudinary.com/). These
credentials are encrypted using the installation key; blank fields preserve saved
values. Your first upload checks the connection.

In the signup form editor, choose an image block or the form's side image and click
**Choose**. The picker can upload JPEG, PNG, GIF and WebP images up to 10 MB, or
search and reuse images already uploaded to this Ermes installation. Sender settings
use the same library for the email logo. Uploaded images have public HTTPS URLs;
only the authenticated owner can upload or browse the library.

You can skip Cloudinary and paste existing image URLs. The library shows images
uploaded through Ermes, not every asset in your Cloudinary account. Keep those
Cloudinary assets available while forms or sent emails reference them. Changing
credentials does not move existing images to another account.

## 6. Review before enabling delivery

Create a template, preview it, save your flow as a draft and review your audience.
Only enable sending after your sender domain is verified. Published flows and due
campaigns can then send real email, including work queued while sending was paused.
Test emails also require the sending toggle. Keep customer unsubscribe links reachable.

## Configuration and storage

First-time setup creates exactly one owner, including concurrent attempts.
Operators can optionally require a setup key through `ERMES_SETUP_TOKEN`. Passwords use salted
scrypt hashes. Session tokens are random, stored only as hashes, expire after seven
days and can be revoked by logout. Browser mutations require an authenticated
session and an exact same-origin request. Login attempts are limited per account.
Password reset, additional users and account administration are future work.

| Setting                                         | Where the operator supplies it           | Storage                                 |
| ----------------------------------------------- | ---------------------------------------- | --------------------------------------- |
| Public application URL, port, database password | Deployment `.env`                        | Server only                             |
| Encryption/signing/preference keys              | Generated by setup helper                | Server only                             |
| Optional first-owner setup key                  | Deployment `.env`                        | Server only                             |
| Store name, storefront URL, timezone            | Setup UI                                 | PostgreSQL                              |
| Sender name/address and logo URL                | Setup UI or sender settings              | PostgreSQL                              |
| Resend key/webhook signing secret               | Setup UI                                 | AES-256-GCM encrypted PostgreSQL fields |
| Cloudinary cloud name/API key/API secret        | Image storage setup                     | AES-256-GCM encrypted PostgreSQL fields |
| Uploaded images / library metadata              | Image picker                            | Cloudinary / PostgreSQL                |
| Shopify shop domain/client ID/client secret     | Setup UI                                 | Domain plus encrypted credential fields |
| Delivery enabled                                | Explicit owner action after sender setup | PostgreSQL, disabled initially          |

Blank credential fields preserve existing values. Saved credentials are not read
back to the browser. Encryption authenticates each field's purpose to prevent
substituting one credential for another. Do not rotate `ERMES_ENCRYPTION_KEY` by
simply replacing it; an explicit re-encryption workflow is required first.

Shopify uses short-lived access tokens held only in server memory. Different-organisation
OAuth installs need a future authorization-code flow; this version uses your own app.
Starting sync verifies the complete permission set listed in the Shopify guide.
Pause Shopify ingestion and outbound email delivery independently in setup.

Resend's sender domain must be verified separately. The owner acknowledges that
before enabling delivery. Every outbound email path uses the stored sending gate,
including test emails and preference-link emails. Public unsubscribe confirmation
and one-click POST routes stay available independently of sending.

## Troubleshooting

- **Setup key requested:** the operator has configured `ERMES_SETUP_TOKEN`. Use
  its value from this installation's `.env`, or leave the setting blank and run
  `docker compose up -d web` to return to email-and-password setup.
- **Request origin is not allowed:** make `APP_URL` match the exact address open in
  your browser and run `docker compose up -d web worker`.
- **Shopify verification fails:** check the domain, app installation, scopes and
  that the app/store belong to the same organisation.
- **No Shopify activity after verification:** choose **Start Shopify sync**, check
  the worker and confirm the published webhook destination is reachable over HTTPS.
  For signup forms, also enable the Ermes theme embed and publish a popup/flyout.
- **Email delivery is disabled:** configure your sender and Resend key, verify the
  domain in Resend, then explicitly enable delivery in setup.

## References

- https://nextjs.org/docs/app/guides/authentication
- https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant
- https://shopify.dev/docs/apps/launch/distribution/select-distribution-method
