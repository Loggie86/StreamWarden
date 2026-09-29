import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface SessionHousehold {
  sessionId: string;
  householdId: string;
  adminEmail: string;
  country: string;
}

export interface StoredProfile {
  id: string;
  householdId: string;
  name: string;
  maximumRating: string | null;
  unrestricted: boolean;
  primary: boolean;
}

export class StreamWardenStore {
  readonly database: DatabaseSync;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    this.database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
    this.migrate();
  }

  close(): void {
    this.database.close();
  }

  migrate(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS households (
        id TEXT PRIMARY KEY,
        admin_email TEXT NOT NULL UNIQUE,
        country TEXT NOT NULL DEFAULT 'AU',
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        maximum_rating TEXT,
        unrestricted INTEGER NOT NULL DEFAULT 0,
        is_primary INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS title_overrides (
        profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        title_id TEXT NOT NULL,
        media_type TEXT NOT NULL,
        title_name TEXT NOT NULL,
        decision TEXT NOT NULL CHECK(decision IN ('APPROVE', 'BLOCK')),
        updated_at INTEGER NOT NULL,
        PRIMARY KEY(profile_id, title_id)
      );
      CREATE TABLE IF NOT EXISTS installations (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        revoked_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS magic_links (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at INTEGER NOT NULL,
        used_at INTEGER,
        requested_ip_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_profiles_household ON profiles(household_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_hash ON sessions(token_hash);
      CREATE INDEX IF NOT EXISTS idx_magic_links_hash ON magic_links(token_hash);
    `);
  }

  createMagicLink(email: string, tokenHash: string, ipHash: string, expiresAt: number, now: number): void {
    this.database.prepare(`
      INSERT INTO magic_links(id, email, token_hash, expires_at, requested_ip_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), email, tokenHash, expiresAt, ipHash, now);
  }

  consumeMagicLink(tokenHash: string, now: number): string | null {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const row = this.database.prepare(`
        SELECT id, email FROM magic_links
        WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?
      `).get(tokenHash, now) as { id: string; email: string } | undefined;
      if (!row) {
        this.database.exec("ROLLBACK");
        return null;
      }
      this.database.prepare("UPDATE magic_links SET used_at = ? WHERE id = ?").run(now, row.id);
      this.database.exec("COMMIT");
      return row.email;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  findOrCreateHousehold(email: string, now: number): string {
    const existing = this.database.prepare("SELECT id FROM households WHERE admin_email = ?").get(email) as
      | { id: string }
      | undefined;
    if (existing) return existing.id;

    const householdId = randomUUID();
    const profileId = randomUUID();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare(`
        INSERT INTO households(id, admin_email, country, created_at) VALUES (?, ?, 'AU', ?)
      `).run(householdId, email, now);
      this.database.prepare(`
        INSERT INTO profiles(id, household_id, name, maximum_rating, unrestricted, is_primary, created_at)
        VALUES (?, ?, 'Primary', NULL, 1, 1, ?)
      `).run(profileId, householdId, now);
      this.database.exec("COMMIT");
      return householdId;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  createSession(householdId: string, tokenHash: string, expiresAt: number, now: number): string {
    const id = randomUUID();
    this.database.prepare(`
      INSERT INTO sessions(id, household_id, token_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, householdId, tokenHash, expiresAt, now);
    return id;
  }

  getSession(tokenHash: string, now: number): SessionHousehold | null {
    const row = this.database.prepare(`
      SELECT s.id AS session_id, h.id AS household_id, h.admin_email, h.country
      FROM sessions s JOIN households h ON h.id = s.household_id
      WHERE s.token_hash = ? AND s.expires_at > ?
    `).get(tokenHash, now) as
      | { session_id: string; household_id: string; admin_email: string; country: string }
      | undefined;
    return row
      ? {
          sessionId: row.session_id,
          householdId: row.household_id,
          adminEmail: row.admin_email,
          country: row.country,
        }
      : null;
  }

  deleteSession(id: string): void {
    this.database.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  }

  listProfiles(householdId: string): StoredProfile[] {
    const rows = this.database.prepare(`
      SELECT id, household_id, name, maximum_rating, unrestricted, is_primary
      FROM profiles WHERE household_id = ? ORDER BY is_primary DESC, created_at ASC
    `).all(householdId) as Array<{
      id: string;
      household_id: string;
      name: string;
      maximum_rating: string | null;
      unrestricted: number;
      is_primary: number;
    }>;
    return rows.map((row) => ({
      id: row.id,
      householdId: row.household_id,
      name: row.name,
      maximumRating: row.maximum_rating,
      unrestricted: Boolean(row.unrestricted),
      primary: Boolean(row.is_primary),
    }));
  }

  createProfile(
    householdId: string,
    name: string,
    maximumRating: string | null,
    unrestricted: boolean,
    now: number,
  ): StoredProfile {
    const id = randomUUID();
    this.database.prepare(`
      INSERT INTO profiles(id, household_id, name, maximum_rating, unrestricted, is_primary, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?)
    `).run(id, householdId, name, maximumRating, unrestricted ? 1 : 0, now);
    return this.getProfile(householdId, id)!;
  }

  getProfile(householdId: string, profileId: string): StoredProfile | null {
    return this.listProfiles(householdId).find((profile) => profile.id === profileId) ?? null;
  }

  updateProfile(
    householdId: string,
    profileId: string,
    maximumRating: string | null,
    unrestricted: boolean,
  ): StoredProfile | null {
    const result = this.database.prepare(`
      UPDATE profiles SET maximum_rating = ?, unrestricted = ?
      WHERE id = ? AND household_id = ?
    `).run(maximumRating, unrestricted ? 1 : 0, profileId, householdId);
    return result.changes === 1 ? this.getProfile(householdId, profileId) : null;
  }

  listOverrides(householdId: string, profileId: string) {
    if (!this.getProfile(householdId, profileId)) return null;
    return this.database.prepare(`
      SELECT title_id AS titleId, media_type AS mediaType, title_name AS titleName,
             decision, updated_at AS updatedAt
      FROM title_overrides WHERE profile_id = ? ORDER BY updated_at DESC
    `).all(profileId);
  }

  setOverride(
    householdId: string,
    profileId: string,
    titleId: string,
    mediaType: string,
    titleName: string,
    decision: "APPROVE" | "BLOCK",
    now: number,
  ): boolean {
    if (!this.getProfile(householdId, profileId)) return false;
    this.database.prepare(`
      INSERT INTO title_overrides(profile_id, title_id, media_type, title_name, decision, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(profile_id, title_id) DO UPDATE SET
        media_type = excluded.media_type,
        title_name = excluded.title_name,
        decision = excluded.decision,
        updated_at = excluded.updated_at
    `).run(profileId, titleId, mediaType, titleName, decision, now);
    return true;
  }

  deleteOverride(householdId: string, profileId: string, titleId: string): boolean {
    if (!this.getProfile(householdId, profileId)) return false;
    this.database.prepare("DELETE FROM title_overrides WHERE profile_id = ? AND title_id = ?")
      .run(profileId, titleId);
    return true;
  }

  createInstallation(householdId: string, profileId: string, tokenHash: string, now: number): string | null {
    if (!this.getProfile(householdId, profileId)) return null;
    const id = randomUUID();
    this.database.prepare(`
      INSERT INTO installations(id, profile_id, token_hash, created_at) VALUES (?, ?, ?, ?)
    `).run(id, profileId, tokenHash, now);
    return id;
  }
}
