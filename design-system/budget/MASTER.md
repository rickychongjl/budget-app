# Budget — Design System (MASTER)

Global source of truth for how the app looks, feels and moves. All UI work in `src/web` follows this file.

- A page may override it with `design-system/budget/pages/<page>.md`. If that file exists, its rules win for that page only. Otherwise this file applies in full.
- Product behaviour lives in `docs/solution-design.md` and `docs/user-stories.md`. This file never changes behaviour, only presentation.
- Built with the `ui-ux-pro-max` skill (palette: "Personal Finance Tracker"; type: Inter; style: Minimalism & Swiss), then extended by hand for light mode, status colours, chart colours and components. Every colour pair below was contrast-checked; the ratios are recorded next to the tokens.

## 1. Principles

1. **One hand, one glance.** The app is used on a phone, often standing in a shop. The number that matters is the biggest thing on the screen. Primary actions sit in the bottom half.
2. **Money is data, not decoration.** Flat surfaces, thin borders, no gradients, no glass or blur, no drop shadows on cards. Colour is reserved for meaning.
3. **Red and green mean something.** Red is only "over budget" or destructive. Green is only "ahead of target" or success. Neither is ever used as a category colour or for branding.
4. **Colour never works alone.** Every status also has an icon and a word.
5. **Both themes are first-class.** Nothing is designed in one theme and "inverted" for the other. Components use semantic tokens only, never raw hex.
6. **Fast and calm.** Motion is short and explains where something came from. Nothing loops, bounces or animates on scroll.

## 2. Theming

- Three user settings: **System** (default), **Light**, **Dark**. Shown as a segmented control in Settings.
- The resolved theme is set as `data-theme="light"` or `data-theme="dark"` on `<html>`. Tokens are defined under `:root[data-theme="light"]` and `:root[data-theme="dark"]`.
- The preference (`system` | `light` | `dark`) is stored in `localStorage` under `budget.theme`. It is a per-device convenience, so it is not stored on the server.
- A small inline script in `index.html` sets `data-theme` before first paint to prevent a flash of the wrong theme. It must be covered by a CSP hash (design doc section 6).
- When the setting is System, listen to `prefers-color-scheme` changes and update live.
- Set `color-scheme: light` or `dark` on `<html>` so native controls and scrollbars match.
- Update `<meta name="theme-color">` on every theme change: `#F8FAFC` in light, `#0F172A` in dark, so the phone's status bar matches the app background.
- Theme changes apply instantly. Do not animate the colour swap.

## 3. Colour tokens

Components reference these CSS custom properties only.

### 3.1 Surfaces, text and brand

| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-bg` | `#F8FAFC` | `#0F172A` | App background |
| `--color-surface` | `#FFFFFF` | `#192134` | Cards, sheets, tab bar |
| `--color-surface-2` | `#F1F5F9` | `#243049` | Pressed rows, keypad keys, progress track, skeletons |
| `--color-border` | `#E2E8F0` | `#2A3650` | Card edges and dividers (decorative) |
| `--color-border-strong` | `#64748B` | `#64748B` | Input and control outlines (3:1 or better against bg and surface) |
| `--color-text` | `#0F172A` | `#F8FAFC` | Primary text (17:1 / 15:1 on surface) |
| `--color-text-muted` | `#475569` | `#94A3B8` | Secondary text, labels (7.6:1 / 6.3:1 on surface) |
| `--color-text-subtle` | `#64748B` | `#8291A8` | Placeholders, hints. On `bg` and `surface` only, never on `surface-2` (4.8:1 / 5.0:1) |
| `--color-primary` | `#1E40AF` | `#60A5FA` | Primary button fill, links, active tab, normal progress fill, focus ring |
| `--color-on-primary` | `#FFFFFF` | `#0F172A` | Text and icons on primary (8.7:1 / 7.0:1) |
| `--color-primary-soft` | `#DBEAFE` | `#1E3A5F` | Selected chips, active tab pill. Text on it is `--color-text` |
| `--color-overlay` | `rgba(15,23,42,0.45)` | `rgba(0,0,0,0.60)` | Scrim behind sheets and dialogs |

