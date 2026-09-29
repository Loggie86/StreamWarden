import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluatePolicy } from "../src/index.ts";
import type { ProfilePolicy, RatingRecord } from "../src/index.ts";

const profiles: Record<string, ProfilePolicy> = {
  adultA: { profileId: "adult-a", country: "AU", maximumRating: null, unrestricted: true },
  adultB: { profileId: "adult-b", country: "AU", maximumRating: null, unrestricted: true },
  childA: { profileId: "child-a", country: "AU", maximumRating: "PG" },
  childB: { profileId: "child-b", country: "AU", maximumRating: "M" },
  childC: { profileId: "child-c", country: "AU", maximumRating: "MA15+" },
};

function rating(label: string, source = "fixture"): RatingRecord {
  return { country: "AU", label, source, confidence: "authoritative" };
}

describe("Australian household policy", () => {
  it("allows G and PG for the PG profile", () => {
    assert.equal(evaluatePolicy({ policy: profiles.childA, ratings: [rating("G")] }).allowed, true);
    assert.equal(evaluatePolicy({ policy: profiles.childA, ratings: [rating("PG")] }).allowed, true);
  });

  it("blocks M for the PG profile and allows it for M and MA15+ profiles", () => {
    assert.equal(evaluatePolicy({ policy: profiles.childA, ratings: [rating("M")] }).allowed, false);
    assert.equal(evaluatePolicy({ policy: profiles.childB, ratings: [rating("M")] }).allowed, true);
    assert.equal(evaluatePolicy({ policy: profiles.childC, ratings: [rating("M")] }).allowed, true);
  });

  it("allows MA15+ only for the MA15+ child profile", () => {
    assert.equal(evaluatePolicy({ policy: profiles.childA, ratings: [rating("MA15+")] }).allowed, false);
    assert.equal(evaluatePolicy({ policy: profiles.childB, ratings: [rating("MA15+")] }).allowed, false);
    assert.equal(evaluatePolicy({ policy: profiles.childC, ratings: [rating("MA15+")] }).allowed, true);
  });

  it("blocks R18+ and RC for all restricted profiles", () => {
    for (const profile of [profiles.childA, profiles.childB, profiles.childC]) {
      assert.equal(evaluatePolicy({ policy: profile, ratings: [rating("R18+")] }).allowed, false);
      assert.equal(evaluatePolicy({ policy: profile, ratings: [rating("RC")] }).allowed, false);
    }
  });

  it("never allows RC, including by approval or on an unrestricted profile", () => {
    const approved = evaluatePolicy({
      policy: profiles.childC,
      ratings: [rating("RC")],
      override: { decision: "APPROVE" },
    });
    const unrestricted = evaluatePolicy({
      policy: profiles.adultA,
      ratings: [rating("RC")],
    });
    assert.deepEqual([approved.allowed, approved.reason], [false, "REFUSED_CLASSIFICATION"]);
    assert.deepEqual([unrestricted.allowed, unrestricted.reason], [false, "REFUSED_CLASSIFICATION"]);
  });

  it("blocks missing or unrecognised ratings", () => {
    const missing = evaluatePolicy({ policy: profiles.childB, ratings: [] });
    const unrecognised = evaluatePolicy({ policy: profiles.childB, ratings: [rating("TV-14")] });
    assert.deepEqual([missing.allowed, missing.reason], [false, "RATING_UNKNOWN"]);
    assert.deepEqual([unrecognised.allowed, unrecognised.reason], [false, "RATING_UNKNOWN"]);
  });

  it("allows an explicitly approved unrated title for only that policy evaluation", () => {
    const approved = evaluatePolicy({
      policy: profiles.childB,
      ratings: [],
      override: { decision: "APPROVE" },
    });
    assert.deepEqual([approved.allowed, approved.reason], [true, "EXPLICIT_APPROVAL"]);
    assert.equal(evaluatePolicy({ policy: profiles.childA, ratings: [] }).allowed, false);
  });

  it("allows an explicit block to override ratings and approval", () => {
    const blocked = evaluatePolicy({
      policy: profiles.childA,
      ratings: [rating("PG")],
      override: { decision: "BLOCK" },
    });
    assert.deepEqual([blocked.allowed, blocked.reason], [false, "EXPLICIT_BLOCK"]);
  });

  it("allows unrestricted profiles unless explicitly blocked", () => {
    for (const profile of [profiles.adultA, profiles.adultB]) {
      assert.equal(evaluatePolicy({ policy: profile, ratings: [] }).allowed, true);
      assert.equal(
        evaluatePolicy({ policy: profile, ratings: [], override: { decision: "BLOCK" } }).allowed,
        false,
      );
    }
  });

  it("chooses the more restrictive rating when top-confidence sources conflict", () => {
    const result = evaluatePolicy({
      policy: profiles.childB,
      ratings: [rating("M", "source-a"), rating("MA15+", "source-b")],
    });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, "RATING_AMBIGUOUS");
    assert.equal(result.resolvedRating, "MA15+");
    assert.deepEqual(result.sources, ["source-a", "source-b"]);
  });

  it("prefers a higher-confidence source over a mapped rating", () => {
    const result = evaluatePolicy({
      policy: profiles.childB,
      ratings: [
        rating("M", "authority"),
        { country: "AU", label: "R18+", source: "mapping", confidence: "mapped" },
      ],
    });
    assert.equal(result.allowed, true);
    assert.equal(result.resolvedRating, "M");
    assert.equal(result.ambiguous, false);
  });
});
