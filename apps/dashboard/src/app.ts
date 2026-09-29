type Rating = "G" | "PG" | "M" | "MA15+" | "R18+" | "X18+" | "RC";
type Limit = Rating | "UNRESTRICTED";
type Override = "APPROVE" | "BLOCK";
type Mode = "loading" | "demo" | "api" | "signed-out";

interface Profile { id: string; name: string; limit: Limit; primary?: boolean }
interface ApiProfile { id: string; name: string; maximumRating: Rating | null; unrestricted: boolean; primary: boolean }
interface FixtureTitle { id: string; name: string; type: "Movie" | "Series"; year: number; rating: Rating | null }
interface DashboardState {
  country: "AU";
  activeProfileId: string;
  profiles: Profile[];
  overrides: Record<string, Record<string, Override>>;
}

const storageKey = "streamwarden-dashboard-v1";
const ratings: Rating[] = ["G", "PG", "M", "MA15+", "R18+", "X18+", "RC"];
const orderedRatings: Rating[] = ["G", "PG", "M", "MA15+", "R18+", "X18+"];
const fixtureTitles: FixtureTitle[] = [
  { id: "streamwarden:movie:family-orbit", name: "Family Orbit", type: "Movie", year: 2025, rating: "G" },
  { id: "streamwarden:series:blue-harbour", name: "Blue Harbour", type: "Series", year: 2024, rating: "PG" },
  { id: "streamwarden:movie:night-train", name: "Night Train", type: "Movie", year: 2026, rating: "M" },
  { id: "streamwarden:series:wild-signal", name: "Wild Signal", type: "Series", year: 2025, rating: "MA15+" },
  { id: "streamwarden:movie:last-outpost", name: "The Last Outpost", type: "Movie", year: 2023, rating: "R18+" },
  { id: "streamwarden:movie:unclassified", name: "Unclassified Fixture", type: "Movie", year: 2026, rating: null },
];
const defaultState: DashboardState = {
  country: "AU",
  activeProfileId: "child-a",
  profiles: [
    { id: "adult-a", name: "Adult A", limit: "UNRESTRICTED", primary: true },
    { id: "adult-b", name: "Adult B", limit: "UNRESTRICTED" },
    { id: "child-a", name: "Child A", limit: "PG" },
    { id: "child-b", name: "Child B", limit: "M" },
    { id: "child-c", name: "Child C", limit: "MA15+" },
  ],
  overrides: {},
};

let mode: Mode = "loading";
let state = loadDemoState();
let search = "";
let toastTimer: number | undefined;

const profileGrid = required("profile-grid");
const profileEditor = required("profile-editor");
const titleResults = required("title-results");
const titleSearch = required("title-search") as HTMLInputElement;
const overrideCount = required("override-count");
const toast = required("toast");
const resetButton = required("reset");
const addProfileButton = required("add-profile");
const logoutButton = required("logout");
const modeBadge = required("mode-badge");
const modeNotice = required("mode-notice");
const authScreen = required("auth-screen");
const loginForm = required("login-form") as HTMLFormElement;
const loginEmail = required("login-email") as HTMLInputElement;
const loginSubmit = required("login-submit") as HTMLButtonElement;
const loginMessage = required("login-message");
const profileDialog = required("profile-dialog") as HTMLDialogElement;
const profileForm = required("profile-form") as HTMLFormElement;

