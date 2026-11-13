---
name: Evenpoint
description: A local analytics app that turns a team's own export into a defensible answer about what to automate with AI.
colors:
  ground: "#f4f5f7"
  surface: "#ffffff"
  subtle: "#f8f9fa"
  hover: "#f1f3f5"
  hairline: "#e3e6ea"
  hairline-strong: "#cdd2d9"
  ink: "#14171c"
  ink-2: "#464d58"
  ink-3: "#636a75"
  accent: "#3451d1"
  accent-hover: "#2a43b4"
  accent-soft: "#edf0fc"
  accent-tint: "#8ea2f0"
  good: "#0a7347"
  good-soft: "#e3f4eb"
  warn: "#8f5200"
  warn-soft: "#fdf1dc"
  quiet: "#474e59"
  quiet-soft: "#eceef1"
  bad: "#b42318"
  bad-soft: "#fcebea"
typography:
  headline:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  answer:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    letterSpacing: "-0.005em"
  body:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "\"ss01\", \"cv11\""
  label:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
  meta:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 550
  mono:
    fontFamily: "Geist Mono Variable, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "12.5px"
    fontWeight: 400
rounded:
  sm: "6px"
  md: "8px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  panel: "18px"
  section: "20px"
  xl: "24px"
  page-x: "40px"
components:
  button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 13px"
    height: "34px"
  button-hover:
    backgroundColor: "{colors.subtle}"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "0 13px"
    height: "34px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.sm}"
    padding: "0 13px"
    height: "34px"
  button-ghost-hover:
    backgroundColor: "{colors.hover}"
    textColor: "{colors.ink}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "34px"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "{spacing.panel}"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.sm}"
    padding: "7px 10px"
  nav-item-active:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
  badge-automate:
    backgroundColor: "{colors.good-soft}"
    textColor: "{colors.good}"
    rounded: "{rounded.pill}"
    padding: "0 8px"
    height: "22px"
  badge-review:
    backgroundColor: "{colors.warn-soft}"
    textColor: "{colors.warn}"
    rounded: "{rounded.pill}"
    padding: "0 8px"
    height: "22px"
  badge-dont-automate:
    backgroundColor: "{colors.quiet-soft}"
    textColor: "{colors.quiet}"
    rounded: "{rounded.pill}"
    padding: "0 8px"
    height: "22px"
  table-header:
    backgroundColor: "{colors.subtle}"
    textColor: "{colors.ink-3}"
    typography: "{typography.meta}"
    padding: "9px 14px"
---

# Design System: Evenpoint

## Overview

**Creative North Star: "The Defensible Ledger"**

Evenpoint is the category-standard analytics dashboard, executed at Stripe-dashboard clarity and nothing more decorative than that. An operations lead sets up an export, runs it, and reads an answer they can defend to a manager. The system's job is to make numbers, ranges and verdicts legible; it refuses novelty styling and refuses to hide uncertainty.

