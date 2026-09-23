# Profile and workspace improvements

Date: **2026-09-23**. This change improves SmenaTop's worker and employer workflows. It follows familiar recruitment patterns while retaining SmenaTop's shift, offer and worker-consent model; it does not implement the full hh.ru product.

The current local preview is **[SmenaTop at 127.0.0.1:5174](http://127.0.0.1:5174/)**, with its API on port **3000**. Port **5173** currently belongs to the separate **Loyiha1** project. That service was not modified.

## Delivered behavior

- **Worker profile:** a saved résumé view and a separate editor for identity, city, occupations, skills, languages and experience. Completeness is calculated from saved data; it is distinct from verification. Saving and submitting for review are separate actions. Validation associates errors with inputs, and consent documents open in a separate tab.
- **Company profile:** saved overview, section editing, description, website, internal contact phone, city, STIR and contact person. The page includes a saved-profile preview, scoped branches, verification, permission-aware billing/team links and optional private-document/API-key sections. The preview is not a separately published company page; document uploads remain private account files.
- **Dashboards:** workers can review live offers, upcoming confirmed shifts, applications and profile shortcuts. Employers see their organization, upcoming shifts, staffing and application shortcuts according to permissions. Figures summarize the records returned by the API, rather than asserting unrestricted historical totals.
- **Application inbox:** status groups, counts, text search and shift filtering; clear next actions for offers, acceptance, withdrawal and rejection. An employer can open the candidate's résumé in the application context. Candidate data excludes phone numbers and private documents; access remains constrained by organization permissions and branch scope. Skill verification states remain explicit.
- **URL filters:** shift search stores search text, city, occupation and page in the URL. Application inbox stores status, text and shift selection there, preserving the selected view through navigation or reload. Application lists currently contain the most recent **100 worker / 200 employer** records and indicate that limit.
- **Navigation:** profile entries and mobile navigation lead to the corresponding worker/company workspace; existing Uzbek/Russian and light/dark support remain available.

## Draft and save semantics

Unsaved worker and company edits survive internal route/context navigation in the **current tab's memory**, isolated by authenticated user and profile/organization. A retained snapshot expires after **30 minutes**. Company drafts retain the original baseline and version so a background update still produces a conflict.

Successful save, explicit discard and logout clear the relevant drafts; logout also prevents a delayed unmount from recreating them. This is **not persistent autosave**: no draft is written to localStorage, sessionStorage or the server. Refreshing, closing the tab or restarting the browser loses unsaved memory; `beforeunload` requests the browser's usual unsaved-change warning where supported. The saved preview always shows server data rather than presenting a draft as saved.

## Backend changes

The additive `202609230001_organization_profile` migration introduces company `description`, `website` and `contactPhone`; the existing `version` field remains intact. Organization PATCH requires management permission, an active permitted organization and the current version. Omitted fields stay unchanged; nullable optional fields can be cleared. A stale/concurrent version returns **409** and leaves the editor's text available.

Changing company name, STIR or city sets verification to **PENDING**, supersedes an existing pending review and creates a fresh request. An old review cannot approve the changed identity. Contact/description-only updates do not reopen verification. Company city changes do not silently relocate existing branches. Changes are audited, and the OpenAPI/client contract includes the new fields and candidate profile projection.

## Verification status

| Check                                                | Result                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend integration suite                            | **PASS: 32 tests**, using isolated PostgreSQL and Redis; includes organization permissions, scoped reads, PATCH validation, concurrent updates, review invalidation and candidate privacy.                                                                                    |
| New API validation tests                             | **PASS: 3 tests**.                                                                                                                                                                                                                                                            |
| OpenAPI generation and contract drift check          | **PASS**.                                                                                                                                                                                                                                                                     |
| Frontend unit/component suite                        | **PASS: 20 tests**, including actual worker-profile navigation/restoration, discard/save behavior, consent links, draft expiry, account isolation and rapid URL filter changes.                                                                                               |
| Final frontend lint, TypeScript and production build | **PASS:** repository ESLint and `npx pnpm --filter @smenatop/web build` (TypeScript plus production Vite).                                                                                                                                                                    |
| Final browser acceptance and visual review           | **PASS: 14 tests**, 1.4 minutes, against SmenaTop on port 5174. Includes the complete publish/apply/offer/accept flow, persisted profiles, stale-edit protection, read-only roles, candidate privacy, focus restoration, refresh/Back filters, OTP and responsive navigation. |

New profile screens were checked at **320, 390, 768 and 1440 pixels**, including Russian and dark mode. The existing product suite also checks ten routes across eight viewport sizes. Screenshots are in `docs/screenshots`, including `resume-worker-overview-*`, `profile-company-*`, `hub-worker-*`, `hub-employer-*` and `candidate-resume-*`. Visual review identified a cramped mobile company name; its preview now gives the name a dedicated column and places verification below it.

During verification, rapid consecutive search edits were found to overwrite an earlier URL filter before React Router committed it. A shared filter helper now retains pending edits and honors Back/Forward; three regression tests cover this. Candidate dialog focus restoration on unmount was also corrected and exercised in the browser. An initial test run targeted the unrelated service on port 5173; subsequent acceptance ran against this repository's own API and web services.

Earlier baseline and design-refresh results remain in [TEST_REPORT.md](TEST_REPORT.md) and [DESIGN_REFRESH_REPORT.md](DESIGN_REFRESH_REPORT.md).

## Reference patterns

The inbox uses explicit stages, filtering and visible next actions informed by hh.ru's official guidance on [managing employer applications](https://feedback.hh.ru/knowledge-base/article/1288) and [tracking an applicant's response status](https://feedback.hh.ru/knowledge-base/article/1619). SmenaTop keeps its own statuses and permission/consent rules.
