# SmenaTop design refresh

Date: **2026-09-23 (Asia/Tashkent)**. This report covers the frontend redesign of the existing local application. Earlier backend/infrastructure verification remains in [TEST_REPORT.md](TEST_REPORT.md).

## Delivered interface

- New porcelain, midnight, violet and mint palette, updated logo, consistent surfaces, typography and light/dark themes.
- Rebuilt landing page: interactive day planner, real category filtering, API-backed shift cards, benefit illustrations, business calendar preview, FAQ and contextual mobile action. Illustrations explicitly identify sample data.
- Responsive public and account navigation, including keyboard-contained dialogs, Escape/backdrop dismissal, focus restoration and background scroll locking. Workers and employers have mobile bottom navigation with safe-area spacing.
- Larger mobile form controls, readable account and message text, refreshed shift cards, authentication, billing and operational pages. Overnight shared cards identify the next day.
- Phone calendars start in day view; desktop defaults to week view. Explicit mode selection survives resizing. Initial dates use Tashkent time, selected details display both dates, and empty days have a compact explanatory state.
- One-time section entrances, planner state changes, button/card interaction feedback and optional scroll progress. Reduced-motion preferences disable decorative movement and leave all content visible.

The implementation preserves the existing API and business workflow. Shift application, offer, acceptance, attendance and wage state remain explicit. The FAQ clarifies that an offer does not reserve capacity. No invented customer statistics or testimonials were added.

## Verification

Frontend production build, TypeScript, ESLint and **7 component tests** passed. **Eight browser cases are covered by passing runs**: a full 7-case Playwright run (55.5s), a targeted catalogue failure/retry run, and the new calendar case plus final responsive rerun (2/2, 34.1s). The complete expanded 8-case suite was not rerun as one batch.

The new calendar case freezes the browser at 31 January, 20:30 UTC and verifies that the displayed Tashkent date is 1 February. It also verifies automatic day/week defaults, explicit mode persistence across resizing, day/week date increments, empty-day text and keyboard focus for the week scrolling region.

The browser checks cover Uzbek/Russian switching and persistence; normal/reduced motion; live category filtering; public/account drawers and keyboard focus; a controlled conflict displayed inside its dialog; actual local OTP; and publish → apply → offer → accept using the running API and synthetic test records.

Responsive checks exercise ten routes at **360, 390, 767, 768, 844, 960, 1024 and 1440px**, including **844×390 landscape**. They check document overflow and JavaScript exceptions; mobile form text and bottom-navigation labels are also asserted. **27 screenshots** in [screenshots](screenshots) cover ten routes at 390/1440px, two mobile drawers, Russian dark-mode landing/calendar views and an additional 360px calendar. Visual review included landing, authentication, worker search/assignment, billing, calendar and drawers. The planner's floating callout was moved so it no longer obscures its confirmation.

These checks use installed Chrome on Windows through Playwright. Native iOS Safari, Android devices, assistive-technology certification and production deployment were not part of this run. The remaining focused source-review items are recorded in [DESIGN_REVIEW.md](DESIGN_REVIEW.md).

## Loading performance

The landing page is included in the initial route graph to remove a sequential lazy-route fetch; other page routes and Motion features remain asynchronous. Fonts are served locally, and the hero uses code-based illustration without a large raster download.

[performance-lab.json](performance-lab.json) records three cold-cache mobile measurements against the production preview: **390×844**, **4× CPU slowdown**, **1.6Mbps download**, **750Kbps upload**, **150ms latency**. Measured median **LCP was 2.328s**, with individual runs **2.320–2.628s**; median **CLS was 0.000337**. The median met the 2.5s LCP target, while one individual run exceeded it. These are local laboratory measurements, not field data; INP was not measured.

## Sources

- `apps/web/src/pages/Landing.tsx`, `pages/landing-copy.ts`, `components/Reveal.tsx`
- `apps/web/src/components.tsx`, `pages/Employer.tsx`
- `apps/web/src/styles/foundation.css`, `workspace-refresh.css`, `landing.css`
- `tests/e2e/product.spec.ts`, [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)
