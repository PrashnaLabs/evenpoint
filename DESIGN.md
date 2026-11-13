---
name: Evenpoint
description: A local analytics app that turns a team's own export into a defensible answer about what to automate with AI.
colors:
  accent: "#2563eb"
  accent-hover: "#1d4ed8"
  accent-soft: "#eff4ff"
  ground: "#f8fafc"
  surface: "#ffffff"
  subtle: "#f1f5f9"
  track: "#eef2f7"
  hairline: "#e2e8f0"
  hairline-strong: "#cbd5e1"
  ink: "#0f172a"
  ink-2: "#334155"
  ink-3: "#64748b"
  good: "#047857"
  good-soft: "#ecfdf5"
  warn: "#b45309"
  warn-soft: "#fffbeb"
  quiet: "#475569"
  quiet-soft: "#f1f5f9"
  bad: "#dc2626"
  bad-soft: "#fef2f2"
typography:
  answer:
    fontFamily: "Plus Jakarta Sans Variable, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "24px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "Plus Jakarta Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Plus Jakarta Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 650
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Plus Jakarta Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Plus Jakarta Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
  mono:
    fontFamily: "Geist Mono Variable, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "13px"
    fontWeight: 400
rounded:
  sm: "8px"
  md: "12px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  page-top: "40px"
  section: "64px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "40px"
  button-secondary-hover:
    backgroundColor: "{colors.subtle}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-3}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "40px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "42px"
  tabs-track:
    backgroundColor: "{colors.track}"
    rounded: "{rounded.pill}"
    padding: "4px"
  tab:
    backgroundColor: "transparent"
    textColor: "{colors.ink-3}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "36px"
  tab-selected:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
  badge-automate:
    backgroundColor: "{colors.good-soft}"
    textColor: "{colors.good}"
    rounded: "{rounded.pill}"
    padding: "0 10px"
    height: "26px"
  badge-review:
    backgroundColor: "{colors.warn-soft}"
    textColor: "{colors.warn}"
    rounded: "{rounded.pill}"
    padding: "0 10px"
    height: "26px"
  badge-dont-automate:
    backgroundColor: "{colors.quiet-soft}"
    textColor: "{colors.quiet}"
    rounded: "{rounded.pill}"
    padding: "0 10px"
    height: "26px"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "20px 24px 24px"
  project-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "24px"
  toast:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    padding: "12px 16px"
---

# Design System: Evenpoint

## Overview

**Creative North Star: "The Answer Sheet"**

Evenpoint is a light, quiet, Swiss-minimal tool: a cool slate ground, white cards held by hairlines, one blue for action, and verdict colours that appear only where they carry meaning. Every screen leads with its answer in plain sentence form; the evidence behind it (per-model tables, the measured flow, costs, the run log) waits one click away under disclosure rows that each carry a one-line summary of what is inside.

Density is calm, not sparse. A centred 1080px page under a slim sticky top bar, a big title on the left with a single primary action on the right, then the answer and its supporting rows. Generous vertical rhythm (24px between blocks, 64px before the footer) does the separating; borders appear only where two things genuinely need dividing. Depth is flat; shadows exist only for things that float (toasts, the save bar) or respond (a lifted card on hover, the selected tab).

This system replaces the previous Geist / indigo / left-sidebar world entirely.

