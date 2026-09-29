import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { loadConfig, type ApiConfig } from "./config.ts";
import { TvdbCatalog, type TitleCatalog } from "./catalog.ts";
import { StreamWardenStore, type SessionHousehold } from "./database.ts";
import { createMailer, type MagicLinkMailer } from "./mailer.ts";

const validRatings = new Set(["G", "PG", "M", "MA15+", "R18+", "X18+"]);

export interface ApiDependencies {
  config: ApiConfig;
  store: StreamWardenStore;
  mailer: MagicLinkMailer;
  catalog?: TitleCatalog | null;
  now?: () => number;
}

export function createApiServer(dependencies: ApiDependencies) {
  const requestCounts = new Map<string, { count: number; resetAt: number }>();
  const now = dependencies.now ?? Date.now;

  return createServer(async (request, response) => {
    securityHeaders(response);
    try {
      const url = new URL(request.url ?? "/", dependencies.config.publicBaseUrl);

      if (!isTrustedMutation(request, dependencies.config)) {
        sendJson(response, 403, { error: "Request origin is not allowed" });
        return;
      }

      if (request.method === "GET" && url.pathname === "/healthz") {
        sendJson(response, 200, { status: "ok" });
        return;
      }

      if (request.method === "GET" && await serveDashboard(url.pathname, response, dependencies.config)) {
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/auth/request") {
        const body = await readJson(request);
        const email = normalizeEmail(body.email);
        const remote = request.socket.remoteAddress ?? "unknown";
        const rateKey = hash(`${remote}:${email ?? "invalid"}`);
        if (!allowRequest(requestCounts, rateKey, now())) {
          sendJson(response, 429, { error: "Please wait before requesting another link." });
          return;
        }
        if (!email) {
          sendJson(response, 202, { accepted: true });
          return;
        }

        const token = randomToken();
        dependencies.store.createMagicLink(
          email,
          hash(token),
          hash(remote),
          now() + dependencies.config.magicLinkLifetimeMs,
          now(),
        );
        const magicLink = `${dependencies.config.publicBaseUrl}/api/auth/verify?token=${encodeURIComponent(token)}`;
        await dependencies.mailer.send(email, magicLink);
        sendJson(response, 202, {
          accepted: true,
          ...(dependencies.config.exposeDevelopmentLinks ? { developmentMagicLink: magicLink } : {}),
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/auth/verify") {
        const token = url.searchParams.get("token") ?? "";
        const email = token ? dependencies.store.consumeMagicLink(hash(token), now()) : null;
        if (!email) {
          sendJson(response, 400, { error: "This sign-in link is invalid or has expired." });
          return;
        }
        const householdId = dependencies.store.findOrCreateHousehold(email, now());
        const sessionToken = randomToken();
        dependencies.store.createSession(
          householdId,
          hash(sessionToken),
          now() + dependencies.config.sessionLifetimeMs,
          now(),
        );
        response.setHeader("Set-Cookie", sessionCookie(sessionToken, dependencies.config));
        response.writeHead(302, { Location: dependencies.config.dashboardPath }).end();
        return;
      }

      const session = authenticate(request, dependencies.store, now());

      if (request.method === "GET" && url.pathname === "/api/session") {
        if (!session) return unauthorized(response);
        sendJson(response, 200, {
          authenticated: true,
          household: {
            id: session.householdId,
            adminEmail: session.adminEmail,
            country: session.country,
          },
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/logout") {
        if (session) dependencies.store.deleteSession(session.sessionId);
        response.setHeader("Set-Cookie", clearSessionCookie(dependencies.config));
        sendJson(response, 204, null);
        return;
      }

      if (!session) return unauthorized(response);

      if (request.method === "GET" && url.pathname === "/api/titles/search") {
        const query = (url.searchParams.get("q") ?? "").trim();
        if (query.length < 2 || query.length > 100) return badRequest(response, "Search must be 2–100 characters");
        if (!dependencies.catalog) {
          sendJson(response, 503, { error: "TheTVDB is not configured" });
          return;
        }
        try {
          const titles = await dependencies.catalog.search(query, session.country);
          sendJson(response, 200, { titles });
        } catch (error) {
          console.error("TheTVDB search failed", error);
          sendJson(response, 502, { error: "Title search is temporarily unavailable" });
        }
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/profiles") {
        sendJson(response, 200, { profiles: dependencies.store.listProfiles(session.householdId) });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/profiles") {
        const body = await readJson(request);
        const name = cleanText(body.name, 80);
        const policy = parsePolicy(body);
        if (!name || !policy) return badRequest(response, "Invalid profile policy");
        const profile = dependencies.store.createProfile(
          session.householdId,
          name,
          policy.maximumRating,
          policy.unrestricted,
          now(),
        );
        sendJson(response, 201, { profile });
        return;
      }

      const profileMatch = url.pathname.match(/^\/api\/profiles\/([^/]+)$/);
      if (request.method === "PATCH" && profileMatch) {
        const body = await readJson(request);
        const policy = parsePolicy(body);
        if (!policy) return badRequest(response, "Invalid profile policy");
        const profile = dependencies.store.updateProfile(
          session.householdId,
          decodeURIComponent(profileMatch[1]),
          policy.maximumRating,
          policy.unrestricted,
        );
        if (!profile) return notFound(response);
        sendJson(response, 200, { profile });
        return;
      }

      const overridesMatch = url.pathname.match(/^\/api\/profiles\/([^/]+)\/overrides(?:\/([^/]+))?$/);
      if (overridesMatch) {
        const profileId = decodeURIComponent(overridesMatch[1]);
        const titleId = overridesMatch[2] ? decodeURIComponent(overridesMatch[2]) : null;
        if (request.method === "GET" && !titleId) {
          const overrides = dependencies.store.listOverrides(session.householdId, profileId);
          if (!overrides) return notFound(response);
          sendJson(response, 200, { overrides });
          return;
        }
        if (request.method === "PUT" && titleId) {
          const body = await readJson(request);
          const decision = body.decision === "APPROVE" || body.decision === "BLOCK" ? body.decision : null;
          const mediaType = body.mediaType === "movie" || body.mediaType === "series" ? body.mediaType : null;
          const titleName = cleanText(body.titleName, 200);
          if (!decision || !mediaType || !titleName) return badRequest(response, "Invalid override");
          if (!dependencies.store.setOverride(
            session.householdId,
            profileId,
            titleId,
            mediaType,
            titleName,
            decision,
            now(),
          )) return notFound(response);
          sendJson(response, 200, { saved: true });
          return;
        }
        if (request.method === "DELETE" && titleId) {
          if (!dependencies.store.deleteOverride(session.householdId, profileId, titleId)) return notFound(response);
          sendJson(response, 204, null);
          return;
        }
      }

      const installationMatch = url.pathname.match(/^\/api\/profiles\/([^/]+)\/installations$/);
      if (request.method === "POST" && installationMatch) {
        const profileId = decodeURIComponent(installationMatch[1]);
        const token = randomToken();
        const installationId = dependencies.store.createInstallation(
          session.householdId,
          profileId,
          hash(token),
          now(),
        );
        if (!installationId) return notFound(response);
        sendJson(response, 201, {
          installation: {
            id: installationId,
            manifestPath: `/addon/${token}/manifest.json`,
          },
        });
        return;
      }

      notFound(response);
    } catch (error) {
      if (error instanceof RequestError) {
        sendJson(response, error.status, { error: error.message });
        return;
      }
      console.error(error);
      sendJson(response, 500, { error: "Internal server error" });
    }
  });
}

function authenticate(request: IncomingMessage, store: StreamWardenStore, now: number): SessionHousehold | null {
  const cookies = parseCookies(request.headers.cookie ?? "");
  const token = cookies.streamwarden_session;
  return token ? store.getSession(hash(token), now) : null;
}

function parsePolicy(body: Record<string, unknown>) {
  const unrestricted = body.unrestricted === true;
  const maximumRating = unrestricted ? null : body.maximumRating;
  if (!unrestricted && (typeof maximumRating !== "string" || !validRatings.has(maximumRating))) return null;
  return { unrestricted, maximumRating: unrestricted ? null : maximumRating as string };
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLocaleLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null;
}

function cleanText(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned && cleaned.length <= maximum ? cleaned : null;
}

function allowRequest(
  counts: Map<string, { count: number; resetAt: number }>,
  key: string,
  now: number,
): boolean {
  const current = counts.get(key);
  if (!current || current.resetAt <= now) {
    counts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return true;
  }
  current.count += 1;
  return current.count <= 5;
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 64 * 1024) throw new RequestError(413, "Request body is too large");
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as Record<string, unknown>;
  } catch {
    throw new RequestError(400, "Invalid JSON");
  }
}

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function parseCookies(header: string): Record<string, string> {
  try {
    return Object.fromEntries(
      header.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
        const separator = part.indexOf("=");
        return separator === -1
          ? [part, ""]
          : [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
      }),
    );
  } catch {
    return {};
  }
}

function isTrustedMutation(request: IncomingMessage, config: ApiConfig): boolean {
  if (!request.method || ["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
  const origin = request.headers.origin;
  if (!origin) return !config.production;
  return origin === config.publicBaseUrl;
}

function sessionCookie(token: string, config: ApiConfig): string {
  return [
    `streamwarden_session=${encodeURIComponent(token)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${Math.floor(config.sessionLifetimeMs / 1000)}`,
    ...(config.production ? ["Secure"] : []),
  ].join("; ");
}

function clearSessionCookie(config: ApiConfig): string {
  return [
    "streamwarden_session=",
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0",
    ...(config.production ? ["Secure"] : []),
  ].join("; ");
}

function securityHeaders(response: ServerResponse): void {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

async function serveDashboard(pathname: string, response: ServerResponse, config: ApiConfig): Promise<boolean> {
  if (!config.dashboardDirectory || !["/", "/index.html", "/app.js", "/styles.css"].includes(pathname)) {
    return false;
  }
  const root = resolve(config.dashboardDirectory);
  const name = pathname === "/" ? "index.html" : pathname.slice(1);
  const file = resolve(root, name);
  if (file !== root && !file.startsWith(`${root}${sep}`)) return false;
  try {
    const body = await readFile(file);
    const types: Record<string, string> = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
    };
    response.writeHead(200, {
      "Content-Type": types[extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
      "Content-Length": body.length,
    });
    response.end(body);
  } catch {
    sendJson(response, 404, { error: "Dashboard asset not found" });
  }
  return true;
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  if (status === 204) {
    response.writeHead(status).end();
    return;
  }
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
}

function unauthorized(response: ServerResponse): void {
  sendJson(response, 401, { error: "Authentication required" });
}

function badRequest(response: ServerResponse, message: string): void {
  sendJson(response, 400, { error: message });
}

function notFound(response: ServerResponse): void {
  sendJson(response, 404, { error: "Not found" });
}

class RequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const isDirectRun = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isDirectRun) {
  const config = loadConfig();
  const store = new StreamWardenStore(config.databasePath);
  const mailer = createMailer(config);
  const catalog = config.tvdbApiKey
    ? new TvdbCatalog(config.tvdbApiKey, config.tvdbPin, config.tvdbBaseUrl)
    : null;
  createApiServer({ config, store, mailer, catalog }).listen(config.port, config.host, () => {
    console.log(`StreamWarden API listening on ${config.publicBaseUrl}`);
  });
}
