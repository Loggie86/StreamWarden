import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import type { ApiConfig } from "../src/config.ts";
import { GuardianStore } from "../src/database.ts";
import type { MagicLinkMailer } from "../src/mailer.ts";
import { createApiServer } from "../src/server.ts";

const links: string[] = [];
const mailer: MagicLinkMailer = {
  async send(_email, link) {
    links.push(link);
  },
};
const config: ApiConfig = {
  host: "127.0.0.1",
  port: 0,
  databasePath: ":memory:",
  publicBaseUrl: "http://127.0.0.1",
  dashboardPath: "/",
  dashboardDirectory: null,
  mailProvider: "console",
  resendApiKey: null,
  authFromEmail: null,
  exposeDevelopmentLinks: false,
  production: false,
  magicLinkLifetimeMs: 15 * 60 * 1000,
  sessionLifetimeMs: 30 * 24 * 60 * 60 * 1000,
};
const store = new GuardianStore(":memory:");
const server = createApiServer({ config, store, mailer });
let origin = "";
let sessionCookie = "";

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  config.publicBaseUrl = origin;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  store.close();
});

async function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (sessionCookie) headers.set("Cookie", sessionCookie);
  if (init.body) headers.set("Content-Type", "application/json");
  return fetch(`${origin}${path}`, { ...init, headers, redirect: "manual" });
}

describe("magic-link policy API", () => {
  it("does not expose unauthenticated household data", async () => {
    assert.equal((await request("/api/profiles")).status, 401);
  });

  it("rejects state changes from a different browser origin", async () => {
    const response = await request("/api/auth/request", {
      method: "POST",
      headers: { Origin: "https://attacker.example" },
      body: JSON.stringify({ email: "parent@example.com" }),
    });
    assert.equal(response.status, 403);
    assert.equal(links.length, 0);
  });

  it("requests and consumes a single-use magic link", async () => {
    const requested = await request("/api/auth/request", {
      method: "POST",
      body: JSON.stringify({ email: "parent@example.com" }),
    });
    assert.equal(requested.status, 202);
    assert.equal(links.length, 1);

    const path = new URL(links[0]).pathname + new URL(links[0]).search;
    const verified = await request(path);
    assert.equal(verified.status, 302);
    const setCookie = verified.headers.get("set-cookie");
    assert.match(setCookie ?? "", /guardian_session=/);
    assert.match(setCookie ?? "", /HttpOnly/);
    assert.match(setCookie ?? "", /SameSite=Lax/);
    sessionCookie = (setCookie ?? "").split(";")[0];

    const reused = await request(path);
    assert.equal(reused.status, 400);
  });

  it("creates a household and primary profile", async () => {
    const session = await request("/api/session");
    assert.equal(session.status, 200);
    const profiles = await (await request("/api/profiles")).json();
    assert.equal(profiles.profiles.length, 1);
    assert.equal(profiles.profiles[0].name, "Primary");
    assert.equal(profiles.profiles[0].unrestricted, true);
  });

  it("creates and updates a restricted profile", async () => {
    const created = await request("/api/profiles", {
      method: "POST",
      body: JSON.stringify({ name: "Child", maximumRating: "PG", unrestricted: false }),
    });
    assert.equal(created.status, 201);
    const profile = (await created.json()).profile;
    assert.equal(profile.maximumRating, "PG");

    const updated = await request(`/api/profiles/${profile.id}`, {
      method: "PATCH",
      body: JSON.stringify({ maximumRating: "M", unrestricted: false }),
    });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).profile.maximumRating, "M");
  });

  it("persists whole-title overrides and creates a one-time installation secret", async () => {
    const profiles = await (await request("/api/profiles")).json();
    const child = profiles.profiles.find((profile: { name: string }) => profile.name === "Child");
    const override = await request(`/api/profiles/${child.id}/overrides/guardian%3Amovie%3Anight-train`, {
      method: "PUT",
      body: JSON.stringify({ decision: "BLOCK", mediaType: "movie", titleName: "Night Train" }),
    });
    assert.equal(override.status, 200);
    const saved = await (await request(`/api/profiles/${child.id}/overrides`)).json();
    assert.equal(saved.overrides[0].decision, "BLOCK");

    const installation = await request(`/api/profiles/${child.id}/installations`, { method: "POST" });
    assert.equal(installation.status, 201);
    assert.match((await installation.json()).installation.manifestPath, /^\/addon\/.+\/manifest\.json$/);
  });

  it("logs out and invalidates the session", async () => {
    assert.equal((await request("/api/logout", { method: "POST" })).status, 204);
    assert.equal((await request("/api/session")).status, 401);
  });
});