(required("country") as HTMLSelectElement).addEventListener("change", (event) => {
  state.country = (event.target as HTMLSelectElement).value as "AU";
  saveDemoAndRender("Rating country updated");
});
resetButton.addEventListener("click", () => {
  state = structuredClone(defaultState);
  search = "";
  titleSearch.value = "";
  saveDemoAndRender("Demo reset");
});
titleSearch.addEventListener("input", () => {
  search = titleSearch.value.trim().toLocaleLowerCase();
  renderTitles();
});
loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginSubmit.disabled = true;
  loginMessage.textContent = "Sending your secure link…";
  try {
    const response = await apiRequest("/api/auth/request", {
      method: "POST",
      body: JSON.stringify({ email: loginEmail.value }),
    });
    const body = await response.json() as { developmentMagicLink?: string };
    if (!response.ok) throw new Error("Could not send the link. Please try again.");
    loginMessage.innerHTML = body.developmentMagicLink
      ? `Development link ready: <a href="${escapeHtml(body.developmentMagicLink)}">sign in now</a>.`
      : "Check your email. The link expires in 15 minutes.";
  } catch (error) {
    loginMessage.textContent = messageFrom(error);
  } finally {
    loginSubmit.disabled = false;
  }
});
logoutButton.addEventListener("click", async () => {
  await apiRequest("/api/logout", { method: "POST" });
  showSignedOut();
});
addProfileButton.addEventListener("click", () => profileDialog.showModal());
required("profile-cancel").addEventListener("click", () => profileDialog.close());
profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = (required("profile-name") as HTMLInputElement).value.trim();
  const maximumRating = (required("profile-rating") as HTMLSelectElement).value as Rating;
  if (!name) return;
  try {
    const response = await apiRequest("/api/profiles", {
      method: "POST",
      body: JSON.stringify({ name, maximumRating, unrestricted: false }),
    });
    if (!response.ok) throw new Error("Could not add that profile.");
    const body = await response.json() as { profile: ApiProfile };
    const profile = mapProfile(body.profile);
    state.profiles.push(profile);
    state.activeProfileId = profile.id;
    state.overrides[profile.id] = {};
    profileForm.reset();
    profileDialog.close();
    render();
    showToast(`${name} added`);
  } catch (error) {
    showToast(messageFrom(error));
  }
});

render();
void bootstrap();

async function bootstrap(): Promise<void> {
  try {
    const response = await fetch("./api/session", { headers: { Accept: "application/json" } });
    if (response.status === 401) return showSignedOut();
    if (!response.ok || !(response.headers.get("content-type") ?? "").includes("application/json")) return showDemo();
    const profilesResponse = await apiRequest("/api/profiles");
    if (!profilesResponse.ok) throw new Error("Could not load profiles");
    const body = await profilesResponse.json() as { profiles: ApiProfile[] };
    state = {
      country: "AU",
      activeProfileId: body.profiles[0]?.id ?? "",
      profiles: body.profiles.map(mapProfile),
      overrides: {},
    };
    mode = "api";
    if (state.activeProfileId) await loadOverrides(state.activeProfileId);
    configureMode();
    render();
  } catch {
    showDemo();
  }
}

function showDemo(): void {
  mode = "demo";
  state = loadDemoState();
  configureMode();
  render();
}

function showSignedOut(): void {
  mode = "signed-out";
  configureMode();
  authScreen.classList.remove("hidden");
  loginEmail.focus();
}

function configureMode(): void {
  const apiMode = mode === "api";
  modeBadge.textContent = apiMode ? "Connected" : mode === "demo" ? "Demo" : "Sign in";
  modeNotice.innerHTML = apiMode
    ? "<strong>Policy service connected:</strong> profile limits and title exceptions are saved to your household. Native playback enforcement is still a later milestone."
    : "<strong>Public demo:</strong> changes stay on this device. Sign-in is available on hosted or self-hosted StreamWarden deployments.";
  authScreen.classList.toggle("hidden", mode !== "signed-out");
  logoutButton.classList.toggle("hidden", !apiMode);
  addProfileButton.classList.toggle("hidden", !apiMode);
  resetButton.classList.toggle("hidden", apiMode);
  (required("country") as HTMLSelectElement).disabled = apiMode;
}

function render(): void {
  renderProfiles();
  renderEditor();
  renderTitles();
}

function renderProfiles(): void {
  profileGrid.innerHTML = state.profiles.map((profile) => {
    const active = profile.id === state.activeProfileId;
    return `<button class="profile-card ${active ? "active" : ""}" type="button" data-profile="${escapeHtml(profile.id)}" aria-pressed="${active}">
      <span class="avatar" aria-hidden="true">${escapeHtml(initials(profile.name))}</span>
      <span><strong>${escapeHtml(profile.name)}</strong><small>${profile.primary ? "Primary · " : ""}${formatLimit(profile.limit)}</small></span>
    </button>`;
  }).join("");
  profileGrid.querySelectorAll<HTMLButtonElement>("[data-profile]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.activeProfileId = button.dataset.profile ?? state.activeProfileId;
      if (mode === "api") await loadOverrides(state.activeProfileId);
      else localStorage.setItem(storageKey, JSON.stringify(state));
      render();
    });
  });
}

