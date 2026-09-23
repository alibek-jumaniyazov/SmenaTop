# SmenaTop design system

Updated for the visual redesign on **2026-09-23**. The interface pairs cool porcelain surfaces with midnight text, electric violet actions and restrained mint accents. The public page explains the product through a sample daily planner; operational screens emphasize time, wage, status and the next available action.

## Source of truth

- `apps/web/src/styles/foundation.css` defines the current shared tokens, controls, forms, feedback and reduced-motion rules.
- `apps/web/src/styles/workspace-refresh.css` defines public/workspace navigation, shared shift cards, drawers and footer styling.
- `apps/web/src/styles/landing.css` defines the public hero, planner, section layouts, illustrations, FAQ and contextual mobile action.
- `apps/web/src/components.tsx` owns shared cards, navigation, dialogs and formatting.
- `apps/web/src/pages/Landing.tsx`, `pages/landing-copy.ts` and `components/Reveal.tsx` own the public composition, paired language copy and entrance behavior.
- `apps/web/src/styles.css` retains structural styles for the existing product routes. Dedicated redesign styles override those rules; do not add a second conflicting palette to a page.
- `apps/web/public/logo.svg` is the repository-authored mark. Lucide React supplies the interface icons.

The import order in `main.tsx` is `styles.css` → `foundation.css` → `workspace-refresh.css` → `landing.css`. Landing-specific selectors are scoped where they override shared styles. Keep this order explicit; retained selectors with greater specificity can still override a generic foundation rule.

The design uses actual API data for available shifts and account records. Interactive illustrations remain explicitly labelled as samples; they are not customer evidence, live usage statistics or promises of available work. No fabricated testimonials or third-party customer logos are used.

## Colour tokens

| Role / variable                      | Light                 | Dark                  |
| ------------------------------------ | --------------------- | --------------------- |
| Primary text — `--ink`               | `#11152B`             | `#F3F4FC`             |
| Secondary text — `--muted`           | `#626980`             | `#A6AEC6`             |
| Canvas — `--bg`                      | `#F7F8FC`             | `#0F1120`             |
| Surface — `--surface`                | `#FFFFFF`             | `#191C30`             |
| Secondary surface — `--surface-soft` | `#EFF0F7`             | `#22263D`             |
| Action — `--action`                  | `#6C4DFF`             | `#A898FF`             |
| Action hover — `--action-hover`      | `#5634E5`             | `#BDB0FF`             |
| Mint — `--accent-mint`               | `#C2F970`             | `#C2F970`             |
| Lilac — `--accent-lilac`             | `#EBE6FF`             | `#322B51`             |
| Border — `--border`                  | `#E1E4EE`             | `#30354E`             |
| Focus — `--focus`                    | `#6C4DFF`             | `#B9AAFF`             |
| Success text / background            | `#216546` / `#E8F5EE` | `#A6E3C0` / `#20372F` |
| Error text / background              | `#AE303D` / `#FFF0F1` | `#FFB1B9` / `#402630` |
| Warning text / background            | `#785317` / `#FFF6DF` | `#EED298` / `#3A3226` |

The inherited `--amber` variable now resolves to `#B9EF75` for compatibility with existing accent selectors. New work should use an explicit semantic or mint token. Light primary buttons use white labels; dark primary buttons use `#171226`. The `--action-text` token is white in light mode and `#221943` in dark mode, used by the contextual landing action and the authentication illustration. Mint buttons use dark `#182C20` text. A light label must not be placed on mint merely because another primary button uses white.

Calculated relative-luminance contrast for the solid token pairs: light ink/canvas **16.97:1**, light muted/canvas **5.14:1**, white/light action **5.07:1**, mint button label/background **12.03:1**, dark ink/canvas **17.08:1**, dark muted/surface **7.59:1**, dark primary label/action **7.47:1**. Success/error/warning text-background pairs are **6.21 / 5.77 / 6.40:1** in light mode and **8.71 / 7.96 / 8.60:1** in dark mode. These calculations cover these solid pairs only; opacity, gradients, focus visibility and actual rendered components require separate checks. They do not establish complete accessibility conformance.

Use semantic colour with explicit text and, where useful, an icon. A badge's colour alone must not distinguish pending, paid, rejected or confirmed states. Decorative borders are not a substitute for a visible keyboard focus indicator.

## Typography, spacing and surfaces

