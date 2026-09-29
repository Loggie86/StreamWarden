# Add-on

The fixture-backed add-on exposes Stremio-compatible manifest, catalog, search,
and metadata resources filtered through the shared policy engine.

```bash
npm run addon:start
```

The development server listens on port `7000`. Example fixture manifests:

- `http://localhost:7000/demo-child-a-5f8c2d/manifest.json` (PG)
- `http://localhost:7000/demo-child-b-8a4e1c/manifest.json` (M)
- `http://localhost:7000/demo-child-c-9d7b3f/manifest.json` (MA15+)
- `http://localhost:7000/demo-adult-a-2c6e9a/manifest.json` (unrestricted)

These tokens are public test fixtures, not production credentials. Production
installation identifiers will be random, revocable, and profile-scoped.

The add-on cannot intercept catalogs or playback paths belonging to other
add-ons. Complete enforcement still requires native Nuvio integration.
