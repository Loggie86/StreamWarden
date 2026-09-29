import { getRatingScale, ratingRank, resolveRating } from "./scales.ts";
import type { EvaluatePolicyInput, PolicyDecision } from "./types.ts";

export function evaluatePolicy(input: EvaluatePolicyInput): PolicyDecision {
  const { policy, ratings } = input;

  if (input.override?.decision === "BLOCK") {
    return decision(false, "EXPLICIT_BLOCK");
  }

  if (policy.unrestricted || policy.maximumRating === null) {
    return decision(true, "PROFILE_UNRESTRICTED");
  }

  if (input.override?.decision === "APPROVE") {
    return decision(true, "EXPLICIT_APPROVAL");
  }

  const scale = getRatingScale(policy.country);
  if (!scale) return decision(false, "RATING_UNKNOWN");

  const resolved = resolveRating(policy.country, ratings);
  if (resolved.label === null) return decision(false, "RATING_UNKNOWN");

  const titleRank = ratingRank(scale, resolved.label);
  const maximumRank = ratingRank(scale, policy.maximumRating);
  if (titleRank === null || maximumRank === null) {
    return decision(false, "RATING_UNKNOWN");
  }

  const allowed = titleRank <= maximumRank;
  return {
    allowed,
    reason: resolved.ambiguous
      ? "RATING_AMBIGUOUS"
      : allowed
        ? "RATING_ALLOWED"
        : "RATING_TOO_HIGH",
    resolvedRating: resolved.label,
    sources: [...new Set(resolved.records.map((record) => record.source))],
    ambiguous: resolved.ambiguous,
  };
}

function decision(
  allowed: boolean,
  reason: PolicyDecision["reason"],
): PolicyDecision {
  return {
    allowed,
    reason,
    resolvedRating: null,
    sources: [],
    ambiguous: false,
  };
}
