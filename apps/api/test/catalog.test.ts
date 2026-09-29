import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeRating, selectRating, TvdbCatalog } from "../src/catalog.ts";

describe("TheTVDB catalogue", () => {
  it("normalizes Australian classification labels conservatively", () => {
    assert.equal(normalizeRating("MA 15+"), "MA15+");
    assert.equal(normalizeRating("R 18+"), "R18+");
    assert.equal(normalizeRating("Refused Classification"), "RC");
    assert.equal(normalizeRating("CTC"), null);
    assert.equal(selectRating([
      { country: "USA", name: "TV-14" },
      { country: "AUS", name: "PG" },
    ], "AU"), "PG");
  });

  it("authenticates, searches and enriches titles with Australian ratings", async () => {
    const calls: string[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("/login")) {
        assert.equal(JSON.parse(String(init?.body)).apikey, "project-key");
        return Response.json({ data: { token: "token" } });
      }
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer token");
      if (url.includes("/search?")) {
        return Response.json({ data: [
          { tvdb_id: "42", name: "Bluey", type: "series", year: "2018" },
          { tvdb_id: "99", name: "Someone", type: "person" },
        ] });
      }
      if (url.includes("/series/42/extended")) {
        return Response.json({ data: { contentRatings: [{ country: "AUS", name: "G" }] } });
      }
      return new Response(null, { status: 404 });
    };
    const catalog = new TvdbCatalog("project-key", null, "https://tvdb.test/v4", fetcher);
    const titles = await catalog.search("Bluey", "AU");
    assert.deepEqual(titles.map(({ id, name, rating }) => ({ id, name, rating })), [
      { id: "tvdb:series:42", name: "Bluey", rating: "G" },
    ]);
    assert.equal(calls.filter((url) => url.endsWith("/login")).length, 1);
  });
});
