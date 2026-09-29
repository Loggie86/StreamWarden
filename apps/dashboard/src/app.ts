type Rating = "G" | "PG" | "M" | "MA15+" | "R18+" | "X18+" | "RC";
type Limit = Rating | "UNRESTRICTED";
type Override = "APPROVE" | "BLOCK";

interface Profile {
  id: string;
  name: string;
  limit: Limit;
  primary?: boolean;
}

interface FixtureTitle {
  id: string;
  name: string;
  type: "Movie" | "Series";
  year: number;
  rating: Rating | null;
}

interface DashboardState {
  country: "AU";
  activeProfileId: string;
  profiles: Profile[];
  overrides: Record<string, Record<string, Override>>;
}

const storageKey = "nuvio-guardian-dashboard-v1";
const ratings: Rating[] = ["G", "PG", "M", "MA15+", "R18+", "X18+", "RC"];
const orderedRatings: Rating[] = ["G", "PG", "M", "MA15+", "R18+", "X18+"];

const fixtureTitles: FixtureTitle[] = [
  { id: "movie-family-orbit", name: "Family Orbit", type: "Movie", year: 2025, rating: "G" },
  { id: "series-blue-harbour", name: "Blue Harbour", type: "Series", year: 2024, rating: "PG" },
  { id: "movie-night-train", name: "Night Train", type: "Movie", year: 2026, rating: "M" },
  { id: "series-wild-signal", name: "Wild Signal", type: "Series", year: 2025, rating: "MA15+" },
  { id: "movie-last-outpost", name: "The Last Outpost", type: "Movie", year: 2023, rating: "R18+" },
  { id: "movie-unclassified", name: "Unclassified Fixture", type: "Movie", year: 2026, rating: null },
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

let state = loadState();
let search = "";
let toastTimer: number | undefined;

const profileGrid = required("profile-grid");
const profileEditor = required("profile-editor");
const titleResults = required("title-results");
const titleSearch = required("title-search") as HTMLInputElement;
const overrideCount = required("override-count");
const toast = required("toast");

required("country").addEventListener("change", (event) => {
  state.country = (event.target as HTMLSelectElement).value as "AU";
  saveAndRender("Rating country updated");
});

required("reset").addEventListener("click", () => {
  state = structuredClone(defaultState);
  search = "";
  titleSearch.value = "";
  saveAndRender("Prototype reset");
});

titleSearch.addEventListener("input", () => {
  search = titleSearch.value.trim().toLocaleLowerCase();
  renderTitles();
});

render();

function render(): void {
  renderProfiles();
  renderEditor();
  renderTitles();
}

function renderProfiles(): void {
  profileGrid.innerHTML = state.profiles
    .map((profile) => {
      const active = profile.id === state.activeProfileId;
      return `
        <button
          class="profile-card ${active ? "active" : ""}"
          type="button"
          data-profile="${profile.id}"
          aria-pressed="${active}"
        >
          <span class="avatar" aria-hidden="true">${initials(profile.name)}</span>
          <span>
            <strong>${profile.name}</strong>
            <small>${profile.primary ? "Primary · " : ""}${formatLimit(profile.limit)}</small>
          </span>
        </button>`;
    })
    .join("");

  profileGrid.querySelectorAll<HTMLButtonElement>("[data-profile]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeProfileId = button.dataset.profile ?? state.activeProfileId;
      saveAndRender();
    });
  });
}

function renderEditor(): void {
  const profile = activeProfile();
  const unrestricted = profile.limit === "UNRESTRICTED";
  profileEditor.innerHTML = `
    <div class="editor-header">
      <span class="avatar" aria-hidden="true">${initials(profile.name)}</span>
      <div>
        <p class="eyebrow">${profile.primary ? "Primary administrator" : "Profile policy"}</p>
        <h2 id="profile-editor-title">${profile.name}</h2>
      </div>
    </div>

    <div class="toggle-row">
      <span>
        <strong>Unrestricted</strong>
        <small>Explicit blocks still apply.</small>
      </span>
      <input id="unrestricted" type="checkbox" ${unrestricted ? "checked" : ""} />
    </div>

    <div class="field-stack">
      <label for="rating-limit">Maximum Australian rating</label>
      <select id="rating-limit" ${unrestricted ? "disabled" : ""}>
        ${ratings
          .filter((rating) => rating !== "RC")
          .map((rating) => `<option value="${rating}" ${profile.limit === rating ? "selected" : ""}>${rating}</option>`)
          .join("")}
      </select>
      <small>RC is refused classification and remains blocked.</small>
    </div>`;

  const unrestrictedInput = required("unrestricted") as HTMLInputElement;
  unrestrictedInput.addEventListener("change", () => {
    profile.limit = unrestrictedInput.checked ? "UNRESTRICTED" : "PG";
    saveAndRender(`${profile.name} policy updated`);
  });

  const limit = required("rating-limit") as HTMLSelectElement;
  limit.addEventListener("change", () => {
    profile.limit = limit.value as Rating;
    saveAndRender(`${profile.name} limit set to ${limit.value}`);
  });
}

