# Self-host Ermes

Ermes runs as three Docker Compose services: `web`, `worker` and PostgreSQL `db`.
The database uses a named volume. A container restart does not reset merchant data.
The web service applies migrations; the worker starts after web health checks pass.

## Install locally or on a server

Follow the README's clone, key-generation and `docker compose up --build -d` steps.
Do not replace the generated `.env` during upgrades. It contains the keys required
to read saved credentials and validate preference links.

By default the web service binds to `127.0.0.1:3025`; PostgreSQL has no published
host port. An SSH session on the server does not make its localhost your browser's
localhost. Open a tunnel from your own computer:

```sh
ssh -N -L 3025:127.0.0.1:3025 user@your-server
```

Keep `APP_URL=http://localhost:3025` for that arrangement and visit
`http://localhost:3025` locally. A blank terminal after running `ssh -N` is normal.
If the local port is busy, choose another local port and update `APP_URL` to match
the address you will open in your browser. Then recreate the application services.

## Use an HTTPS domain

Point your domain at your server and terminate HTTPS with a reverse proxy. A proxy
running on the host can forward to `127.0.0.1:3025`. For example, a host Caddyfile:

```caddyfile
messages.example.com {
    reverse_proxy 127.0.0.1:3025
}
```

A reverse proxy in another container needs a deliberately configured shared network;
its own `127.0.0.1` does not refer to the host or to the Ermes web container.

Set the exact origin in `.env`, including a nonstandard port if you use one:

```dotenv
APP_URL=https://messages.example.com
```

Apply environment changes with:

```sh
docker compose up -d web worker
```

Authentication checks `APP_URL` against the browser's Origin header. HTTPS URLs also
enable secure session cookies. Use that same address consistently for login and
setup. Do not change keys or disable origin checks to solve a URL mismatch.

Signed provider webhooks need an address the provider can reach. Public customer
preference and unsubscribe links also need to be reachable by email recipients.
An SSH tunnel or private VPN is suitable for exploring the admin UI, but does not
by itself give Resend or your customers access to these endpoints.

## First-owner setup

Open the app and choose your owner email and password. No setup key is required by
default. Registration closes after the first owner is created, even if two people
attempt setup at the same time. Complete setup locally or through your SSH tunnel
before exposing a fresh installation publicly.

If you need to expose an unclaimed installation, you can set a long, random
`ERMES_SETUP_TOKEN` in `.env` and run `docker compose up -d web`. The setup form then
requires that key as well as email and password. Leave it blank for the default
experience. Never put a configured setup key in a URL or public issue.

If setup is already complete, use `/login`. Password recovery and additional owner
management are not implemented in this preview.

## Backups

Back up the database and `.env` together, and protect both. A database backup alone
cannot decrypt saved provider credentials without the original encryption key.

For a backup taken while application writes are stopped:

```sh
umask 077
mkdir -p backups
docker compose stop web worker
docker compose exec -T db pg_dump -U ermes -d ermes -Fc > backups/ermes.dump
cp .env backups/installation.env
docker compose up -d web worker
```

Copy backups to separate secure storage. The `backups/` directory is ignored by Git
and Docker builds. Rehearse restoration into a **new, isolated installation** using
PostgreSQL's `pg_restore`, the original keys and an application version compatible
with the backup. Do not overwrite a live database to test a restore.

## Updates

Read the changes and migration notes first. `main` is an evolving development
preview, not a stable release channel. Pin a reviewed commit for repeatable builds.

```sh
git pull --ff-only
docker compose up --build -d
docker compose ps
docker compose logs --tail=100 web worker
```

Back up before updating. Migrations run under a database lock and may change the
schema; rolling an application image back does not automatically roll migrations
back. Never use `docker compose down -v` on an installation whose data you need:
the `-v` option removes its named database volume.

## Sending and observability

Sending starts disabled. Enable it only after configuring a verified sender and
reviewing published flows and scheduled campaigns. Pausing retains queued delivery
work; enabling can resume it and send campaigns that are already due.

The health endpoint is `/api/health`. For startup or delivery diagnostics:

```sh
docker compose ps
docker compose logs --tail=100 web worker db
```

Redact credentials and customer information before sharing logs. The database and
application containers do not need to share any network with other applications.
