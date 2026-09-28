# Security

Ermes is an early developer preview. Security fixes currently target `main`; there
are no maintained stable release branches or guaranteed response times yet.

## Report a vulnerability privately

Use [GitHub private vulnerability reporting](https://github.com/giaggiola/Ermes/security/advisories/new).
Include the affected commit, a minimal reproduction, expected impact and any
suggested fix. Use synthetic credentials and customer data.

Do not post an exploitable vulnerability, `.env`, access tokens, encryption keys,
customer exports or an unredacted database dump in a public issue. If the private
reporting form is unavailable, open an issue asking for a private contact channel
without including vulnerability details.

## Operating an installation

- Create the first owner locally or through an SSH tunnel before public exposure.
- Serve the admin interface through HTTPS or an SSH tunnel.
- Keep deployment keys and encrypted database backups together in secure storage.
- Use a verified sending domain, honour consent and keep unsubscribe endpoints reachable.
- Keep sending paused during setup and review published flows and due campaigns before resuming.
- Treat account recovery and guided encryption-key rotation as unavailable in this preview.
- Install dependency and application updates after reviewing migration notes.

See [self-hosting](docs/self-hosting.md) for deployment and backup procedures.
