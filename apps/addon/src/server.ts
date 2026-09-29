import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { evaluatePolicy } from "../../../packages/policy-engine/src/index.ts";
import { profiles, titles, type AddonType, type FixtureProfile, type FixtureTitle } from "./fixtures.ts";

const catalogIds: Record<AddonType, string> = {
  movie: "streamwarden-movies",
  series: "streamwarden-series",
};

export function createStreamWardenServer() {
  return createServer((request, response) => {
    try {
      route(request, response);
    } catch (error) {
      console.error(error);
      send(response, 500, { error: "Internal server error" });
    }
  });
}

function route(request: IncomingMessage, response: ServerResponse): void {
  setCors(response);
  if (request.method === "OPTIONS") {
    response.writeHead(204).end();
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    send(response, 405, { error: "Method not allowed" });
    return;
  }

  const url = new URL(request.url ?? "/", "http://streamwarden.local");
  if (url.pathname === "/healthz") {
    send(response, 200, { status: "ok" }, request.method === "HEAD");
    return;
  }

  const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const profile = profiles[segments[0] ?? ""];
  if (!profile) {
    send(response, 404, { error: "Unknown or revoked profile installation" });
    return;
  }

  if (segments.length === 2 && segments[1] === "manifest.json") {
    send(response, 200, manifest(profile), request.method === "HEAD");
    return;
  }

  if (segments[1] === "catalog" && segments.length >= 4) {
    const type = segments[2] as AddonType;
    const id = removeJson(segments[3]);
    if (!isAddonType(type) || catalogIds[type] !== id) {
      send(response, 404, { error: "Unknown catalog" });
      return;
    }
    const extra = segments[4] ? new URLSearchParams(removeJson(segments[4])) : url.searchParams;
    const search = extra.get("search")?.trim().toLocaleLowerCase() ?? "";
    const metas = allowedTitles(profile, type)
      .filter((title) => !search || searchable(title).includes(search))
      .map(toMetaPreview);
    send(response, 200, { metas }, request.method === "HEAD");
    return;
  }

  if (segments[1] === "meta" && segments.length === 4) {
    const type = segments[2] as AddonType;
    const id = removeJson(segments[3]);
    const title = titles.find((candidate) => candidate.type === type && candidate.id === id);
    if (!title || !isAllowed(profile, title)) {
      send(response, 200, { meta: null }, request.method === "HEAD");
      return;
    }
    send(response, 200, { meta: toMeta(title) }, request.method === "HEAD");
    return;
  }

  send(response, 404, { error: "Not found" });
}

function manifest(profile: FixtureProfile) {
  return {
    id: "community.streamwarden.nuvio",
    version: "0.1.0",
    name: `StreamWarden for Nuvio - ${profile.name}`,
    description: "Profile-aware Nuvio catalogs filtered by StreamWarden policy.",
    resources: ["catalog", "meta"],
    types: ["movie", "series"],
    catalogs: [
      {
        type: "movie",
        id: catalogIds.movie,
        name: "StreamWarden Movies",
        extra: [{ name: "search", isRequired: false }],
      },
      {
        type: "series",
        id: catalogIds.series,
        name: "StreamWarden Series",
        extra: [{ name: "search", isRequired: false }],
      },
    ],
    idPrefixes: ["streamwarden:"],
    behaviorHints: { configurable: false, configurationRequired: false },
  };
}

function allowedTitles(profile: FixtureProfile, type: AddonType): FixtureTitle[] {
  return titles.filter((title) => title.type === type && isAllowed(profile, title));
}

function isAllowed(profile: FixtureProfile, title: FixtureTitle): boolean {
  return evaluatePolicy({
    policy: profile.policy,
    override: profile.overrides[title.id],
    ratings: title.rating ? [title.rating] : [],
  }).allowed;
}

function toMetaPreview(title: FixtureTitle) {
  return {
    id: title.id,
    type: title.type,
    name: title.name,
    releaseInfo: String(title.year),
    description: title.description,
    genres: title.genres,
  };
}

function toMeta(title: FixtureTitle) {
  return {
    ...toMetaPreview(title),
    streamwarden: {
      country: title.rating?.country ?? "AU",
      rating: title.rating?.label ?? null,
      source: title.rating?.source ?? null,
    },
  };
}

function searchable(title: FixtureTitle): string {
  return `${title.name} ${title.year} ${title.genres.join(" ")}`.toLocaleLowerCase();
}

function removeJson(value: string): string {
  return value.endsWith(".json") ? value.slice(0, -5) : value;
}

function isAddonType(value: string): value is AddonType {
  return value === "movie" || value === "series";
}

function setCors(response: ServerResponse): void {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function send(
  response: ServerResponse,
  status: number,
  value: unknown,
  head = false,
): void {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(head ? undefined : body);
}

const isDirectRun = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isDirectRun) {
  const port = Number.parseInt(process.env.PORT ?? "7000", 10);
  const host = process.env.HOST ?? "0.0.0.0";
  createStreamWardenServer().listen(port, host, () => {
    console.log(`StreamWarden for Nuvio add-on listening on http://${host}:${port}`);
  });
}