function renderEditor(): void {
  const profile = activeProfile();
  if (!profile) {
    profileEditor.innerHTML = '<div class="empty-state">Add a profile to begin.</div>';
    return;
  }
  const unrestricted = profile.limit === "UNRESTRICTED";
  profileEditor.innerHTML = `<div class="editor-header">
      <span class="avatar" aria-hidden="true">${escapeHtml(initials(profile.name))}</span>
      <div><p class="eyebrow">${profile.primary ? "Primary administrator" : "Profile policy"}</p><h2 id="profile-editor-title">${escapeHtml(profile.name)}</h2></div>
    </div>
    <div class="toggle-row"><span><strong>Unrestricted</strong><small>Explicit blocks still apply.</small></span><input id="unrestricted" type="checkbox" ${unrestricted ? "checked" : ""} /></div>
    <div class="field-stack"><label for="rating-limit">Maximum Australian rating</label><select id="rating-limit" ${unrestricted ? "disabled" : ""}>
      ${ratings.filter((rating) => rating !== "RC").map((rating) => `<option value="${rating}" ${profile.limit === rating ? "selected" : ""}>${rating}</option>`).join("")}
    </select><small>RC is refused classification and remains blocked.</small></div>`;
  const unrestrictedInput = required("unrestricted") as HTMLInputElement;
  unrestrictedInput.addEventListener("change", () => void updatePolicy(profile, unrestrictedInput.checked ? "UNRESTRICTED" : "PG"));
  const limit = required("rating-limit") as HTMLSelectElement;
  limit.addEventListener("change", () => void updatePolicy(profile, limit.value as Rating));
}

