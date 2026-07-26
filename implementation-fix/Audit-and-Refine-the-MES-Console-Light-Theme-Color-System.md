## Prompt Audit and Refine the MES Console Light Theme Color System

Act as a **senior product designer, design-system architect, frontend engineer, and color accessibility specialist**.

The MES Console currently has both dark mode and light mode. The dark mode is visually strong, cohesive, and readable. The light mode, however, has several serious color and consistency problems.

Your task is not to apply a few isolated color fixes. You must perform a **systematic audit of the entire MES Console color system**, identify the root causes, and refactor the theme architecture so that light mode and dark mode are both consistent, accessible, reusable, and maintainable.

Use the provided screenshots as visual references.

### Main visual problems already observed

In light mode:

* The selected item in the left sidebar uses yellow text on a pale background, creating very poor contrast.
* The active navigation state does not feel visually anchored.
* Status badges inside tables use dark backgrounds with even darker text, making them almost unreadable.
* Some icons, borders, placeholders, muted labels, and secondary text are too faint.
* Some components appear to use colors that work in dark mode but were reused directly in light mode without proper semantic adaptation.
* Similar UI elements may use different colors in different parts of the application instead of sharing the same component or design token.
* The page does not appear to follow one consistent color hierarchy.

Do not simply darken every light color. Redesign the light theme using a clear and deliberate color mindset.

---

# 1. Color mindset

Apply the following design philosophy across the whole MES Console.

## 1.1 Semantic colors, not page-specific colors

Every color must represent a semantic purpose rather than being assigned based on a particular page.

Use semantic concepts such as:

```text
background
foreground
surface
surface-elevated
surface-subtle
border
border-strong
muted
muted-foreground
primary
primary-foreground
secondary
secondary-foreground
accent
accent-foreground
selected
selected-foreground
hover
focus-ring
success
success-foreground
warning
warning-foreground
danger
danger-foreground
info
info-foreground
```

Avoid introducing page-specific classes such as:

```text
mbom-yellow-text
work-order-dark-badge
sidebar-special-orange
```

The same semantic state should look consistent across every page.

---

## 1.2 Light mode must not imitate dark mode

Treat light mode as a separate visual environment, not as an inverted dark theme.

For light mode:

* Main backgrounds should use neutral off-white or very light cool gray rather than pure white everywhere.
* Surfaces should be separated through subtle background elevation, borders, and shadows.
* Primary text should be very dark neutral blue-gray, not pure black.
* Secondary text must remain readable and should not become overly pale.
* Borders must be visible enough to establish structure without becoming visually noisy.
* Selected states should use a tinted background and a strong readable foreground.
* Status colors should use light tinted backgrounds with dark semantic foreground colors.
* Do not use bright yellow as body text on white or pale backgrounds.
* Yellow or amber may be used for an icon, indicator, border, or warning accent, but the associated text must remain dark enough to pass accessibility contrast.

For dark mode:

* Preserve the current strong visual direction as much as possible.
* Avoid regressions while refactoring shared tokens.
* Ensure dark mode uses equivalent semantic roles, not hardcoded dark values inside components.

---

## 1.3 Preserve the brand character

The current visual identity appears to use:

* deep navy
* orange
* cyan or light blue
* yellow as a limited accent

Keep this identity, but assign each color a disciplined role.

Recommended roles:

```text
Deep navy:
- dark mode surfaces
- high-emphasis text
- selected navigation foreground in light mode where appropriate

Orange:
- primary actions
- key CTA buttons
- strong active indicators
- important focus points

Cyan or light blue:
- links
- information
- secondary active indicators
- technical or production-related highlights

Yellow or amber:
- warning states
- small icons
- attention indicators
- never low-contrast body text
```

Do not allow orange, cyan, or yellow to be used inconsistently as generic decoration.

---

# 2. Accessibility requirements

Audit all foreground and background combinations.

Target at least:

* WCAG AA contrast for normal text: `4.5:1`
* WCAG AA contrast for large text: `3:1`
* Non-text UI components and meaningful graphical objects: `3:1`
* Focus indicators must be clearly visible in both themes

Explicitly verify:

* selected sidebar text
* non-selected sidebar text
* section headings
* disabled navigation items
* input placeholders
* table headers
* table body text
* links
* badges
* button labels
* icon buttons
* focus rings
* hover states
* disabled states
* dropdown menu items
* pagination
* empty states
* tooltips
* dialogs
* alerts
* form validation messages

Do not accept a combination only because it looks attractive. Validate its readability.

---

# 3. Inspect the existing styling architecture first

Before changing UI colors, inspect the project and answer these questions with evidence from the codebase.

## 3.1 Confirm whether Tailwind CSS is actually being used

Check:

* `package.json`
* `tailwind.config.*`
* `postcss.config.*`
* global CSS files
* component class names
* build configuration
* theme plugins
* CSS variable usage
* dark mode configuration