### 3.2 Status

Each status has a text colour (for words and icons, 4.5:1 or better), a fill (for bars and dots, 3:1 or better) and a soft background (for badges).

| Status | Meaning | Token | Light | Dark |
|---|---|---|---|---|
| Negative | Debit over budget; destructive | `--color-negative` (text) | `#B91C1C` | `#F87171` |
| | | `--color-negative-fill` | `#DC2626` | `#F87171` |
| | | `--color-negative-soft` | `#FEE2E2` | `#3F1D24` |
| Positive | Credit ahead of target; success | `--color-positive` (text) | `#047857` | `#34D399` |
| | | `--color-positive-fill` | `#059669` | `#34D399` |
| | | `--color-positive-soft` | `#D1FAE5` | `#12352F` |
| Warning | Debit at 80% or more of its limit | `--color-warning` (text) | `#B45309` | `#FBBF24` |
| | | `--color-warning-fill` | `#B45309` | `#FBBF24` |
| | | `--color-warning-soft` | `#FEF3C7` | `#3B2F14` |

Text on a soft background uses the matching status text colour. Text on a destructive button fill (`--color-negative-fill`) is `#FFFFFF` in light (4.8:1) and `#0F172A` in dark (6.5:1): use `--color-on-negative`.

### 3.3 Status rules for categories

| Category type | Condition | Status | Bar fill | Icon (Lucide) | Word |
|---|---|---|---|---|---|
| Debit | under 80% of budget | Normal | `--color-primary` | none | "$X left" |
| Debit | 80% to 100% | Warning | `--color-warning-fill` | `triangle-alert` | "$X left" |
| Debit | over 100% | Negative | `--color-negative-fill` | `circle-alert` | "Over by $X" |
| Credit | under 100% of expected | Normal | `--color-primary` | none | "$X to go" |
| Credit | exactly 100% | Positive | `--color-positive-fill` | `check` | "Received" |
| Credit | over 100% | Positive | `--color-positive-fill` | `trending-up` | "Ahead by $X" |

The thresholds are presentation only. Whether a category is over or ahead comes from the API rollup; the front end does not recompute it.

### 3.4 Category and chart palette

Eight slots. No red and no green, because those are status colours. All are 4.4:1 or better against their theme's surface.

| Slot | Light | Dark | Line style in charts |
|---|---|---|---|
| `blue` | `#2563EB` | `#60A5FA` | solid |
| `orange` | `#C2410C` | `#FB923C` | dashed |
| `violet` | `#7C3AED` | `#A78BFA` | dotted |
| `cyan` | `#0E7490` | `#22D3EE` | dash-dot |
| `pink` | `#DB2777` | `#F472B6` | solid |
| `teal` | `#0F766E` | `#2DD4BF` | dashed |
| `ochre` | `#A16207` | `#FACC15` | dotted |
| `slate` | `#475569` | `#CBD5E1` | dash-dot |

- Exposed as `--cat-blue`, `--cat-orange`, and so on.
- **A category's `Colour` is stored as the slot name (`"blue"`), never as a hex value.** That is what lets one stored value render correctly in both themes. New categories take the next unused slot; after eight, slots repeat and the icon tells them apart.
- Category colour is used for the category's icon chip and for its line in the trend chart. It is never used for the progress bar, which always shows status (3.3).

## 4. Typography

- **Family:** Inter (variable), self-hosted with `@fontsource-variable/inter`. Do not load fonts from Google's CDN: the CSP allows `self` only and the app must work offline. Fallback stack: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
- **Every amount uses** `font-variant-numeric: tabular-nums` (utility class `.num`), so columns of money line up and figures do not jitter as they change.
- Sizes are in `rem` so the user's text-size setting is respected. Never disable pinch zoom.