async function updatePolicy(profile: Profile, limit: Limit): Promise<void> {
  const previous = profile.limit;
  profile.limit = limit;
  render();
  if (mode === "demo") return saveDemoAndRender(`${profile.name} policy updated`);
  try {
    const response = await apiRequest(`/api/profiles/${encodeURIComponent(profile.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ unrestricted: limit === "UNRESTRICTED", maximumRating: limit === "UNRESTRICTED" ? null : limit }),
    });
    if (!response.ok) throw new Error("Could not save that policy.");
    showToast(`${profile.name} policy updated`);
  } catch (error) {
    profile.limit = previous;
    render();
    showToast(messageFrom(error));
  }
}

function renderTitles(): void {
  const profile = activeProfile();
  if (!profile) {
    titleResults.innerHTML = "";
    overrideCount.textContent = "0 overrides";
    return;
  }
  const profileOverrides = state.overrides[profile.id] ?? {};
  const visible = fixtureTitles.filter((title) => `${title.name} ${title.type} ${title.year}`.toLocaleLowerCase().includes(search));
  const count = Object.keys(profileOverrides).length;
  overrideCount.textContent = `${count} override${count === 1 ? "" : "s"}`;
  if (!visible.length) {
    titleResults.innerHTML = '<div class="empty-state">No fixture titles match that search.</div>';
    return;
  }
  titleResults.innerHTML = visible.map((title) => {
    const override = profileOverrides[title.id];
    const decision = evaluate(profile, title, override);
    return `<div class="title-row"><div><h3>${title.name}</h3><div class="title-meta"><span>${title.type}</span><span>${title.year}</span><span class="rating-chip">${title.rating ?? "Unrated"}</span></div>
      <div class="decision-line"><span class="decision-chip ${decision.allowed ? "allowed" : "blocked"}">${decision.allowed ? "Allowed" : "Blocked"}</span><span class="decision-reason">${decision.reason}</span></div></div>
      <div class="actions"><button class="action-button ${override === "APPROVE" ? "selected" : ""}" type="button" data-title="${title.id}" data-action="APPROVE">Approve</button><button class="action-button block ${override === "BLOCK" ? "selected" : ""}" type="button" data-title="${title.id}" data-action="BLOCK">Block</button>${override ? `<button class="action-button clear" type="button" data-title="${title.id}" data-action="CLEAR">Clear</button>` : ""}</div></div>`;
  }).join("");
  titleResults.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) => {
    button.addEventListener("click", () => void setTitleOverride(profile, button.dataset.title ?? "", button.dataset.action ?? ""));
  });
}

async function setTitleOverride(profile: Profile, titleId: string, action: string): Promise<void> {
  if (!titleId || !action) return;
  const overrides = (state.overrides[profile.id] ??= {});
  const previous = overrides[titleId];
  if (action === "CLEAR") delete overrides[titleId];
  else overrides[titleId] = action as Override;
  renderTitles();
  if (mode === "demo") return saveDemoAndRender(`${profile.name} title exception updated`);
  const title = fixtureTitles.find((item) => item.id === titleId)!;
  try {
    const response = await apiRequest(`/api/profiles/${encodeURIComponent(profile.id)}/overrides/${encodeURIComponent(titleId)}`, action === "CLEAR" ? { method: "DELETE" } : {
      method: "PUT",
      body: JSON.stringify({ decision: action, mediaType: title.type.toLocaleLowerCase(), titleName: title.name }),
    });
    if (!response.ok) throw new Error("Could not save that exception.");
    showToast(`${profile.name} title exception updated`);
  } catch (error) {
    if (previous) overrides[titleId] = previous;
    else delete overrides[titleId];
    renderTitles();
    showToast(messageFrom(error));
  }
}

async function loadOverrides(profileId: string): Promise<void> {
  if (state.overrides[profileId]) return;
  const response = await apiRequest(`/api/profiles/${encodeURIComponent(profileId)}/overrides`);
  if (!response.ok) throw new Error("Could not load title exceptions");
  const body = await response.json() as { overrides: Array<{ titleId: string; decision: Override }> };
  state.overrides[profileId] = Object.fromEntries(body.overrides.map((item) => [item.titleId, item.decision]));
}

function evaluate(profile: Profile, title: FixtureTitle, override?: Override): { allowed: boolean; reason: string } {
  if (override === "BLOCK") return { allowed: false, reason: "Explicit block" };
  if (title.rating === "RC") return { allowed: false, reason: "Refused classification" };
  if (profile.limit === "UNRESTRICTED") return { allowed: true, reason: "Unrestricted profile" };
  if (override === "APPROVE") return { allowed: true, reason: "Explicit approval" };
  if (title.rating === null) return { allowed: false, reason: "Rating unknown" };
  const titleRank = orderedRatings.indexOf(title.rating);
  const limitRank = orderedRatings.indexOf(profile.limit);
  const allowed = titleRank !== -1 && limitRank !== -1 && titleRank <= limitRank;
  return { allowed, reason: allowed ? "Within rating limit" : "Above rating limit" };
}

function activeProfile(): Profile | undefined {
  return state.profiles.find((profile) => profile.id === state.activeProfileId) ?? state.profiles[0];
}
function mapProfile(profile: ApiProfile): Profile {
  return { id: profile.id, name: profile.name, limit: profile.unrestricted ? "UNRESTRICTED" : profile.maximumRating ?? "PG", primary: profile.primary };
}
function formatLimit(limit: Limit): string { return limit === "UNRESTRICTED" ? "Unrestricted" : `${limit} maximum`; }
function initials(name: string): string { return name.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 3).toLocaleUpperCase(); }
function saveDemoAndRender(message?: string): void {
  localStorage.setItem(storageKey, JSON.stringify(state));
  render();
  if (message) showToast(message);
}
function loadDemoState(): DashboardState {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return structuredClone(defaultState);
    const parsed = JSON.parse(stored) as DashboardState;
    if (parsed.country !== "AU" || !Array.isArray(parsed.profiles)) throw new Error("Invalid state");
    return parsed;
  } catch { return structuredClone(defaultState); }
}
async function apiRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, credentials: "same-origin" });
  if (response.status === 401 && mode === "api") showSignedOut();
  return response;
}
function showToast(message: string): void {
  toast.textContent = message;
  toast.classList.add("visible");
  if (toastTimer !== undefined) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 2200);
}
function messageFrom(error: unknown): string { return error instanceof Error ? error.message : "Something went wrong."; }
function escapeHtml(value: string): string { return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }
function required(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing dashboard element: ${id}`);
  return element;
}