function renderTitles(): void {
  const profile = activeProfile();
  const profileOverrides = state.overrides[profile.id] ?? {};
  const visible = fixtureTitles.filter((title) =>
    `${title.name} ${title.type} ${title.year}`.toLocaleLowerCase().includes(search),
  );

  overrideCount.textContent = `${Object.keys(profileOverrides).length} override${Object.keys(profileOverrides).length === 1 ? "" : "s"}`;

  if (visible.length === 0) {
    titleResults.innerHTML = '<div class="empty-state">No fixture titles match that search.</div>';
    return;
  }

  titleResults.innerHTML = visible
    .map((title) => {
      const override = profileOverrides[title.id];
      const decision = evaluate(profile, title, override);
      return `
        <div class="title-row">
          <div>
            <h3>${title.name}</h3>
            <div class="title-meta">
              <span>${title.type}</span>
              <span>${title.year}</span>
              <span class="rating-chip">${title.rating ?? "Unrated"}</span>
            </div>
            <div class="decision-line">
              <span class="decision-chip ${decision.allowed ? "allowed" : "blocked"}">
                ${decision.allowed ? "Allowed" : "Blocked"}
              </span>
              <span class="decision-reason">${decision.reason}</span>
            </div>
          </div>
          <div class="actions" aria-label="Override ${title.name} for ${profile.name}">
            <button class="action-button ${override === "APPROVE" ? "selected" : ""}" type="button" data-title="${title.id}" data-action="APPROVE">Approve</button>
            <button class="action-button block ${override === "BLOCK" ? "selected" : ""}" type="button" data-title="${title.id}" data-action="BLOCK">Block</button>
            ${override ? `<button class="action-button clear" type="button" data-title="${title.id}" data-action="CLEAR">Clear</button>` : ""}
          </div>
        </div>`;
    })
    .join("");

  titleResults.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const titleId = button.dataset.title;
      const action = button.dataset.action;
      if (!titleId || !action) return;
      const overrides = (state.overrides[profile.id] ??= {});
      if (action === "CLEAR") delete overrides[titleId];
      else overrides[titleId] = action as Override;
      if (Object.keys(overrides).length === 0) delete state.overrides[profile.id];
      saveAndRender(`${profile.name} title exception updated`);
    });
  });
}

function evaluate(
  profile: Profile,
  title: FixtureTitle,
  override?: Override,
): { allowed: boolean; reason: string } {
  if (override === "BLOCK") return { allowed: false, reason: "Explicit block" };
  if (profile.limit === "UNRESTRICTED") return { allowed: true, reason: "Unrestricted profile" };
  if (override === "APPROVE") return { allowed: true, reason: "Explicit approval" };
  if (title.rating === null) return { allowed: false, reason: "Rating unknown" };
  if (title.rating === "RC") return { allowed: false, reason: "Refused classification" };

  const titleRank = orderedRatings.indexOf(title.rating);
  const limitRank = orderedRatings.indexOf(profile.limit);
  const allowed = titleRank !== -1 && limitRank !== -1 && titleRank <= limitRank;
  return {
    allowed,
    reason: allowed ? "Within rating limit" : "Above rating limit",
  };
}

function activeProfile(): Profile {
  return state.profiles.find((profile) => profile.id === state.activeProfileId) ?? state.profiles[0];
}

function formatLimit(limit: Limit): string {
  return limit === "UNRESTRICTED" ? "Unrestricted" : `${limit} maximum`;
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("");
}

function saveAndRender(message?: string): void {
  localStorage.setItem(storageKey, JSON.stringify(state));
  render();
  if (message) showToast(message);
}

function loadState(): DashboardState {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return structuredClone(defaultState);
    const parsed = JSON.parse(stored) as DashboardState;
    if (parsed.country !== "AU" || !Array.isArray(parsed.profiles)) throw new Error("Invalid state");
    return parsed;
  } catch {
    return structuredClone(defaultState);
  }
}

function showToast(message: string): void {
  toast.textContent = message;
  toast.classList.add("visible");
  if (toastTimer !== undefined) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 1800);
}

function required(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing dashboard element: ${id}`);
  return element;
}
