# Policy API

The API stores households, profiles, rating limits, title overrides, add-on
installation records, one-time magic links, and sessions in SQLite.

## Development

```bash
EXPOSE_DEV_MAGIC_LINKS=1 npm run api:start
```

Magic links are printed to the server console in development. Production mode
refuses to start with console delivery.

Copy `apps/api/.env.example` into your preferred environment manager, then run
the service from the repository root. The API listens on port 8080 by default.

## Production environment

```text
NODE_ENV=production
PUBLIC_BASE_URL=https://app.streamwarden.example
STREAMWARDEN_DB_PATH=/data/streamwarden.sqlite
MAIL_PROVIDER=resend
RESEND_API_KEY=...
AUTH_FROM_EMAIL=StreamWarden <login@example.com>
```

Only SHA-256 token hashes are stored. Magic links expire after 15 minutes and
are single-use. Sessions use an HttpOnly, Secure, SameSite=Lax cookie and expire
after 30 days. Production state-changing requests must include an `Origin`
header that exactly matches `PUBLIC_BASE_URL`.

The dashboard and API are designed to be served from the same origin. The
API serves the built dashboard from `DASHBOARD_DIR` (default
`./apps/dashboard/dist`). The GitHub Pages version automatically falls back to
local demo data because it has no policy API.
