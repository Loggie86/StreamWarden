# Nuvio Guardian

Profile-aware parental controls for Nuvio.

Nuvio Guardian is an open-source dashboard and add-on for applying country-specific content-rating limits to individual Nuvio profiles, with explicit movie and series approvals or blocks.

## Status

Nuvio Guardian is in active prototype development. The policy engine, administrator dashboard prototype, fixture add-on, and authenticated policy API are implemented. Complete enforcement across discovery, deep links, libraries, and playback will require later native integration with Nuvio Mobile and Nuvio TV.

## Core policy

- Choose the household rating country during setup.
- Configure a maximum rating independently for each profile.
- Block titles with no reliable rating until explicitly approved.
- Apply exceptions to an entire movie or series.
- Explicit blocks always win.
- Manage every profile from one administrator dashboard.
- Ultimately enforce restrictions everywhere, including playback.

## Architecture

- TypeScript administrator dashboard
- Magic-link-authenticated policy API
- SQLite household, profile, override, installation, and session storage
- Country-aware rating engine
- Stremio-compatible Nuvio add-on
- Self-hosted container deployment
- Later native Nuvio Mobile and TV enforcement adapters

See [the technical specification](docs/technical-specification.md) for the agreed requirements, limitations, acceptance tests, and delivery sequence.

## Distribution

A public hosted version is planned to be free and donation-supported. The complete project will also support self-hosting without reducing policy or enforcement capabilities.

## Important limitation

The initial add-on can filter only the catalogs, search, and metadata it provides. It cannot intercept content exposed by other add-ons or every Nuvio playback route. Nuvio Guardian will not claim complete parental enforcement until native client checks are implemented.

## Development

Node.js 24 or newer is required.

```bash
npm test
```

The repository currently contains:

- `packages/policy-engine` - rating resolution and policy decisions
- `apps/dashboard` - administrator dashboard prototype
- `apps/addon` - profile-scoped fixture add-on
- `apps/api` - magic-link authentication and persistent household policy API
- `.github/workflows/test.yml` - automated tests

## Dashboard prototype

The browser dashboard supports Australian limits, unrestricted profiles, whole-title approve/block exceptions, decision previews, and fixture-title search. It automatically uses the authenticated policy API when served by it, while GitHub Pages remains a local-data demo.

```bash
npm run dashboard:dev
```

Open `http://localhost:4173` for demo mode. The public prototype is at [loggie86.github.io/nuvio-guardian](https://loggie86.github.io/nuvio-guardian/). A hosted or self-hosted API deployment serves the same dashboard with magic-link sign-in and persistent household data. Complete playback enforcement is not implemented yet.

## Policy API and magic links

The API provides passwordless administrator sign-in, server-side sessions, profiles, whole-title overrides, and installation credentials backed by SQLite.

```bash
EXPOSE_DEV_MAGIC_LINKS=1 npm run api:start
```

Development links are printed to the server console. Production uses Resend and refuses to start with console email delivery. See [the API guide](apps/api/README.md) for environment variables and security behavior.

## Fixture add-on

A dependency-free Stremio-compatible HTTP service exposes profile-scoped manifests, filtered movie and series catalogs, search, and metadata.

```bash
npm run addon:start
```

See [the add-on guide](apps/addon/README.md) for fixture installation URLs. The service uses fake titles and public demo tokens until it is connected to the policy API and licensed rating data.

## License

Nuvio Guardian is licensed under the [GNU Affero General Public License v3.0](LICENSE).