Manrope is self-hosted from the pinned `@fontsource/manrope` package, with Latin and Cyrillic subsets at weights 400, 500, 600 and 700. The package includes the SIL Open Font License. `main.tsx` loads those subsets; no remote font request is required. Keep the interface to this family, with monospace reserved for technical identifiers where needed.

The foundation uses a 15px base and 1.6 body line-height; paragraph text uses 1.75. General page headings scale from 28–40px. Workspace headings use 29–38px and resolve to 31px on mobile. Shared shift-card titles use 21px desktop / 23px mobile, interval text uses 13px, and wages use 26px desktop / 28px mobile. Supporting card text is generally 12px. Form labels use 13px. Text inputs use 14px on desktop and 16px below 768px, with a 50px minimum height. Mobile primary controls use 14px labels; compact controls use 12px. A denser operational view must preserve readable time, wage and status information.

Use the 8px spacing rhythm for overall composition, with 4px intermediate steps and optical adjustments for grouped controls. Section spacing is deliberately larger than spacing inside a form or a card. The foundation surface radius is 20px and the smaller radius is 12px. Shared shift cards use a 22px radius with 24px desktop / 23px mobile padding; navigation dialogs use 24px. General mobile panels use 18px, while workspace panels keep 20px. Badges use 6px and compact controls 10px. The radius follows the surface's purpose rather than making every element a pill.

The light surface shadow is `0 12px 36px -16px #22234D24`; dark uses `0 16px 42px -12px #0005`. Dialogs have a stronger temporary-surface shadow. Borders and whitespace carry ordinary grouping; shadows should support depth without reducing information density.

## Public composition

The landing page follows a concrete sequence: value proposition and interactive sample planner; three short product principles; live shift cards with category filters; benefit illustrations; three process steps; employer workflow preview; native FAQ disclosures; and a final worker action. The employer preview is visibly labelled as a calendar example. The static initials and calendar marks are illustration content, not social proof.

The desktop hero uses a `1.08fr / 1fr` split with the heading and two actual navigation actions on the left. Its heading uses `clamp(50px, 5.25vw, 78px)`, with adjusted tablet rules and 87px above 1600px. Below 768px the hero stacks and uses `clamp(40px, 11.5vw, 65px)`; at 375px and below it resolves to 40px. Section headings generally use `clamp(32px, 3.5vw, 47px)` on desktop and 34px on mobile, with purpose-specific exceptions for the planner, business section and final action.

The hero action targets are 56px high on desktop and 52px on mobile. Time-period choices remain native buttons with pressed state and a 44px minimum height on mobile; a polite, atomic live region announces the selected period and interval. The planner changes only demonstration state; it does not book a shift, change availability or claim a personalized match. Actual shift cards link to actual detail routes and show loading, failure and empty states from the query. Catalogue failure has its own localized explanation and retry control, independent of shift-list availability.

The main public sections use 104px top spacing on desktop and 65px on mobile. Benefit cards use 23px radii, the dark employer feature uses 28px, and shared data cards retain their own 22px radius. Category filters scroll within their row on narrow screens. The FAQ uses native `details`/`summary` controls, keeping content available without an animation dependency.

## Controls and feedback

Foundation primary buttons default to 50px high; compact and icon controls use at least 44px. A clear primary action should be visually distinct from cancellation, navigation and destructive actions. Pending controls prevent duplicate submissions and display an appropriate pending label. Acceptance, attendance and billing wait for persisted server success.

Forms retain visible labels and input values after a failed request. Errors belong next to the field or action that needs attention, with an accessible input/error relationship. The phone form demonstrates this pattern. A reason-entry action renders its server error inside the open dialog so it remains visible while the user corrects or retries the request. General loading, empty, failure and success states remain part of the interface, including real retry behavior.

Native dialogs provide a labelled title, backdrop, Escape dismissal, focus containment and return to the opening control. Mobile navigation uses this dialog pattern; the desktop sidebar remains a persistent navigation region. Menu triggers expose expanded state and identify the controlled drawer. Navigation, logout and closing remain available without animation.

Shift cards give the local interval and wage basis prominent positions, with organisation, area, verification and capacity as supporting details. The shared card marks an overnight interval with `+1` and supplies a localized full start/end interval to assistive technology. This behavior must be carried into any separate agenda/calendar interval renderer rather than assuming a clock-only range is always same-day.

Wage states distinguish calculated wages, an employer's marked-paid record and a worker's confirmation. Subscription billing is a separate concept. Mock payments and sample data stay visibly labelled; unavailable providers retain their explanation. Verification of identity and verification of individual skills remain distinct. Server permissions remain authoritative for every action.

