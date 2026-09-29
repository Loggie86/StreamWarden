import type { ProfilePolicy, RatingRecord, TitleOverride } from "../../../packages/policy-engine/src/index.ts";

export type AddonType = "movie" | "series";

export interface FixtureTitle {
  id: string;
  type: AddonType;
  name: string;
  year: number;
  description: string;
  genres: string[];
  rating: RatingRecord | null;
}

export interface FixtureProfile {
  name: string;
  policy: ProfilePolicy;
  overrides: Record<string, TitleOverride>;
}

export const PROFILE_TOKENS = {
  childA: "demo-child-a-5f8c2d",
  childB: "demo-child-b-8a4e1c",
  childC: "demo-child-c-9d7b3f",
  adultA: "demo-adult-a-2c6e9a",
} as const;

export const profiles: Record<string, FixtureProfile> = {
  [PROFILE_TOKENS.childA]: {
    name: "Child A",
    policy: { profileId: "child-a", country: "AU", maximumRating: "PG" },
    overrides: {},
  },
  [PROFILE_TOKENS.childB]: {
    name: "Child B",
    policy: { profileId: "child-b", country: "AU", maximumRating: "M" },
    overrides: {},
  },
  [PROFILE_TOKENS.childC]: {
    name: "Child C",
    policy: { profileId: "child-c", country: "AU", maximumRating: "MA15+" },
    overrides: {},
  },
  [PROFILE_TOKENS.adultA]: {
    name: "Adult A",
    policy: {
      profileId: "adult-a",
      country: "AU",
      maximumRating: null,
      unrestricted: true,
    },
    overrides: {},
  },
};

function australianRating(label: string): RatingRecord {
  return {
    country: "AU",
    label,
    source: "streamwarden-fixture",
    confidence: "authoritative",
  };
}

export const titles: FixtureTitle[] = [
  {
    id: "streamwarden:movie:family-orbit",
    type: "movie",
    name: "Family Orbit",
    year: 2025,
    description: "A family crosses Australia to watch a rare celestial event.",
    genres: ["Family", "Adventure"],
    rating: australianRating("G"),
  },
  {
    id: "streamwarden:series:blue-harbour",
    type: "series",
    name: "Blue Harbour",
    year: 2024,
    description: "Young friends solve mysteries around their coastal town.",
    genres: ["Family", "Mystery"],
    rating: australianRating("PG"),
  },
  {
    id: "streamwarden:movie:night-train",
    type: "movie",
    name: "Night Train",
    year: 2026,
    description: "A tense overnight journey reveals an unexpected conspiracy.",
    genres: ["Drama", "Thriller"],
    rating: australianRating("M"),
  },
  {
    id: "streamwarden:series:wild-signal",
    type: "series",
    name: "Wild Signal",
    year: 2025,
    description: "A remote research crew detects a signal beneath the desert.",
    genres: ["Science Fiction", "Drama"],
    rating: australianRating("MA15+"),
  },
  {
    id: "streamwarden:movie:last-outpost",
    type: "movie",
    name: "The Last Outpost",
    year: 2023,
    description: "Survivors defend an isolated settlement after a global collapse.",
    genres: ["Action", "Drama"],
    rating: australianRating("R18+"),
  },
  {
    id: "streamwarden:movie:unclassified",
    type: "movie",
    name: "Unclassified Fixture",
    year: 2026,
    description: "A test title with no reliable classification.",
    genres: ["Fixture"],
    rating: null,
  },
  {
    id: "streamwarden:movie:rc-safety",
    type: "movie",
    name: "RC Safety Fixture",
    year: 2026,
    description: "A non-playable test record for refused-classification handling.",
    genres: ["Fixture"],
    rating: australianRating("RC"),
  },
];