| Token | Size / line height | Weight | Use |
|---|---|---|---|
| `--text-display` | 2rem / 2.5rem | 700, tracking -0.02em | The one hero amount per screen (spent this cycle, keypad amount) |
| `--text-title` | 1.375rem / 1.75rem | 600 | Screen titles |
| `--text-heading` | 1.0625rem / 1.5rem | 600 | Card and section headings, row titles |
| `--text-body` | 1rem / 1.5rem | 400 | Default text, inputs (16px stops iOS zooming on focus) |
| `--text-label` | 0.875rem / 1.25rem | 500 | Buttons, secondary row text, chart axes |
| `--text-caption` | 0.75rem / 1rem | 500 | Tab labels, badges, timestamps. Nothing is smaller than this |

One display-size number per screen. Headings are sentence case. No all-caps except the optional caption above a section.

## 5. Spacing, shape and elevation

- **Spacing scale (4px base):** `--space-1` 4, `--space-2` 8, `--space-3` 12, `--space-4` 16, `--space-5` 20, `--space-6` 24, `--space-8` 32, `--space-12` 48.
- Screen side gutter: 16. Gap between cards: 12. Card padding: 16. Gap between sections: 24.
- **Radius:** `--radius-sm` 8 (inputs, chips, keypad keys), `--radius-md` 12 (cards, buttons), `--radius-lg` 20 (top corners of sheets), `--radius-full` (pills, progress bars, icon chips).
- **Elevation:** cards have a 1px `--color-border` and no shadow. Only things that float get a shadow: sheets, dialogs and toasts use `--shadow-float` (`0 8px 32px rgba(15,23,42,0.16)` light, `0 8px 32px rgba(0,0,0,0.5)` dark).
- **Z-order:** content 0, tab bar 10, toast 20, scrim 30, sheet and dialog 40.

## 6. Layout

- Mobile first. Designed for 360 to 430px wide. From 600px up, the content column is capped at 480px and centred on `--color-bg`; nothing else changes. There is no separate desktop layout.
- Viewport: `width=device-width, initial-scale=1, viewport-fit=cover`. Never `user-scalable=no` or `maximum-scale`.
- Full-height screens use `100dvh`, not `100vh`.
- **Safe areas:** the top bar adds `env(safe-area-inset-top)`; the tab bar and any sticky bottom button add `env(safe-area-inset-bottom)`. Scrollable content gets bottom padding of tab bar height plus the inset so the last row is never hidden.
- Set `scroll-padding-top` and `scroll-padding-bottom` on the scroll container to the heights of the top bar and tab bar, so a focused element is never hidden behind them.
- Landscape is supported, not locked out: the same centred column, and sheets scroll internally when the screen is short. The manifest does not set `orientation`.
- No horizontal scrolling anywhere. Long category names truncate with an ellipsis on one line; amounts never truncate.
- Set `overscroll-behavior-y: contain` on the app shell so pull-down does not trigger the browser's refresh in standalone mode.
- Reserve space for anything that loads (skeletons of the final size) so the layout does not jump.

## 7. Motion

CSS transitions only. No animation library.

