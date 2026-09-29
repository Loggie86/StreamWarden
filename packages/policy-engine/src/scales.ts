import type { CountryCode, RatingConfidence, RatingRecord } from "./types.ts";

export interface RatingScale {
  ordered: readonly string[];
  alwaysBlocked: readonly string[];
}

const SCALES: Readonly<Record<string, RatingScale>> = {
  AU: {
    ordered: ["G", "PG", "M", "MA15+", "R18+", "X18+"],
    alwaysBlocked: ["RC"],
  },
};

const CONFIDENCE_RANK: Readonly<Record<RatingConfidence, number>> = {
  authoritative: 3,
  secondary: 2,
  mapped: 1,
};

export function getRatingScale(country: CountryCode): RatingScale | undefined {
  return SCALES[country];
}

export function ratingRank(scale: RatingScale, label: string): number | null {
  if (scale.alwaysBlocked.includes(label)) return Number.POSITIVE_INFINITY;
  const index = scale.ordered.indexOf(label);
  return index === -1 ? null : index;
}

export interface ResolvedRating {
  label: string | null;
  records: RatingRecord[];
  ambiguous: boolean;
}

export function resolveRating(
  country: CountryCode,
  ratings: readonly RatingRecord[],
): ResolvedRating {
  const scale = getRatingScale(country);
  if (!scale) return { label: null, records: [], ambiguous: false };

  const valid = ratings.filter(
    (rating) =>
      rating.country === country && ratingRank(scale, rating.label) !== null,
  );
  if (valid.length === 0) {
    return { label: null, records: [], ambiguous: false };
  }

  const highestConfidence = Math.max(
    ...valid.map((rating) => CONFIDENCE_RANK[rating.confidence]),
  );
  const strongest = valid.filter(
    (rating) => CONFIDENCE_RANK[rating.confidence] === highestConfidence,
  );
  const labels = new Set(strongest.map((rating) => rating.label));
  const mostRestrictive = strongest.reduce((current, candidate) => {
    const currentRank = ratingRank(scale, current.label) ?? -1;
    const candidateRank = ratingRank(scale, candidate.label) ?? -1;
    return candidateRank > currentRank ? candidate : current;
  });

  return {
    label: mostRestrictive.label,
    records: strongest,
    ambiguous: labels.size > 1,
  };
}
