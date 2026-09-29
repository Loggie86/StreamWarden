# StreamWarden — Technical Specification v0.1

Status: Draft for approval  
Date: 29 September 2026  
Scope: Cross-platform policy service; Nuvio integration first

## 1. Product goal

StreamWarden gives a household administrator one dashboard for applying country-specific content-rating limits across supported streaming profiles and for explicitly approving or blocking individual movies and series. Nuvio is the first integration, with Plex and Jellyfin planned.

The initial dashboard/add-on release filters StreamWarden-provided catalogs and search. Complete enforcement across every Nuvio entry point requires later changes to Nuvio Mobile and Nuvio TV.

## 2. Agreed requirements

- The administrator chooses a rating country during setup.
- Each Nuvio profile has an independent maximum rating or can be unrestricted.
- A title with no reliable rating is blocked until explicitly approved.
- Exceptions apply to a whole movie or whole series, not seasons or episodes.
- An explicit block always wins.
- An explicit approval overrides the profile's normal rating limit and missing-rating rule.
- The primary profile manages all profiles from one dashboard.
- The system must ultimately block restricted content everywhere, including playback.
- The dashboard and add-on are built and tested before native Nuvio enforcement work begins.

## 3. Initial household test policy

| Profile | Australian limit |
|---|---|
| Adult A | Unrestricted |
| Adult B | Unrestricted |
| Child A | PG |
| Child B | M |
| Child C | MA15+ |

These values are test fixtures, not hard-coded product defaults.

## 4. Rule evaluation

Rules are evaluated in this order:

1. If the title is explicitly blocked for the profile, block it.
2. Resolve the title's classification for the household's selected country.
3. If the resolved classification is `RC`, block it regardless of profile mode or override.
4. If the profile is unrestricted, allow the title.
5. If the title is explicitly approved for the profile, allow it.
6. If no reliable classification can be resolved, block it.
7. Allow when the resolved classification is at or below the profile limit; otherwise block.

Every decision returns a machine-readable reason:

- `PROFILE_UNRESTRICTED`
- `EXPLICIT_BLOCK`
- `EXPLICIT_APPROVAL`
- `RATING_ALLOWED`
- `RATING_TOO_HIGH`
- `RATING_UNKNOWN`
- `RATING_AMBIGUOUS`\n- `REFUSED_CLASSIFICATION`

## 5. Rating model

The engine stores a country-specific ordered scale rather than assuming labels are globally comparable.

Initial Australian scale:

`G < PG < M < MA15+ < R18+ < X18+`

`RC` is always blocked and cannot be overridden, including for unrestricted profiles. Non-film classifications and advisory labels are not silently converted into film ratings.

Rating resolution priority:

1. Exact title, media type and country classification from an authoritative or licensed metadata source.
2. Exact title and country classification from a trusted secondary metadata source.
3. A deterministic mapping from another country's classification only when a reviewed mapping exists.
4. Otherwise unknown and therefore blocked.

Conflicting results at the same confidence level use the more restrictive classification and are marked ambiguous for review. Ratings are cached with their source, country, retrieval time and confidence.

## 6. Dashboard

The dashboard will provide:

- Secure Nuvio sign-in and automatic profile discovery.
- Country selection.
- Per-profile rating limit or unrestricted mode.
- Movie/series search for explicit approval or blocking.
- A decision inspector showing the rating, source and reason a title is allowed or blocked.
- Lists of all overrides, sortable by profile, title and decision.
- A setup status page showing which profiles have StreamWarden configured.
- Export and import of StreamWarden policy data.

The primary profile is the administrator. Child profiles cannot change policy. Administrative actions require a fresh authenticated session; a later native integration may additionally use Nuvio's profile PIN.

## 7. Add-on

The add-on follows the Stremio-compatible HTTP protocol used by Nuvio:

- `/manifest.json`
- `/catalog/{type}/{id}.json`
- `/catalog/{type}/{id}/{extra}.json`
- `/meta/{type}/{id}.json`

Initial resources:

- Filtered movie catalog.
- Filtered series catalog.
- Filtered movie and series search.
- Metadata responses containing classification information where supported.

Each household receives a non-guessable installation identifier. Requests are evaluated against the active profile policy represented by the configured installation URL. Administrative credentials are never embedded in a manifest URL.

