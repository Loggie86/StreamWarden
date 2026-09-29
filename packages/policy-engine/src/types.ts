export type CountryCode = "AU" | (string & {});

export type RatingConfidence = "authoritative" | "secondary" | "mapped";

export interface RatingRecord {
  country: CountryCode;
  label: string;
  source: string;
  confidence: RatingConfidence;
  retrievedAt?: string;
}

export interface ProfilePolicy {
  profileId: string;
  country: CountryCode;
  maximumRating: string | null;
  unrestricted?: boolean;
}

export type OverrideDecision = "APPROVE" | "BLOCK";

export interface TitleOverride {
  decision: OverrideDecision;
}

export type DecisionReason =
  | "PROFILE_UNRESTRICTED"
  | "EXPLICIT_BLOCK"
  | "EXPLICIT_APPROVAL"
  | "RATING_ALLOWED"
  | "RATING_TOO_HIGH"
  | "RATING_UNKNOWN"
  | "RATING_AMBIGUOUS";

export interface PolicyDecision {
  allowed: boolean;
  reason: DecisionReason;
  resolvedRating: string | null;
  sources: string[];
  ambiguous: boolean;
}

export interface EvaluatePolicyInput {
  policy: ProfilePolicy;
  override?: TitleOverride;
  ratings: RatingRecord[];
}