## Responsive behavior

The shared content width is `min(1280px, 100% - 96px)`, with a wider 1380px maximum above 1600px. It becomes `100% - 64px` below 1190px and `100% - 40px` below 768px. These are layout rules, not a fixed-size design canvas.

Workspace sidebars use 256px on desktop and 222px from 768–1180px. Below 768px the persistent sidebar is `display: none`, removing its hidden links from keyboard navigation; the menu opens a native dialog instead. Public navigation changes to a dialog at 960px and below. The shared dialog locks background body scrolling and restores it when closed.

Mobile layouts stack dense sections, preserve comfortable form controls and reserve space for bottom navigation. Worker and employer navigation provide four primary destinations with a 57px minimum target height plus safe-area padding. Their labels use 12px at every mobile width; profile controls preserve a 44px target. A contextual mobile landing action appears only after the hero actions pass above the viewport; the hidden action is inert.

Tables and calendars may scroll inside a labelled, bounded region. The page itself must not overflow horizontally. Test longer Russian strings, 360px width, text zoom, virtual keyboards, landscape orientation and safe areas rather than hiding overflow to conceal layout defects.

The employer calendar defaults to day view below 768px and week view on larger screens, until the user explicitly chooses a mode. That choice survives resizing. The initial date uses Tashkent time; an empty date-input value is ignored. Week scrolling has a labelled keyboard-focusable region, empty days show a compact message, overnight blocks show `+1`, and selected details include both full dates. The final browser check verifies the UTC-to-Tashkent midnight boundary and responsive/manual-mode behavior.

## Motion

Motion clarifies state and hierarchy without controlling navigation. Shared buttons use 200ms colour/shadow feedback and a 300ms transform with `cubic-bezier(.22,1,.36,1)`. Hover lifts a button by 2px; press returns it and scales to 0.98. The icon's small hover movement applies only to devices that report hover support.

Navigation dialogs enter over 220ms from 8px above and scale 0.98, with opacity. Shared shift-card arrow feedback takes 200ms; card border/shadow changes take 220ms. These effects are removed with reduced motion.

Landing sections reveal once as they enter the viewport, using opacity over 650ms and a 24px upward entrance over 750ms, with small group delays. This is an entrance effect, not a continuously looping background animation. The sample planner responds to a selected time period and remains usable without animation.

The landing heading underline draws once over 1s after a 300ms delay. Planner callouts enter once over 750ms; selecting a sample period triggers a 350ms content change. FAQ answers use a 220ms entrance. A 2px scroll-progress decoration uses CSS scroll timelines only where supported, without changing scroll behavior or handling wheel/touch events. Reduced motion reveals the underline immediately and hides this progress decoration.

Motion for React uses `reducedMotion="user"`. Shared card layout transitions take 200ms. The lightweight `motion/react-m` API and asynchronous `LazyMotion` feature bundle retain layout behavior outside the initial render path. The foundation's `prefers-reduced-motion` rule disables CSS animations, transitions and smooth scrolling, and forces pending reveals visible. No essential information may stay hidden if motion is reduced or observation is unavailable.

## Language, time and data

Uzbek Latin and Russian UI strings are paired in `i18n.ts`, with landing copy in `pages/landing-copy.ts`. Uzbek is the fallback. User-entered content and server records are not silently machine translated.

Dates use Asia/Tashkent. Uzbek month/day names are explicitly mapped to avoid incomplete browser locale data. Money arrives as integer tiyin and is formatted as UZS at the display boundary. Date-time inputs are interpreted as UTC+5 regardless of the browser timezone. Language and theme may persist in localStorage; selected organisation is sessionStorage UI context and grants no permission. Credentials and business records do not belong in these stores.

## Verification scope

`DESIGN_REVIEW.md` records the five source-review priorities identified before this redesign. It is not a record of completed browser acceptance checks. Check the final implementation in both themes and languages at 360, 390, 768, 1024 and 1440px, including keyboard navigation and reduced motion.

Build, typecheck and component tests are separate from visual and assistive-technology review. Store executed browser results, viewport captures and performance conditions in the test report. Earlier measurements apply to the earlier build and must not be reused as measured redesign results. Performance targets remain LCP ≤2.5s, CLS ≤0.1 and INP ≤200ms; do not invent field or INP results when only lab evidence exists.
