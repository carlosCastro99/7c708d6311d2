# Material Design Visual Refresh — Design Spec

## Goal

Replace MX-Inventory's current bare-bones visual style (flat unstyled buttons, bordered lists, no elevation or type scale) with a Material Design 3-inspired look, without touching any page's layout, structure, or behavior. Purely a re-skin of the shared CSS.

## Scope

**In scope:**
- Rewriting `src/styles.css` with a Material Design 3-style token system (color roles, type scale, spacing scale, shape/radius, elevation) and restyling the existing shared classes/elements (`button`, `button.secondary`, `button.danger`, `.list-item`, `.form-row`, `input`, `select`, `.screen`, `.variance-warning`) to use those tokens.

**Explicitly out of scope (for this pass):**
- No JSX/component structure changes anywhere — every page keeps its current DOM layout, navigation flow, and props.
- No new dependencies — no Material component library (e.g. MUI), no icon font/SVG set, no web fonts. Everything stays `system-ui`, keeping the app light to cache fully offline via the existing service worker.
- No dark mode — light theme only, matching the current forced-light setup.
- No structural additions (no top app bar, no bottom nav, no FAB-as-new-element) — only restyling elements that already exist in the markup.
- Existing touch-target sizing (44px minimum) is preserved exactly; this changes proportions and color, not tap-target sizes.

## Color tokens (Blue direction, chosen via mockup review)

| Token | Value | Used for |
|---|---|---|
| `--md-primary` | `#0B57D0` | primary buttons, active/selected states, links, list-item accent |
| `--md-on-primary` | `#FFFFFF` | text/icons on primary buttons |
| `--md-primary-container` | `#E5EDFC` | secondary buttons, `−` counter button background |
| `--md-on-primary-container` | `#0B57D0` | text on primary-container elements |
| `--md-surface` | `#FFFFFF` | cards, list items, form fields |
| `--md-background` | `#F7F9FE` | page background (`.screen`) |
| `--md-on-surface` | `#1B1B1F` | primary body text |
| `--md-on-surface-variant` | `#44474E` | secondary/muted text, form labels |
| `--md-outline` | `#C4C6CF` | input borders, dividers |
| `--md-error` | `#B3261E` | `.danger` button, `.variance-warning` text |

## Typography scale

All still `system-ui, sans-serif` (no font downloads):
- Page titles (`h1`): 22px / weight 600
- Body text (default): 16px / weight 400
- Labels (form field labels, list secondary text): 14px / weight 500, color `--md-on-surface-variant`

## Spacing, shape, elevation tokens

- Spacing scale: `--md-space-1: 8px`, `--md-space-2: 12px`, `--md-space-3: 16px`, `--md-space-4: 24px` — replaces ad-hoc rem values in padding/margins/gaps.
- Corner radius: `--md-radius-sm: 8px` (form fields), `--md-radius-md: 12px` (cards, list items, buttons), `--md-radius-full: 24px` (primary action/counter buttons, pill-shaped).
- Elevation: `--md-elevation-1: 0 1px 3px rgba(0,0,0,0.12)` (cards, list items, secondary buttons), `--md-elevation-2: 0 2px 6px rgba(0,0,0,0.16)` (primary action buttons).

## Component treatments

- **`.screen`**: background `--md-background`; side padding increases from 1rem to `--md-space-4` (24px).
- **`button` (primary)**: background `--md-primary`, text `--md-on-primary`, radius `--md-radius-md`, shadow `--md-elevation-2`. `:active` state: `transform: scale(0.98)` + slight opacity dip, as a lightweight tap-feedback substitute for a real ripple (no JS added).
- **`button.secondary`**: background `--md-primary-container`, text `--md-on-primary-container`, radius `--md-radius-md`, shadow `--md-elevation-1`, same `:active` feedback.
- **`button.danger`**: background `--md-error`, text white, same shape/elevation/active treatment as primary.
- **`.list-item`**: becomes an individually elevated card — background `--md-surface`, radius `--md-radius-md`, shadow `--md-elevation-1`, `margin-bottom: --md-space-1` (8px) instead of a bottom border. No JSX change needed; this class is already applied per-row.
- **`input`, `select`**: Material "outlined field" style — background `--md-surface`, `1px solid --md-outline` border, radius `--md-radius-sm`. `:focus` state: border color `--md-primary` + a soft `box-shadow` glow in the primary color at low opacity.
- **`.form-row label`**: 14px / weight 500 / color `--md-on-surface-variant`, positioned with `--md-space-1` gap above its field (via the existing flex-column `.form-row` gap).
- **`.variance-warning`**: color switches to `--md-error` token (same red, now token-driven).

Any button/element carrying the `.tap-target` class or otherwise not explicitly covered above inherits the same base radius/shadow/active-state treatment as the primary button, so nothing on any of the ~20 pages is left in the old flat style.

## Verification

This is a CSS-only change with no DOM/behavior modifications, so:
- The existing automated test suite (React Testing Library, which asserts on text/roles/attributes, not visual styles) should pass unmodified — it verifies this change introduced no functional regression.
- `npm run build` must still succeed.
- Manual visual check across a representative sample of pages (Home, a master-data list page, the counting screen, a form page) since no automated visual-regression tooling exists in this project — appearance itself isn't something the test suite can confirm.