The world is a light, cool neutral ground with white panels sitting on it, separated by hairline borders and the softest of shadows. One blue accent marks action, selection and focus. Green, amber and grey appear only as verdict meaning (automate, automate with review, don't automate), never as decoration. Density is moderate and table-led: 14px body, tabular numerals everywhere numbers sit in columns, generous row padding.

Type is a single family, Geist, at a tight ramp; Geist Mono is reserved for the machine's voice (logs, ids, model names, API keys). Icons are Lucide line icons at 16px, stroke 1.75.

**Key Characteristics:**
- Cool grey ground, white hairline panels, soft ambient shadow
- One blue accent for action, selection, focus and progress
- Verdict colors as meaning only, always paired with an icon and a label
- Every result shown with its range, not just a point
- Single sans family with a compact ramp; mono only for machine values
- Left sidebar shell, page title with primary action top right

## Colors

A cool neutral palette with one saturated blue and a three-way verdict set; color is rationed so that when it appears, it means something.

### Primary
- **Ledger Blue** (accent): primary buttons, active nav item, selected tab underline, focus rings and input focus border, links, progress meters, accuracy bars, the checked state of segmented choices and checkboxes. Darkens to **Ledger Blue Deep** (accent-hover) on hover.
- **Blue Wash** (accent-soft): background of the active nav item, info callouts, the empty-state icon tile, the "assumed" pill, dropzone hover, and the AI-answer pane in review.
- **Periwinkle** (accent-tint): the lighter blue in the brand mark and the flow-volume bars on results; a quieter blue for data that is not an action.

### Verdict and status
- **Automate Green** (good on good-soft): "Automate" badges, pass badges, completed run stages, success callouts.
- **Review Amber** (warn on warn-soft): "Automate with review" badges, warning callouts, the spend-confirmation panel.
- **Don't-automate Grey** (quiet on quiet-soft): "Don't automate" badges and the default badge. Deliberately neutral, not red: not automating is a respectable answer.
- **Error Red** (bad on bad-soft): failures, stopped stages, invalid inputs, error callouts and toasts, destructive button text. Never a verdict.

### Neutral
- **Cool Ground** (ground): the app background behind panels.
- **Paper White** (surface): panels, sidebar, buttons, inputs, topbar.
- **Subtle** (subtle): table header rows, panel footers, file cards, dropzone, log blocks, the case pane in review.
- **Hover Grey** (hover): row/nav hover, empty tracks of range, meter and accuracy bars.
- **Hairline** (hairline): every panel border, divider and row rule. **Hairline Strong** (hairline-strong): input and button borders, the zero line on range bars.
- **Ink / Ink 2 / Ink 3**: primary text; secondary text and nav labels; tertiary text for hints, sub-lines, table headers and meta.

### Named Rules
**The Meaning-Only Rule.** Green, amber and grey appear only where they encode a verdict or status. A green that is decorative is a lie on this product.

**The Gentle No Rule.** "Don't automate" is grey, never red. Red is for things that broke.

**The One Blue Rule.** The accent is the only chromatic color outside verdicts and errors. It marks what you can act on and where you are; it is not a fill for large areas.

## Typography

**Body Font:** Geist Variable (with ui-sans-serif, system-ui fallbacks), stylistic sets ss01 and cv11 on.
**Mono Font:** Geist Mono Variable (with ui-monospace, Menlo).

**Character:** One neutral grotesque carries everything from page titles to table meta; hierarchy comes from size steps of 1-3px and weight (400/500/550/600), not from a second display face. Variable weights in between (550, 620, 650) are used for fine emphasis.

### Hierarchy
- **Headline** (600, 22px, 1.25, -0.015em): page titles only, one per page.
- **Answer** (400, 19px, 1.45, max 62ch): the results headline sentence; key figures inside it set at 620 weight, ranges in ink-3. The one place text is larger than the page title's neighbours, because the answer is the product.
- **Title** (600, 15px): panel headings.
- **Body** (400, 14px, 1.5): default text, table cells, inputs.
- **Label** (500, 13px): form labels, buttons at small size, disclosure summaries; panel subtitles at 13px in ink-3.
- **Meta** (550, 12px, ink-3): table and recommendation column headers, fact labels, nav section labels (500). Sentence case.
- **Small** (400, 12.5px, ink-3): hints, sub-lines under table cells, range text.
- **Mono** (12.5px): model names, ids, file names in logs, API keys, run logs (12.5/1.6).

### Named Rules
**The Machine Voice Rule.** Geist Mono is for values the machine produced or consumes verbatim (model names, ids, logs, keys). Never for headings, labels or numbers.

**The Tabular Rule.** Any number in a column or a fact row uses tabular numerals; tables set it on the whole table.

**The Sentence Case Rule.** Headers and labels are sentence case at normal tracking. The system has no uppercase tracked labels.

## Layout

A fixed two-column shell: a 236px white sidebar (sticky, full height) holding brand, Projects, the current project's nav, and a footer with the API-key status dot and version; and a main column whose page content is centred at max 1160px with 32px top, 40px side and 96px bottom padding.

Every page opens with a page head: title (plus a sub-line of meta with icons) on the left, actions right-aligned with the primary action last. Content below is a vertical stack of panels separated by 20px. Inside panels: head 14px 18px, body 18px, footer 12px 18px on the subtle tint. Settings-style forms use a two-column row (280px explanation, flexible controls, 32px gap) divided by hairlines. Spacing steps are 6, 8, 12, 16, 18, 20, 24 and 32px; gaps inside rows are 8-12px, between grid cards 16px.

Recommendations use a single CSS subgrid so every row's columns align with the header (step, verdict, model, accuracy, range, value, toggle). Below 1100px the rows collapse to stacked cards with the range bar spanning full width.

At 900px and below, the sidebar becomes an off-canvas drawer (260px, slides in with the shared ease) opened from a sticky white topbar; page padding drops to 20px 16px; page heads stack; two-column grids, settings rows and the review split collapse to one column. Project sections switch from sidebar nav to an underlined tab bar only at this width.

## Elevation & Depth

A hybrid: depth is mostly tonal (white panels on a grey ground, subtle-tinted heads and footers) with a soft ambient shadow at rest. Shadows are cool (tinted from rgb(16 24 40)), low-opacity and never offset hard. Elevation rises only for things that float above the page.

### Shadow Vocabulary
- **Rest** (shadow-1): panels, secondary buttons. Barely there; it seats the panel on the ground.
- **Raised** (shadow-2): a panel demanding attention in-flow, such as the spend-confirmation panel before a run.
- **Floating** (shadow-3): toasts, the sticky unsaved-changes bar, the mobile drawer.

### Named Rules
**The Hairline First Rule.** Separation comes from a 1px hairline before it comes from shadow. A panel without its border is not a panel.

## Shapes

Gently rounded and consistent: 8px on panels, callouts, file cards, dropzones, toasts and the savebar; 6px on buttons, inputs, nav items, inner tables and lists; full pills on badges, counts and the "assumed" marker. Small tiles holding a single icon (file icon, empty-state icon, confirm icon) are 36-44px squares at 9-12px radius. Bars (range, meter, accuracy, flow) are thin rounded tracks (6-10px tall) on hover grey. Borders are 1px everywhere; the only dashed line is the upload dropzone (1.5px).

## Components

### Buttons
Quiet, compact, tactile.
- **Shape:** gently rounded (6px), 34px tall; small 28px, large 40px. Icon 16px left of label, 7px gap.
- **Default:** white with a strong hairline border and rest shadow; hover tints to subtle; active nudges down 0.5px.
- **Primary:** Ledger Blue fill, white text, a blue-tinted 1px shadow and a faint inner top highlight; hover to Ledger Blue Deep. One per page head.
- **Ghost:** transparent, ink-2 text, hover grey fill. Used for Cancel and toolbar actions.
- **Danger:** default button with Error Red text.
- **Busy / disabled:** 55% opacity; busy swaps the label for a spinning loader icon and a verb ("Creating", "Working").

### Badges (verdicts)
- **Style:** 22px pill, 12px at 550 weight, a 13px line icon then the label, on the soft verdict tint.
- **Verdicts:** Automate (circle-check, green), Automate with review (clipboard-check, amber), Don't automate (ban, grey). Pass/fail use green/red. An outline variant (transparent with hairline) marks neutral tags like "Recommended".

### Panels
- **Corner Style:** 8px.
- **Background:** surface, with subtle-tinted header/footer bands where needed.
- **Shadow Strategy:** Rest; Raised only for the spend confirmation.
- **Border:** 1px hairline.
- **Internal Padding:** 18px; heads 14px 18px with a 15px title and a 13px ink-3 description.

### Inputs / Fields
- **Style:** white, 1px strong hairline, 6px radius, 34px tall, faint inset shadow. Selects use a custom up/down chevron. Prefix/suffix affixes sit in subtle-tinted cells sharing the border.
- **Focus:** border turns Ledger Blue with a 3px accent-ring halo (32% blue).
- **Error / Disabled:** invalid border in Error Red with a 12.5px red message below; field hints 12.5px ink-3.
- **Choice cards:** segmented two-up options with a hairline border; checked turns border blue and fill Blue Wash.

### Navigation
- **Sidebar:** 7px 10px items, 500 weight, ink-2, 16px line icons; hover grey; current page Blue Wash with blue text. Section label is the project name in 12px ink-3.
- **Tabs (mobile only):** 40px items, ink-3, selected blue with a 2px rounded underline inset 8px.

### Tables
- **Header:** subtle band, 12px/550 ink-3 sentence-case labels, 9px 14px.
- **Rows:** 11px 14px, hairline rules, last rule dropped; numeric columns right-aligned and tabular; clickable rows tint subtle on hover. Secondary info sits as a 12.5px ink-3 sub-line under the primary value.

### Callouts
Icon plus text in a tinted box (8px radius, 12px 14px): info on Blue Wash, warn on amber, error on red, success on green, each with a slightly deeper border and darkened text of the same hue.

### Range Bar (signature)
The system's core honesty device. A 10px rounded grey track with a 1px zero line; the plausible range is a soft band in the verdict's tint and the point estimate a 12px dot in the verdict color, ringed in white. Axis labels above, and below it the point in bold followed by "low to high" in ink-3. Every money and hours figure that has a range shows it, either here or as "($297 to $3,871)" in ink-3 beside the figure.

### Floating feedback
Toasts and the unsaved-changes savebar are inverse surfaces: ink background, white text, 8px radius, Floating shadow, entering with a short rise (240-280ms, ease cubic-bezier(0.16, 1, 0.3, 1)). Error toasts are deep red.

### Empty states
Centred in a panel: a 44px Blue Wash tile with a 20px icon, a title, a 46ch ink-3 explanation, then the primary action and an optional secondary one.

## Do's and Don'ts

### Do:
- **Do** put every money and hours result with its range, the point in ink and the range in ink-3.
- **Do** pair every verdict color with its icon and its words; color alone never carries the verdict.
- **Do** keep one primary (blue) button per page head, at the right end of the actions.
- **Do** set model names, ids and logs in Geist Mono at 12.5px, and everything else in Geist.
- **Do** separate surfaces with 1px hairlines (hairline) and seat panels with the Rest shadow only.
- **Do** use Lucide line icons at 16px (14px small, 20px large), stroke 1.75.
- **Do** honour prefers-reduced-motion; motion is limited to short state transitions (100-240ms) and toast/drawer entrances.

### Don't:
- **Don't** use green, amber or grey for anything that is not a verdict or status.
- **Don't** make "Don't automate" red or alarming; red is reserved for errors and failures.
- **Don't** introduce a second accent hue or fill large areas with Ledger Blue.
- **Don't** use mono for headings, labels or figures.
- **Don't** add uppercase tracked labels or eyebrows above titles; headers are sentence case.
- **Don't** use hard offset shadows, gradients or decorative backgrounds; the only gradient is the loading skeleton shimmer.
- **Don't** show a single number where a range exists.