**Key Characteristics:**
- Slate neutrals with a single blue accent (#2563eb); green, amber and slate-grey reserved for the three verdicts.
- Plus Jakarta Sans throughout, Geist Mono only for ids, model names, file paths and logs.
- 12px cards, 8px controls, fully rounded pills for tabs, badges, chips and toasts.
- Flat surfaces separated by 1px hairlines; no decorative shadows.
- Answer first: one sentence, one row per step, details collapsed.
- One next action per screen.

## Colors

A cool slate neutral ramp carries almost everything; one saturated blue marks action and selection, and three muted semantic pairs (tint background + deep text) speak the verdicts.

### Primary
- **Decision Blue** (accent): primary buttons, links, focus outline, the run progress bar, the current step dot, selected chips, the tab count bubble. Hover deepens to **Pressed Blue** (accent-hover). **Blue Wash** (accent-soft) tints icon tiles, hovered drop zones and sample rows, the "AI answer" pane in review, and info callouts.

### Neutral
- **Morning Slate** (ground): the page ground and the translucent top bar (85% opacity with a 10px backdrop blur).
- **Paper White** (surface): cards, panels, inputs, the selected tab.
- **Mist** (subtle): button hover, input affixes, file cards, log blocks, the case pane in review.
- **Tab Track** (track): the recessed pill track behind segmented tabs and skeleton shimmer.
- **Hairline** (hairline): every separating border: card edges, row dividers, panel footers, the top bar's underline.
- **Strong Hairline** (hairline-strong): input borders, dashed drop zones and example cards, card border on hover, range zero tick.
- **Ink** (ink): headings, body, values. **Ink 2** (ink-2): secondary prose inside details. **Ink 3** (ink-3): meta lines, hints, table headers, inactive nav and tabs.

### Semantic (verdicts and status)
- **Automate**: good on good-soft. Also pass marks and success callouts.
- **Automate with review**: warn on warn-soft. Also the cost-confirm panel and warning callouts.
- **Don't automate**: quiet on quiet-soft. Deliberately grey, not red: declining to automate is a valid answer, not an error.
- **Error / fail**: bad on bad-soft. Errors, failed grades, destructive buttons, the cancelled-run bar.

### Named Rules
**The One Blue Rule.** Blue means "you can act here" or "this is selected". It never decorates, never marks a verdict, and appears on at most one filled button per screen.

**The Meaning-Only Colour Rule.** Green, amber, grey and red appear only when they encode a verdict or a status. A neutral fact is ink on paper.

## Typography

**Display Font:** Plus Jakarta Sans Variable (with ui-sans-serif, system-ui)
**Body Font:** Plus Jakarta Sans Variable
**Label/Mono Font:** Geist Mono Variable (with ui-monospace, Menlo)

**Character:** A friendly geometric grotesk with tight negative tracking at size and intermediate variable weights (550, 620, 650) between the usual stops; the mono is a quiet technical aside, never a display voice.

### Hierarchy
- **Answer** (400 with 620 bold figures, 24px, 1.45, -0.015em; 19px under 900px): the result sentence that opens Results. Max 46ch. Key figures are bolded inline rather than broken out into stat tiles.
- **Headline** (700, 28px, 1.2, -0.025em; 24px under 760px): the page title, one per screen.
- **Title** (650, 16px, -0.01em): panel and section headings. Project names on cards run slightly larger (650, 17px); figures at the end of a step row run 600 at 19px; the answer on a project card runs 700 at 26px, -0.03em.
- **Body** (400, 15px, 1.6): everything else. Rows and secondary text step down to 14px.
- **Label** (400, 13px, ink-3): meta lines, hints, disclosure summaries, table headers (600, 12.5px). Sentence case, never uppercase.
- **Mono** (13px; 12.5px in rows and logs): model names, file names, ids, keyboard hints.

### Named Rules
**The Sentence Answer Rule.** The answer is a sentence with bold figures, not a dashboard of numbers. Figures always use tabular numerals.

**The Mono-For-Machines Rule.** Geist Mono is only for strings a machine produced (model ids, paths, column names, logs). Never for labels or headings.

## Layout

A single centred column: content max 1080px with 24px side padding (16px under 760px), 40px top and 120px bottom page padding. The sticky top bar is 60px tall and aligns its content to the same column edges.

Every screen opens with the page head: title and a one-line meta row on the left, actions bottom-aligned on the right (stacked under 760px). Project screens then show the segmented tabs (32px below), then the tab content as a stack with 24px between blocks. The start flow narrows to 760px with a numbered step indicator above its title.

Grids: project and example cards use `auto-fill, minmax(320px, 1fr)` at 16px/12px gaps; two- and three-column grids use 20px gaps and collapse to one column under 760px. Settings use a 250px label column beside the control column (36px gap), collapsing under 760px. Step rows collapse their four columns (name, range, figures, toggle) into a two-by-two grid under 900px.

### Named Rules
**The One Next Action Rule.** Each screen has exactly one filled blue button, placed top-right in the page head (or at the end of a confirm panel). Everything else is secondary, ghost, or a link.

**The Answer-First Rule.** What the user came for sits directly under the tabs: the answer sentence and step rows on Results, the answer on each project card. Supporting evidence comes after, collapsed.

## Elevation & Depth

Flat by default. Surfaces separate from the slate ground by colour and a 1px hairline, not by shadow. Shadows are reserved for elements that float above the page or respond to the pointer.

### Shadow Vocabulary
- **Lift** (`box-shadow: 0 8px 24px -8px rgb(15 23 42 / 0.12)`): a project card on hover, paired with a 2px rise and a stronger hairline.
- **Float** (`box-shadow: 0 20px 48px -16px rgb(15 23 42 / 0.25)`): toasts and the sticky unsaved-changes bar, both ink-filled.
- **Selected tab** (`box-shadow: 0 1px 3px rgb(15 23 42 / 0.1)`): the white selected pill inside the tab track.

### Named Rules
**The Flat-At-Rest Rule.** Nothing in the page flow carries a shadow at rest. A shadow means the element floats, is hovered, or is the selected tab.

## Shapes

Three radii: 12px for containers (panels, cards, step lists, drop zones, callout-sized blocks), 8px for controls (buttons, inputs, selects, inner bordered tables, callouts), and fully rounded pills for tabs, badges, chips, the nav links and toasts. Large buttons step to 10px. Borders are 1px solid hairlines; dashed 1.5px strong hairlines mark "drop something here" and "try an example" affordances only. Icon tiles are rounded squares (10-14px radius) in accent-soft with an accent glyph.

## Components

### Buttons
Quiet, compact, and solid.
- **Shape:** gently rounded (8px), 40px tall; small 34px, large 48px at 10px radius.
- **Primary:** Decision Blue fill, white 600 14px label, optional leading 16px Lucide icon.
- **Secondary (default):** white fill, hairline border, ink label; hover fills with Mist.
- **Ghost:** transparent, ink-3 label; hover fills with Mist and darkens to ink. Used for Report, Stop, Back.
- **Danger:** secondary shape with red label; fills red only inside the danger zone on hover.
- **States:** press scales to 0.98; disabled and busy drop to 50% opacity; focus is the global 2px blue outline at 2px offset.

### Chips
- **Style:** 32px pill, strong hairline border, white fill, ink-2 13px label, wrapping a visually hidden checkbox.
- **State:** selected chips take a blue border and Blue Wash fill with a blue icon. Used to pick columns and models.

### Badges (verdicts)
- **Style:** 26px pill, 12.5px 600 label, leading 13px Lucide icon at stroke 2.2, semantic tint background with deep semantic text: CircleCheck "Automate", ClipboardCheck "Automate with review", Ban "Don't automate". Outline variant is transparent with an inset hairline.

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** Paper White on Morning Slate.
- **Shadow Strategy:** none at rest (see Elevation).
- **Border:** 1px hairline.
- **Internal Padding:** panels 20px 24px 24px with a head row (title + 14px ink-3 description) and an optional hairline-topped footer of right-aligned actions; project cards 24px, min-height 168px, name and meta above the answer figure.

### Inputs / Fields
- **Style:** 42px, strong hairline border, white fill, 8px radius, 15px body text, placeholder #94a3b8. Selects use a Lucide chevron as background image. Prefix/suffix affixes join flush in Mist.
- **Focus:** border turns blue with a 4px blue ring at 28% opacity.
- **Error / Disabled:** invalid fields take a red border with 13px red helper text below.
- **Labels:** 14px 600 ink above the control, 8px gap, 13px ink-3 hint beneath.

### Navigation
- **Top bar:** 60px, translucent Morning Slate with blur and a hairline underline. Left: ink brand tile (28px, 8px radius) plus wordmark, then pill nav links (14px 550, ink-3; hover and current fill with Mist and turn ink). Right: key status (8px dot, emerald when connected, amber when missing) and the small primary "New analysis" button. Under 760px the nav links and key-status text hide.
- **Segmented tabs:** a pill track (4px inset) holding 36px pill tabs; the selected tab is white with ink text and the selected-tab shadow. Exactly three on a project: Results, Check AI answers, Settings. They stretch to full width on mobile.

### Step Rows (signature)
The core of Results: one bordered 12px list, one row per workflow step, divided by hairlines. Each row: step name + verdict badge, a one-line "why" with the model name in mono; an 8px range bar showing the likely savings span as a soft verdict-tinted band with a solid 12px point and a zero tick; the monthly hours figure right-aligned (19px) with dollars beneath (13px ink-3); a chevron toggle that rotates 180deg to expand inline details. Untested steps collapse to a single-column row.

### Disclosure Rows (signature)
Evidence lives in disclosure rows under a small "Details" heading: a full-width summary with a rotating 14px chevron, a 550 ink title, and a right-aligned 13px ink-3 one-line summary of what is inside (hidden under 900px). Rows are separated by bottom hairlines, and bodies indent 22px.

### Run Progress (signature)
While a run is live it replaces the Results content in place (there is no Run tab): a panel with a 20px title, a "Step n of 7" line, an 8px pill progress bar in blue (red on error, strong hairline when cancelled), a reassurance note, and the log collapsed in a disclosure. A cost confirmation appears above it as an amber panel (warn-soft fill, amber border) with Stop and one primary Continue.

### Feedback
- **Callouts:** 8px radius tinted blocks with a leading icon: info (Blue Wash), warn, error, success, each with a deep tinted text colour.
- **Toasts:** ink-filled pills centred at the bottom, 14px 500, Float shadow; errors in deep red.
- **Empty states:** centred, a 52px Blue Wash icon tile, title, 46ch ink-3 explanation, one action.

### Motion
Short and settling: one 320ms fade-and-rise (6px) when content first lands, 180ms colour transitions on controls, a 2px hover lift on cards, chevrons rotating on the expo-out ease `cubic-bezier(0.16, 1, 0.3, 1)`. Live views never re-animate on redraw. Reduced motion collapses all of it.

## Do's and Don'ts

### Do:
- **Do** lead every screen with its answer: a sentence with bold tabular figures, or the answer figure on a project card.
- **Do** keep exactly one filled blue button per screen, top-right in the page head.
- **Do** collapse evidence under disclosure rows that each show a one-line summary of their contents.
- **Do** show live run progress in place of Results; never add a Run tab.
- **Do** keep projects to three tabs: Results, Check AI answers, Settings.
- **Do** use the verdict pairs (good, warn, quiet on their soft tints) only for verdicts and status, with their Lucide icon and plain-language label.
- **Do** use Lucide line icons at 16px, stroke 1.75 (14px small, 22px large).
- **Do** separate with hairlines (#e2e8f0) and whitespace; use 12px for containers, 8px for controls, pills for tabs, badges and chips.
- **Do** put model names, file names and ids in Geist Mono.

### Don't:
- **Don't** add shadows to elements at rest in the page flow; shadows are for hover, the selected tab, and floating layers.
- **Don't** introduce a second accent hue or use blue for anything that is not an action or a selection.
- **Don't** render "Don't automate" in red; it is a grey verdict, not an error.
- **Don't** set labels in uppercase or tracked-out small caps; labels are sentence case.
- **Don't** break the answer into stat tiles or hero metrics.
- **Don't** bring back the left sidebar, Geist as the UI face, or the #3451d1 indigo; that world is retired.
- **Don't** treat the static HTML report (evenpoint/report/template.html.j2) as part of this system; it still follows its own styling and is a known divergence.