| Token | Value | Use |
|---|---|---|
| `--dur-press` | 100ms | Press feedback |
| `--dur-fast` | 150ms | Colour, opacity, small state changes |
| `--dur-base` | 250ms | Sheet and dialog enter, progress bar fill |
| `--dur-exit` | 180ms | Sheet and dialog exit (exits are faster than enters) |
| `--ease-out` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Entering |
| `--ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | Leaving |

- Animate `transform` and `opacity` only. Progress bars animate `transform: scaleX()`, never `width`.
- Press feedback: `scale(0.98)` plus the `surface-2` background. There is no hover-only behaviour anywhere.
- Under `prefers-reduced-motion: reduce`: no transforms, sheets and dialogs appear with a 100ms fade, progress bars render at their final value.
- Haptics (`navigator.vibrate(10)`) where supported: on saving a transaction and on confirming a destructive action. Never on plain navigation.

## 8. Icons

- Lucide (`lucide-react`), outline style only, stroke width 2 everywhere. Two sizes: `--icon-md` 24px (default) and `--icon-sm` 20px (inside buttons and badges). No other sizes, no filled variants.
- Icons that carry meaning (status icons, icon-only buttons) need 3:1 or better against their background. Align icons to the text's centre line with an 8px gap.
- The "Sign in with Microsoft" button uses Microsoft's official logo and wording, unmodified. It is the only third-party brand asset in the app.
- The app mark (`BrandMark`, drawn from `public/favicon.svg`, the same file the PWA icons are rasterised from) is the one full-colour, non-Lucide icon of our own. It appears in three places only: before the title in every screen's top bar (`--icon-md`), as the Home tab's icon (`--icon-md`), and above the name on the sign-in screen (`--mark-lg`). It is always decorative (`alt=""`), because a name or title beside it says the same thing.
- A category's `Icon` is stored as the Lucide icon name (`"utensils"`), shown inside a 40px round chip: slot colour at 15% opacity as the background, slot colour for the icon.
- No emoji as icons. Decorative icons are `aria-hidden="true"`. An icon-only button always has an `aria-label`.

## 9. Components

Every interactive element is at least 44x44px (48px preferred) with at least 8px between neighbouring targets, and shows a visible `:focus-visible` ring: `outline: 2px solid var(--color-primary); outline-offset: 2px`.

**States, for every control.** Pressed (section 7), focused (the ring above), selected and disabled must each be distinguishable in both themes. Disabled: the native `disabled` attribute (or `aria-disabled` with the action blocked), 40% opacity, no press feedback. Selected state is announced, not only drawn: the active tab has `aria-current="page"`, segmented controls are a `radiogroup`, toggles use `aria-pressed`, and "Add note" uses `aria-expanded`. Use real `<button>`, `<a>` and `<input>` elements; never a clickable `<div>`. Focus order follows visual order.

**Gestures.** One gesture per region. A sheet is dragged by its handle and header only, so dragging never fights the sheet's own scrolling. No swipe actions on list rows (edit and delete are reached by tapping the row), which also keeps the phone's edge back-swipe free. Every drag has a button alternative.

**App shell.** Top bar (56px plus top inset): the app mark then the screen title on the left, at most one action on the right. Scrolling content. Bottom tab bar.

**Bottom tab bar.** Four tabs: Home, Add, Cycles, Settings. Height 56px plus bottom inset, `--color-surface`, 1px top border. Each tab is an icon with a caption label that is always visible. Home's icon is the app mark (section 8), not `house`. Active tab: `--color-primary` icon and label on a `--color-primary-soft` pill. Add opens the add-transaction sheet over the current screen rather than navigating. Each tab keeps its own scroll position and history; the back gesture is predictable.

**Card.** `--color-surface`, 1px border, `--radius-md`, 16 padding. A tappable card shows a trailing `chevron-right`.

**Cycle header (Home).** Caption "1 Sep to 30 Sep · day 12 of 30". The hero amount in `--text-display`: total spent. Under it, muted: "of $X budgeted". A second line shows received against expected.

**Category row.** Icon chip, name (`--text-heading`, truncates), amount "spent / budget" right-aligned in `.num`. Beneath: a progress bar 8px tall, `--radius-full`, track `--color-surface-2`, fill per 3.3, capped at 100% wide. Beneath that: the status word, with its icon when not Normal. The bar has `role="progressbar"` with `aria-valuetext` such as "Food: $420 of $400, over by $20". Debit and credit categories are listed in separate sections headed "Spending" and "Income".

**Status badge.** Pill, caption size, soft background with matching status text colour, icon plus word. Used in the cycle list (Current, Past, Upcoming, Draft) and on cycle detail.

**Buttons.** Height 48, `--radius-md`, `--text-label` at 600. Primary (filled `--color-primary`), secondary (1px `--color-border-strong`, transparent), ghost (text only), destructive (filled `--color-negative-fill`). One primary button per screen. A sticky bottom primary button is full width. While a request is pending the button is disabled and shows a spinner in place of its icon, keeping its width.

**Inputs.** Always a visible label above; a placeholder is never the label. Height 48, 1px `--color-border-strong`, `--radius-sm`, 16px text. Errors appear directly under the field in `--color-negative` with an icon, linked by `aria-describedby`; focus moves to the first invalid field on submit, and the inline errors stay until fixed. A form with several fields (onboarding) also shows a linked error summary at the top when more than one field fails, and focuses that instead. Use the right keyboard: `inputmode="decimal"` for money, `type="date"` for dates, `type="search"` for search.

**Add-transaction sheet.** A bottom sheet that opens with the amount focused.
- The amount is shown in `--text-display` with the currency symbol. A Spending / Income segmented control sits above it.
- The app's own numeric keypad: a 3 by 4 grid of digits, decimal point and backspace. Keys are at least 56px tall, `--color-surface-2`, `--radius-sm`, separated by 8px. The keypad, not the system keyboard, is used here so the layout does not jump.
- Category picker: a search field, then the last-used category first, then the rest, filtered by the Spending / Income choice. Rows are category rows without the bar.
- The date defaults to today. The note is optional and collapsed behind "Add note".
- Save is a sticky primary button, disabled until there is an amount and a category. On save: haptic, the sheet closes, and a toast says "Saved" with an Undo action.
- Saving into a past cycle shows the closing-balance prompt (see Dialog).

**Bottom sheet.** `--color-surface`, `--radius-lg` on the top corners, a 36x4px drag handle, scrim behind. Maximum height 90dvh with internal scrolling. Closes by dragging down, tapping the scrim, the Escape key, or a visible Close button (a drag is never the only way). Focus is trapped while open and returns to the element that opened it.

**Dialog.** Centred, maximum width 320, for confirmations only. Title, one or two sentences, two buttons with the safe choice on the left. Required uses:
- Moving the cycle start date: "This also moves every upcoming cycle. Past cycles stay as they are."
- Editing a past cycle's transactions: "You changed a past cycle. Update its closing balance too?" with "Update balance" and "Not now".
- Any delete.

**Toast.** Sits above the tab bar, `--shadow-float`, disappears after 4 seconds, one at a time, announced with `aria-live="polite"`. An error toast stays until dismissed.

**Connectivity banner.** A slim bar under the top bar. Offline: "Offline. Changes will sync when you're back online." With queued changes: "3 changes waiting to sync." Uses `--color-surface-2` and muted text. It is information, not an error.

**Cycle list row.** Date range as the heading, a status badge, then spent against budgeted and the amount accrued (positive in `--color-positive`, negative in `--color-negative`, each with a + or − sign), and a chevron.

**Segmented control.** Used for the theme, Spending / Income, and the chart filter. `--color-surface-2` track with the selected segment on `--color-surface`. At most four segments. For the category chart filter, which can have more options, use a horizontally scrolling chip row inside its own container instead; the page itself still never scrolls sideways.

**Empty states.** An icon, one sentence, one action. First login: "No budget yet. Set up your first cycle." There is no illustration set.

**Skeletons.** `--color-surface-2` blocks of the final size with a slow opacity pulse (none under reduced motion). Cached data is shown immediately, so skeletons appear only on a true first load.

## 10. Charts

Recharts, drawn as SVG.

- **Home and cycle detail do not use a chart library.** The category rows with progress bars are the visualisation. They are more readable on a phone than a pie or bar chart and carry the status rules.
- **Trend (Cycles page):** a line chart across cycles. Filters: Total spending, one category, or Money accrued. One series at a time by default, in `--color-primary` for total and accrued, or the category's slot colour for a category.
  - If several categories are ever shown together, the limit is four, each with its slot colour **and** its line style from 3.4, labelled at the line end rather than in a separate legend.
  - Accrued can go below zero: draw a zero baseline in `--color-border-strong`. The line stays one colour; positive and negative are shown in the tooltip and the table with + and − signs.
  - With fewer than three cycles, show the values as stat cards instead of a line.
- Height 220px. X axis: cycle start date as "1 Sep". Y axis: at most four ticks, compact currency ("$1.2k"). Grid lines in `--color-border`, horizontal only. Axis text is `--text-caption` in `--color-text-muted`.
- Points are 4px dots with a 44px invisible hit area. Tapping a point shows a tooltip (`--color-surface`, 1px border) with the cycle dates and the exact amount. There is no hover-only interaction.
- Chart colours are read from the CSS variables at render time so a theme change redraws correctly.
- Accessibility: every chart has a one-sentence text summary above it ("Spending fell 8% over the last 6 cycles") and a "View as table" toggle showing the same data. The SVG has `role="img"` and an `aria-label`.

## 11. Number and date formatting

- Money goes through `Intl.NumberFormat("en-AU", { style: "currency", currency })` with the user's `Currency`. Always two decimals in lists and forms; compact form on chart axes only.
- A negative amount uses a true minus sign, "−$20.00", never brackets and never colour alone. Income in mixed lists is prefixed with "+".
- Dates read "1 Sep" inside the current year and "1 Sep 2025" otherwise. Cycle ranges read "1 Sep to 30 Sep".
- Amounts are right-aligned in lists.

## 12. Accessibility baseline

- Text contrast 4.5:1 or better; graphics and control outlines 3:1 or better, in both themes. New colours must be checked before they are added to this file.
- Status is always colour plus icon plus word.
- Everything works with a keyboard: logical tab order, a visible focus ring, Escape closes sheets and dialogs.
- Touch targets 44px or larger, 8px apart.
- Inputs have visible labels; errors are next to the field and announced.
- `prefers-reduced-motion` is respected everywhere.
- The page reflows at 200% text size without loss of content.
- `lang="en-AU"` on `<html>`.

## 13. Avoid

- Glassmorphism, backdrop blur, gradients, neon, drop shadows on cards.
- Red or green for anything other than the statuses in 3.2.
- Raw hex values, or Tailwind palette classes such as `text-gray-500`, inside components. Use tokens.
- Storing a hex value as a category's colour.
- Pie and donut charts. The user stories ask for per-category status and a trend line; neither is a proportion.
- Hover-only behaviour, tooltips that need hover, `cursor: pointer` as the only affordance.
- Placeholder-only labels. Errors shown only at the top of a form.
- Animating `width`, `height`, `top` or `left`. Scroll-triggered animation. Any animation library.
- Web fonts from a CDN.
- Disabling zoom. Text under 12px.
- More than one primary button per screen. More than five bottom tabs.

## 14. Before a UI change is done

- [ ] Checked in light and dark, including the toggle itself and the System setting.
- [ ] Checked at 360px and 430px wide, in landscape, and in standalone mode on a phone with a notch (safe areas).
- [ ] Checked at the largest system text size and at 200% zoom: nothing clipped or overlapping.
- [ ] Pressed, focused, selected and disabled states are all distinguishable in both themes, and pressing never shifts the layout.
- [ ] Selected and expanded states are announced (`aria-current`, `aria-pressed`, `aria-expanded`); decorative icons are `aria-hidden`; icon-only buttons have a name.
- [ ] Focused elements are not hidden behind the top bar, tab bar or a sheet.
- [ ] Any drag or swipe has a button alternative, and no gesture conflicts with scrolling or the back-swipe.
- [ ] Scrim checked against the real screen behind it in both themes.
- [ ] Only tokens used: no raw hex, no ad hoc spacing or radius values.
- [ ] Amounts use `.num` and the shared money formatter.
- [ ] Every status shows colour, icon and word.
- [ ] Targets are 44px or larger; the focus ring is visible; sheets trap and return focus.
- [ ] Inputs have visible labels and the right `inputmode`.
- [ ] Works offline: cached data renders and the connectivity banner appears.
- [ ] Loading reserves space; nothing jumps.
- [ ] Reduced motion checked.
- [ ] Charts have a text summary and a table view.