Determine:

* whether Tailwind is fully configured
* whether dark mode uses `class`, media query, or another mechanism
* whether arbitrary values such as `bg-[#123456]` are overused
* whether inline styles are being used for colors
* whether duplicated Tailwind color utilities appear across components
* whether custom CSS competes with Tailwind utilities
* whether theme values are centralized or scattered

Provide a short architecture diagnosis before implementing changes.

---

## 3.2 Inspect global color tokens

Search for color definitions in:

```text
globals.css
app.css
index.css
theme.css
tailwind.config.*
CSS modules
styled components
inline styles
component files
```

Identify:

* repeated hardcoded hex values
* repeated RGB, HSL, or OKLCH values
* duplicate CSS variables
* variables with unclear names
* colors defined directly inside page components
* dark-mode overrides that are missing light-mode equivalents
* tokens that do not represent semantic meaning

Refactor repeated values into reusable global semantic tokens.

Prefer a token model similar to:

```css
:root {
  --background: ...;
  --foreground: ...;

  --surface: ...;
  --surface-subtle: ...;
  --surface-elevated: ...;

  --border: ...;
  --border-strong: ...;

  --primary: ...;
  --primary-foreground: ...;

  --secondary: ...;
  --secondary-foreground: ...;

  --muted: ...;
  --muted-foreground: ...;

  --accent: ...;
  --accent-foreground: ...;

  --selected: ...;
  --selected-foreground: ...;

  --success: ...;
  --success-foreground: ...;

  --warning: ...;
  --warning-foreground: ...;

  --danger: ...;
  --danger-foreground: ...;

  --info: ...;
  --info-foreground: ...;

  --ring: ...;
}

.dark {
  /* equivalent semantic tokens for dark mode */
}
```

Use the project’s existing color format if it already follows a coherent approach. Do not migrate formats unnecessarily.

---

# 4. Audit shadcn/ui implementation

Determine whether the project is genuinely using shadcn/ui components or merely copying some visual patterns.

Inspect shared components such as:

```text
Button
Badge
Input
Select
DropdownMenu
Card
Table
Tabs
Dialog
Tooltip
Popover
Sidebar
NavigationMenu
Alert
Checkbox
Switch
Textarea
Label
Separator
Skeleton
```

For each relevant component, verify:

* it uses semantic theme tokens
* it supports both light and dark mode
* it does not contain page-specific hardcoded colors
* variants are controlled centrally
* the same variant looks the same everywhere
* page code does not override the component with arbitrary colors
* common interaction states are included:

  * default
  * hover
  * active
  * selected
  * focus-visible
  * disabled
  * loading
  * destructive

If the application has several visually identical badges implemented separately, consolidate them into one shared component.

For example, status styles should be centrally mapped:

```ts
type StatusTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";
```

Then use one shared API:

```tsx
<StatusBadge tone="success">Released</StatusBadge>
```

Do not allow each page to invent its own `Released`, `Pending`, `Failed`, or `Approved` colors.

---

# 5. Sidebar audit

The left navigation is one of the highest-priority areas.

Review all sidebar states:

```text
default
hover
selected
focused
disabled
collapsed
nested
section heading
icon
label
badge
```

## Light mode selected state

The current yellow selected text is unreadable.

Replace it with a state that has:

* a clearly visible tinted background
* a dark, high-contrast foreground
* a controlled brand accent
* an active indicator such as a left border, inset ring, or icon treatment
* readable icon and text colors

A preferred direction is:

```text
selected background:
soft orange or warm neutral tint

selected foreground:
deep navy or dark brown-neutral

active indicator:
brand orange

selected icon:
orange or cyan, provided contrast remains sufficient
```

Do not use bright yellow as the selected label color.

The selected state must remain obvious even for users with reduced color perception. Do not rely on text color alone.

## Dark mode sidebar

Preserve the current dark mode appearance unless a change is necessary for token consistency or accessibility.

---

# 6. Status badge system

Create or refine a centralized badge system.

In light mode, use a light tinted background with a dark foreground.

Suggested semantic behavior:

```text
Success:
light green background
dark green text
subtle green border

Warning:
light amber background
dark amber or brown text
subtle amber border

Danger:
light red background
dark red text
subtle red border

Info:
light blue or cyan background
dark blue text
subtle blue border

Neutral:
light gray or blue-gray background
dark neutral text
subtle neutral border
```

In dark mode, use deeper tinted surfaces with lighter readable foregrounds.

Badges must not have:

* dark gray text on dark navy backgrounds
* low-opacity text that becomes unreadable
* identical styling for semantically different states
* inconsistent border radii or padding across pages

Check every status currently used in the MES system, including possible states such as:

```text
Draft
Released
Approved
Rejected
Pending
In Progress
Completed
Cancelled
Blocked
Pass
Fail
Active
Inactive
```

Map all states to a controlled semantic tone.

---

# 7. Full-page visual audit

