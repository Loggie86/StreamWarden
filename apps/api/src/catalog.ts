export type CatalogRating = "G" | "PG" | "M" | "MA15+" | "R18+" | "X18+" | "RC";

export interface CatalogTitle {
  id: string;
  name: string;
  type: "Movie" | "Series";
  year: number | null;
  rating: CatalogRating | null;
  ratingCountry: string;
  imageUrl: string | null;
  source: "TheTVDB";
}

export interface TitleCatalog {
  search(query: string, country: string): Promise<CatalogTitle[]>;
}

interface TvdbSearchResult {
  tvdb_id?: string;
  id?: string;
  name?: string;
  title?: string;
  name_translated?: string;
  type?: string;
  year?: string;
  image_url?: string;
  poster?: string;
}

interface TvdbContentRating {
  name?: string;
  country?: string;
}

interface TvdbExtendedRecord {
  contentRatings?: TvdbContentRating[];
}

type Fetcher = typeof fetch;

export class TvdbCatalog implements TitleCatalog {
  private token: string | null = null;
  private tokenExpiresAt = 0;
  private readonly cache = new Map<string, { expiresAt: number; titles: CatalogTitle[] }>();

  private readonly apiKey: string;
  private readonly pin: string | null;
  private readonly baseUrl: string;
  private readonly fetcher: Fetcher;
  private readonly now: () => number;

  constructor(
    apiKey: string,
    pin: string | null = null,
    baseUrl = "https://api4.thetvdb.com/v4",
    fetcher: Fetcher = fetch,
    now: () => number = Date.now,
  ) {
    this.apiKey = apiKey;
    this.pin = pin;
    this.baseUrl = baseUrl;
    this.fetcher = fetcher;
    this.now = now;
  }

  async search(query: string, country: string): Promise<CatalogTitle[]> {
    const cleanQuery = query.trim();
    const cleanCountry = country.trim().toUpperCase();
    const cacheKey = `${cleanCountry}:${cleanQuery.toLocaleLowerCase()}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > this.now()) return cached.titles;

    const response = await this.request<{ data?: TvdbSearchResult[] }>(
      `/search?query=${encodeURIComponent(cleanQuery)}&limit=10`,
    );
    const candidates = (response.data ?? [])
      .filter((item) => item.type === "movie" || item.type === "series")
      .slice(0, 10);
    const titles = await Promise.all(candidates.map((item) => this.enrich(item, cleanCountry)));
    const available = rankSearchResults(
      titles.filter((title): title is CatalogTitle => title !== null),
      cleanQuery,
    ).slice(0, 8);
    this.cache.set(cacheKey, { expiresAt: this.now() + 10 * 60 * 1000, titles: available });
    return available;
  }

  private async enrich(item: TvdbSearchResult, country: string): Promise<CatalogTitle | null> {
    const mediaType = item.type === "movie" ? "movie" : item.type === "series" ? "series" : null;
    const tvdbId = item.tvdb_id ?? item.id;
    const name = item.name_translated ?? item.name ?? item.title;
    if (!mediaType || !tvdbId || !name) return null;

    let rating: CatalogRating | null = null;
    try {
      const response = await this.request<{ data?: TvdbExtendedRecord }>(
        `/${mediaType === "movie" ? "movies" : "series"}/${encodeURIComponent(tvdbId)}/extended?short=true`,
      );
      rating = selectRating(response.data?.contentRatings ?? [], country);
    } catch {
      // A title without a usable rating remains visible and is blocked by default.
    }

    const parsedYear = Number.parseInt(item.year ?? "", 10);
    return {
      id: `tvdb:${mediaType}:${tvdbId}`,
      name,
      type: mediaType === "movie" ? "Movie" : "Series",
      year: Number.isFinite(parsedYear) ? parsedYear : null,
      rating,
      ratingCountry: country,
      imageUrl: item.image_url ?? item.poster ?? null,
      source: "TheTVDB",
    };
  }

  private async request<T>(path: string, retry = true): Promise<T> {
    const token = await this.getToken();
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });
    if (response.status === 401 && retry) {
      this.token = null;
      this.tokenExpiresAt = 0;
      return this.request<T>(path, false);
    }
    if (!response.ok) throw new Error(`TheTVDB request failed with status ${response.status}`);
    return await response.json() as T;
  }

  private async getToken(): Promise<string> {
    if (this.token && this.tokenExpiresAt > this.now()) return this.token;
    const body: { apikey: string; pin?: string } = { apikey: this.apiKey };
    if (this.pin) body.pin = this.pin;
    const response = await this.fetcher(`${this.baseUrl}/login`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`TheTVDB authentication failed with status ${response.status}`);
    const payload = await response.json() as { data?: { token?: string } };
    const token = payload.data?.token;
    if (!token) throw new Error("TheTVDB authentication returned no token");
    this.token = token;
    this.tokenExpiresAt = this.now() + 28 * 24 * 60 * 60 * 1000;
    return token;
  }
}

export function rankSearchResults(titles: CatalogTitle[], query: string): CatalogTitle[] {
  const normalizedQuery = normalizeSearchText(query);
  const unique = new Map<string, CatalogTitle>();
  for (const title of titles) {
    const key = `${title.type}:${normalizeSearchText(title.name)}:${title.year ?? "unknown"}`;
    const existing = unique.get(key);
    if (!existing || (!existing.rating && title.rating) || (!existing.imageUrl && title.imageUrl)) {
      unique.set(key, title);
    }
  }

  return [...unique.values()].sort((left, right) => {
    const scoreDifference = relevanceScore(right, normalizedQuery) - relevanceScore(left, normalizedQuery);
    if (scoreDifference !== 0) return scoreDifference;
    const yearDifference = (right.year ?? 0) - (left.year ?? 0);
    return yearDifference || left.name.localeCompare(right.name);
  });
}

function relevanceScore(title: CatalogTitle, normalizedQuery: string): number {
  const normalizedName = normalizeSearchText(title.name);
  let score = 0;
  if (normalizedName === normalizedQuery) score += 800;
  else if (normalizedName.startsWith(normalizedQuery)) score += 500;
  else if (normalizedName.includes(normalizedQuery)) score += 250;
  if (title.rating) score += 400;
  if (title.imageUrl) score += 40;
  if (title.year) score += Math.max(0, Math.min(title.year, new Date().getUTCFullYear() + 2) - 1900);
  return score;
}

function normalizeSearchText(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function selectRating(ratings: TvdbContentRating[], country: string): CatalogRating | null {
  const countryAliases = country.toUpperCase() === "AU"
    ? new Set(["AU", "AUS", "AUSTRALIA"])
    : new Set([country.toUpperCase()]);
  const match = ratings.find((rating) => countryAliases.has((rating.country ?? "").trim().toUpperCase()));
  return normalizeRating(match?.name ?? null);
}

export function normalizeRating(value: string | null): CatalogRating | null {
  if (!value) return null;
  const compact = value.toUpperCase().replace(/[\s._-]/g, "");
  const aliases: Record<string, CatalogRating> = {
    G: "G",
    PG: "PG",
    M: "M",
    MA15: "MA15+",
    "MA15+": "MA15+",
    R18: "R18+",
    "R18+": "R18+",
    X18: "X18+",
    "X18+": "X18+",
    RC: "RC",
    REFUSEDCLASSIFICATION: "RC",
  };
  return aliases[compact] ?? null;
}
