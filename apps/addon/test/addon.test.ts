import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import { PROFILE_TOKENS } from "../src/fixtures.ts";
import { createGuardianServer } from "../src/server.ts";

const server = createGuardianServer();
let origin = "";

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  origin = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

async function get(path: string) {
  const response = await fetch(`${origin}${path}`);
  return { response, body: await response.json() };
}

describe("fixture add-on", () => {
  it("serves a profile-scoped manifest", async () => {
    const { response, body } = await get(`/${PROFILE_TOKENS.childA}/manifest.json`);
    assert.equal(response.status, 200);
    assert.equal(body.name, "Nuvio Guardian - Child A");
    assert.deepEqual(body.resources, ["catalog", "meta"]);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
  });

  it("filters the PG movie catalog", async () => {
    const { body } = await get(
      `/${PROFILE_TOKENS.childA}/catalog/movie/guardian-movies.json`,
    );
    assert.deepEqual(body.metas.map((meta: { name: string }) => meta.name), ["Family Orbit"]);
  });

  it("allows M titles for the M profile", async () => {
    const { body } = await get(
      `/${PROFILE_TOKENS.childB}/catalog/movie/guardian-movies.json`,
    );
    assert.deepEqual(body.metas.map((meta: { name: string }) => meta.name), [
      "Family Orbit",
      "Night Train",
    ]);
  });

  it("supports Stremio-style search extras", async () => {
    const { body } = await get(
      `/${PROFILE_TOKENS.childC}/catalog/series/guardian-series/search=wild.json`,
    );
    assert.deepEqual(body.metas.map((meta: { name: string }) => meta.name), ["Wild Signal"]);
  });

  it("hides unknown metadata for a restricted profile", async () => {
    const { body } = await get(
      `/${PROFILE_TOKENS.childC}/meta/movie/guardian:movie:unclassified.json`,
    );
    assert.equal(body.meta, null);
  });

  it("keeps RC hidden from an unrestricted profile", async () => {
    const { body } = await get(
      `/${PROFILE_TOKENS.adultA}/meta/movie/guardian:movie:rc-safety.json`,
    );
    assert.equal(body.meta, null);
  });

  it("returns allowed metadata with rating provenance", async () => {
    const { body } = await get(
      `/${PROFILE_TOKENS.childB}/meta/movie/guardian:movie:night-train.json`,
    );
    assert.equal(body.meta.name, "Night Train");
    assert.deepEqual(body.meta.guardian, {
      country: "AU",
      rating: "M",
      source: "guardian-fixture",
    });
  });

  it("rejects an unknown installation token", async () => {
    const { response } = await get("/not-a-token/manifest.json");
    assert.equal(response.status, 404);
  });
});
