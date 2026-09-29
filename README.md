# Nuvio Guardian

Profile-aware parental controls for Nuvio.

Nuvio Guardian is an open-source dashboard and add-on for applying country-specific content-rating limits to individual Nuvio profiles, with explicit movie and series approvals or blocks.

## Status

Nuvio Guardian is currently in the specification and prototype stage. The dashboard and add-on will be built first. Complete enforcement across discovery, deep links, libraries, and playback will require later native integration with Nuvio Mobile and Nuvio TV.

## Core policy

- Choose the household rating country during setup.
- Configure a maximum rating independently for each profile.
- Block titles with no reliable rating until explicitly approved.
- Apply exceptions to an entire movie or series.
- Explicit blocks always win.
- Manage every profile from one administrator dashboard.
- Ultimately enforce restrictions everywhere, including playback.

## Planned architecture

- TypeScript dashboard
- Authenticated policy API
- Country-aware rating engine
- Stremio-compatible Nuvio add-on
- Self-hosted container deployment
- Later native Nuvio Mobile and TV enforcement adapters

See [the technical specification](docs/technical-specification.md) for the agreed requirements, limitations, acceptance tests, and delivery sequence.

## Distribution

A public hosted version is planned to be free and donation-supported. The complete project will also support self-hosting without reducing policy or enforcement capabilities.

## Important limitation

The initial add-on can filter only the catalogs, search, and metadata it provides. It cannot intercept content exposed by other add-ons or every Nuvio playback route. Nuvio Guardian will not claim complete parental enforcement until native client checks are implemented.

## License

Nuvio Guardian is licensed under the [GNU Affero General Public License v3.0](LICENSE).


## Development

The first implemented component is the dependency-free TypeScript policy engine.

```bash
npm test
```

Node.js 24 or newer is required. The repository currently contains:

- `packages/policy-engine` - rating resolution and policy decisions
- `apps/dashboard` - administrator dashboard placeholder
- `apps/addon` - Stremio-compatible add-on placeholder
- `.github/workflows/test.yml` - automated policy tests
