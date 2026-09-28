# Embed the messaging UI in another application

Ermes keeps its messaging screens in `@ermes/ui` and its shared contracts in
`@ermes/core`. A host application supplies authentication, navigation, a React Query
provider and a same-origin API transport. No service signing secrets belong in
browser code.

```tsx
"use client";
import { ErmesProvider, MessagingContractProvider, FlowsPage } from "@ermes/ui";

const host = { apiBase: "/api/messaging", fetch: globalThis.fetch };

export function Messaging() {
  return (
    <ErmesProvider host={host}>
      <MessagingContractProvider>
        <FlowsPage />
      </MessagingContractProvider>
    </ErmesProvider>
  );
}
```

The host must provide an authenticated server gateway matching Ermes' admin API.
Replace `fetch` with your session-aware fetch implementation if necessary. The
shared screens currently use `/messaging` navigation routes and Next.js/React.

Add `@ermes/ui` to the host's Next `transpilePackages` configuration. Its Tailwind
build must scan the package source. Import `@ermes/ui/styles.css` if you need the
supplied theme; avoid overriding an existing host theme unintentionally.

For local package experiments, build and pack the shared workspaces:

```sh
npm run build:packages
npm pack -w @ermes/core
npm pack -w @ermes/ui
```

Install both resulting tarballs in the host application. The workspace names do
not imply that these packages are published to npm. Pin reviewed versions and
test authentication, navigation, drafts, publishing and errors before an upgrade.

When adapting an existing runtime, preserve event IDs, preference secrets and
database migration history. Rehearse configuration migration on a disposable
database, and avoid running duplicate event producers or senders.