Do not limit the work to the sidebar and badges.

Review the complete MES Console, including:

* application header
* language selector
* theme toggle
* user account control
* logout button
* sidebar
* section headings
* page title card
* information cards
* action toolbar
* text inputs
* select controls
* dropdown menus
* table header
* table rows
* table hover state
* links
* action buttons
* icon buttons
* empty states
* loading states
* error states
* dialogs
* drawers
* tooltips
* toast notifications
* forms
* validation messages
* pagination
* filters
* date pickers
* work order status indicators
* production states
* QC result states
* disabled controls

For every element, define:

```text
background
foreground
border
hover
active
focus-visible
disabled
dark-mode equivalent
```

---

# 8. Visual hierarchy for light mode

Establish a predictable hierarchy.

Recommended hierarchy:

```text
Application background:
very light cool neutral

Sidebar:
slightly different from the page background

Primary surface:
white or near-white

Secondary surface:
subtle blue-gray tint

Elevated surface:
white with border and restrained shadow

Primary text:
deep navy or dark blue-gray

Secondary text:
medium blue-gray

Muted text:
still readable; do not reduce opacity excessively

Border:
visible cool gray-blue

Strong border:
used only for selected, focused, or grouped content
```

The page should feel clean and industrial, not washed out.

Avoid large areas where:

* every surface is pure white
* borders disappear
* muted text becomes nearly invisible
* too many unrelated accent colors compete
* shadows are used instead of proper hierarchy

---

# 9. Implementation constraints

Follow these rules:

* Do not break dark mode.
* Do not redesign the layout unless required to fix a color-state issue.
* Do not introduce another styling library.
* Do not replace Tailwind or shadcn/ui if they are already correctly integrated.
* Do not scatter hardcoded color values throughout JSX.
* Do not use arbitrary Tailwind color values unless there is a documented reason.
* Prefer semantic utility classes backed by global CSS variables.
* Reuse shared components.
* Preserve current responsive behavior.
* Preserve existing business logic.
* Preserve localization behavior.
* Preserve keyboard navigation.
* Preserve existing component APIs where practical.
* Keep changes focused on design-system consistency and theme quality.

---

# 10. Required workflow

Follow this sequence.

## Phase 1: Audit

Produce a concise report covering:

1. Current Tailwind configuration
2. Current dark-mode mechanism
3. Current global theme token structure
4. Hardcoded or duplicated colors
5. shadcn/ui components currently in use
6. Components that bypass shared theme behavior
7. Accessibility issues
8. Inconsistent status and navigation styles
9. Areas at risk of dark-mode regression

Do not modify code before completing this audit.

## Phase 2: Define the color system

Create a proposed semantic token table containing:

```text
Token name
Purpose
Light value
Dark value
Contrast notes
Used by
```

Avoid changing the successful dark-theme identity unnecessarily.

## Phase 3: Refactor shared foundations

Update:

* global CSS variables
* Tailwind theme bindings
* shared shadcn/ui components
* status badge component
* sidebar navigation component
* common table styles
* common form styles
* focus-ring behavior

## Phase 4: Apply across all MES pages

Search the entire source tree and replace local color overrides with semantic shared styles.

Do not fix only the current MBOM page.

## Phase 5: Validate

Validate at minimum:

* MBOM page
* Items & Revisions
* Routing
* Production Version
* Work Orders
* Employees
* Shifts
* Work Calendar
* Work Centers
* Equipment
* Production Standards
* Reason Codes
* Skills

Test both:

```text
light mode
dark mode
```

Also test:

```text
hover
selected
focus-visible
disabled
loading
empty
error
success
warning
danger
```

---

# 11. Expected deliverables

At the end, provide:

1. A summary of the root causes
2. A list of files changed
3. The final semantic color-token structure
4. Components consolidated or refactored
5. Hardcoded colors removed
6. Accessibility improvements
7. Screens or routes verified
8. Any remaining inconsistencies
9. Any intentional exceptions and their rationale
10. Confirmation that dark mode was regression-tested

Also provide a short before-and-after explanation for:

* selected sidebar item
* table status badges
* input controls
* table hierarchy
* muted text
* border visibility
* focus states

---

# 12. Definition of done

The work is complete only when:

* Selected sidebar labels are clearly readable in light mode.
* Status badges are readable in both themes.
* Common components use shared semantic tokens.
* The same component variant has the same colors everywhere.
* Tailwind and global CSS tokens have clear responsibilities.
* shadcn/ui components correctly support both light and dark mode.
* Arbitrary page-level color overrides have been removed or justified.
* Light mode has a coherent hierarchy instead of looking like an incomplete version of dark mode.
* Dark mode retains its current quality.
* All important text and controls meet reasonable WCAG AA contrast.
* The entire MES Console has been reviewed, not only the page shown in the screenshots.

Think carefully before editing. Treat this as a design-system correction, not a cosmetic patch.