## 8. Known initial limitation

The Stremio/Nuvio add-on protocol is additive: it supplies its own catalogs, metadata and search results but does not intercept other add-ons. Therefore the initial add-on cannot prevent a restricted title from appearing or playing through another add-on, an existing library item, history, deep link or direct playback route.

The dashboard must display this limitation clearly. The product must not claim complete parental enforcement until native Nuvio integration is available.

## 9. Native enforcement phase

Later changes to both Nuvio Mobile and Nuvio TV will add one shared policy decision at every content boundary:

- Home and hero rows.
- Add-on and collection catalogs.
- Search and discovery.
- Library, watch history and continue watching.
- Recommendations and related titles.
- Details navigation and deep links.
- Episode autoplay and next-up.
- Stream selection and final playback launch.

Playback performs a final independent check so a UI filtering defect cannot bypass the policy. The client denies access if the policy service is unavailable and no valid cached decision exists for a restricted profile.

## 10. Security and privacy

- Never store a Nuvio password.
- Prefer direct authentication with Nuvio and short-lived session tokens.
- If a server must handle login because browser access is unavailable, credentials exist only for that request and are immediately discarded.
- Store the minimum Nuvio identity required to associate household profiles.
- Encrypt tokens and policy data in transit and at rest.
- Use separate administrator and profile-scoped tokens.
- Manifest URLs contain revocable, profile-scoped identifiers with no administrative privileges.
- Rate-limit authentication, search and policy endpoints.
- Record administrative policy changes without recording viewing activity by default.
- Provide account deletion and data export.

## 11. Proposed implementation boundaries

- Dashboard: responsive web application.
- Policy API: authenticated service owning profiles, limits and overrides.
- Rating engine: isolated module with country adapters and deterministic tests.
- Add-on service: protocol adapter that calls the policy and rating engines.
- Database: households, linked Nuvio profiles, policies, title overrides, rating records and revocable installation tokens.
- Native adapters: separate Mobile and TV integrations sharing the same policy contract.

The initial implementation should use TypeScript across dashboard, API, rating engine and add-on to share schemas and decision logic.

## 12. Product and distribution model

- Product name: **StreamWarden**.
- A publicly hosted version will be available free of charge.
- The hosted service will be donation-supported, with no restriction features placed behind payment.
- The complete project will also support self-hosting.
- The public source repository will include deployment documentation, configuration examples, upgrade guidance and a supported container-based installation path.
- Hosted-service donations and self-hosting must not create different policy or enforcement capabilities.

## 13. Phase-one acceptance tests

1. An Australian `G` or `PG` title is allowed for Child A.
2. An Australian `M` title is blocked for Child A but allowed for Child B and Child C.
3. An Australian `MA15+` title is blocked for Child A and Child B but allowed for Child C.
4. An Australian `R18+` title is blocked for all three child profiles.
5. An unrated title is blocked for all restricted profiles.
6. Approving that unrated title for Child B allows it only for Child B.
7. Blocking a normally allowed `PG` title for Child A blocks it only for Child A.
8. If a title is both approved and blocked, the block wins.
9. Adult A and Adult B can access all rated and unrated titles unless explicitly blocked.
10. A series override applies to the entire series.
11. A conflicting rating result chooses the more restrictive result and exposes the ambiguity.
12. No generated manifest URL grants access to the administrative dashboard or other profiles' policies.

## 14. Delivery sequence

1. Approve this specification.
2. Implement the rating engine and automated acceptance tests using fixture data.
3. Validate at least two candidate classification data sources for coverage, licensing, limits and country support.
4. Build the dashboard with mock Nuvio profiles.
5. Connect read-only Nuvio authentication and profile discovery.
6. Add policy editing and overrides.
7. Build the public add-on and profile installation flow.
8. Test against the household profile fixture above.
9. Publish source and self-hosting documentation.
10. Design and submit native Nuvio Mobile and TV enforcement changes.

## 15. Decisions intentionally deferred

- Final logo, colours and wider visual identity.
- Hosting provider, donation platform and operating budget.
- Final rating-data vendors, pending coverage and licensing tests.
- Native enforcement UI wording and override-request workflow.
