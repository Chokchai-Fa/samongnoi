---
name: design-system
description: Build UI that is easy to use and modern, and work on the frontend design system in apps/web — UX principles, modern visual style, a UX review checklist, design tokens (colors, radius, fonts, dark mode), shadcn/ui components and variants, and new shared/feature UI that must follow the token + primitive rules. Use whenever a change touches apps/web/src/styles/globals.css, apps/web/src/components/**, apps/web/src/routes/**, apps/web/src/features/**, or creates new UI.
---

# Design system (Tailwind v4 + shadcn/ui)

Read the "Design system" section of `CLAUDE.md` first — it defines the three layers
(tokens → primitives → composed) and the rules this skill enforces.

Key files:
- `apps/web/src/styles/globals.css` — tokens (`:root`, `.dark`, `@theme inline`)
- `apps/web/components.json` — shadcn config (aliases, style, icon library)
- `apps/web/src/components/ui/*` — primitives (shadcn source, owned by us)
- `apps/web/src/components/*` — shared composed components
- `apps/web/src/lib/utils.ts` — `cn()`

## The bar: easy to use, modern

Every screen must be **easy to use** (a first-time user finishes the main task without help) and
**look modern** (calm, spacious, consistent, fast). These guidelines apply to every UI change;
the **UX review checklist** at the end is required before a UI PR is done.

### UX principles — easy to use

**Clarity first**
- **One primary action per screen.** Exactly one `variant="default"` button per view; everything
  else is `secondary`, `outline`, or `ghost`. The primary action is visible without scrolling
  (sticky at the bottom on mobile if the content is long).
- **Say what it is in plain words.** Headings name the thing ("Your threads"), buttons start with
  a verb and name the result ("Save link", "Ask AI" — not "Submit", "OK"). Sentence case.
- **Fewest steps.** The main task takes ≤ 3 taps from Home. Prefer smart defaults over questions;
  ask only for what you can't infer (e.g. pasting a URL is enough — the title comes later).
- **Progressive disclosure.** Show the common path; tuck advanced options behind "More options"
  or a `⋯` menu. Don't show controls that do nothing in the current state.
- **Recognition over recall.** Show recent items, suggestions, and examples (placeholder text,
  suggested questions) instead of expecting users to know what to type.

**Feedback — the user always knows what's happening**
- React to every tap **within 100 ms**: pressed state, button spinner, or optimistic update.
- Loading: **skeletons shaped like the content** (not a full-page spinner) for anything > 300 ms.
  Long work (AI summary) shows **progress in words** ("Reading the page…", "Summarizing…").
- Success is visible where the user is looking (the item appears in the list) — use a toast only
  for things that happen out of view, and keep it short ("Link saved").
- **Optimistic UI** for safe actions (send message, rename): update instantly, roll back with a
  toast if the server fails.

**Forgiving**
- Prefer **undo** (toast with "Undo", ~5 s) over "Are you sure?" dialogs. Confirm dialogs only for
  destructive actions that can't be undone, and name the consequence ("Delete thread and its
  chat?" + button "Delete thread", destructive variant).
- Never lose user input: keep drafts (e.g. chat input) across navigation; disable submit
  instead of clearing on error.
- Validate inline, as the user leaves a field or submits — not on every keystroke while typing.

**Errors that help**
- Say what happened and what to do next, in human words: "Couldn't read this page. Check the
  link or paste the text instead." — never raw codes or stack traces. Offer the fix as a button
  (Retry, Paste text instead).
- Errors appear next to the thing that failed (field, card, message), not only in a toast.

**Empty states are onboarding**
- Every list has an empty state: a simple icon, one sentence explaining the value, and the
  primary action ("No threads yet — save your first link to get an AI summary." + "Save a link").

**Consistency**
- Same thing, same place, same look: page header layout, action placement (primary right on
  desktop, full-width bottom on mobile), icon meanings, wording. Reuse composed components
  (`PageHeader`, `EmptyState`, skeletons) instead of re-styling per screen.

### Modern visual style

**Layout & spacing**
- **4 px grid.** Use the Tailwind scale only; typical rhythm: `gap-2` inside controls,
  `gap-4` between related items, `gap-6`/`gap-8` between sections, `py-6 md:py-10` page padding.
- **Generous whitespace** over borders: separate groups with space first, then a subtle `border`
  or `bg-muted` only when needed. Avoid boxes inside boxes.
- **Readable widths:** text blocks `max-w-prose` (~65 characters); forms `max-w-xl`; app
  content `max-w-6xl`.
- Align to a clear left edge; avoid centered body text except in empty states and heroes.

**Typography**
- Inter (variable) via `--font-sans`. Use a small scale and stick to it:
  page title `text-2xl md:text-3xl font-semibold tracking-tight`, section `text-lg font-semibold`,
  body `text-base`, secondary `text-sm text-muted-foreground`, meta `text-xs text-muted-foreground`.
- At most **two weights** on a screen (regular + semibold). Hierarchy comes from size, weight,
  and color — not from many colors or ALL CAPS.
- Line height comfortable for reading (`leading-relaxed` for long text, e.g. AI answers).

**Color & surfaces**
- **Neutral base + one accent** (`primary`). Color carries meaning (primary action, success,
  destructive), never decoration. Status always pairs color with an icon or text.
- Surfaces: `bg-background` page, `bg-card` raised content, `bg-muted` for subtle grouping.
  Soft depth only: `shadow-xs`/`shadow-sm` at most; borders are `border-border` hairlines.
- Radius from tokens only (`rounded-md` controls, `rounded-lg`/`rounded-xl` cards) — consistent
  everywhere.
- Dark mode is designed, not inverted: check contrast and that shadows/borders still separate
  surfaces.

**Motion**
- Short and purposeful: **150–200 ms** for hover/press/fade, **200–300 ms** for panels/dialogs,
  `ease-out` in, `ease-in` out. Animate opacity/transform only (no layout jank).
- Use motion to explain change (new message slides in, card expands), never as decoration.
- Respect `prefers-reduced-motion` (`motion-safe:` / `motion-reduce:` variants).

**Icons & imagery**
- `lucide-react` only, `size-4` inline with text, `size-5` in buttons/nav; icon-only buttons need
  `aria-label` and a tooltip on desktop.
- Images (link previews) in fixed `aspect-video` boxes with `object-cover`, rounded like cards,
  with a neutral placeholder when missing — never broken-image icons.

**Perceived performance**
- First screen useful fast: skeletons immediately, data via TanStack Query cache, prefetch on
  hover/intent (`defaultPreload: 'intent'`), no layout shift (reserve image and list space).

### Mobile-first ergonomics
- Primary actions in the **thumb zone** (bottom of the screen) on phones: sticky bottom bar or
  floating action button above the safe area.
- Touch targets ≥ 44×44 px; spacing between targets ≥ 8 px; no hover-only affordances.
- Bottom sheets (shadcn Drawer) instead of centered dialogs on small screens.
- Inputs: correct `type`/`inputMode` (`url`, `email`), `autoComplete`, and `enterKeyHint`
  ("send", "go") so the mobile keyboard fits the task.

## Task: build new UI (most common)

0. **Design the flow before the pixels.** Write down: the user's goal on this screen, the one
   primary action, the ≤ 3-tap path, and the loading / empty / error states (with their copy).
   Check it against "UX principles" above, and the page layout in `docs/PRODUCT.md`.
1. **Find before you make.** List `components/ui/` and `components/`. If a primitive exists,
   use it. If shadcn has it but we don't, add it (next task). Only write a new component if
   neither exists.
2. Decide the layer:
   - Used by one feature → `features/<feature>/components/`
   - Used by 2+ features → `components/`
   - Generic, no app knowledge, reusable anywhere → it's a primitive → `components/ui/`
3. Compose from primitives + semantic token classes only. No raw colors, no arbitrary values.
4. Accept `className` and forward it via `cn()`; forward `ref` and rest props for elements.
5. Cover states: loading (Skeleton), empty (EmptyState), error, disabled, and long text.
6. **Responsive (required):** write mobile-first, then add `md:`/`lg:` for larger screens.
   Follow the page layout table in `docs/PRODUCT.md` → "Responsive design". Check at
   **375px, 768px, and 1280px**: no horizontal scroll, touch targets ≥ 44px, no hover-only
   actions, inputs `text-base`, sticky/full-height layouts use `dvh` + safe-area insets.
7. Check light + dark and keyboard navigation (Tab/Enter/Esc).

## Task: add a shadcn component

```bash
pnpm --filter web dlx shadcn@latest add <component>   # e.g. dialog, table, form
```
- Review the generated file(s) and any new dependencies in `apps/web/package.json`.
- If the CLI wants to **overwrite** an existing file, stop — it may contain our customizations.
  Diff first (see "Update a shadcn component").
- Don't reformat or restyle the generated file in the same commit; customize in a follow-up
  commit so the diff is reviewable.

## Task: customize a primitive

- Edit the file in `components/ui/` directly — we own the source.
- Keep its public API compatible (prop names, Radix semantics, `data-slot` attributes) so
  existing call sites keep working.
- Put new looks in `cva` variants rather than changing the default appearance silently.
- Add a header comment listing what was changed vs upstream, e.g.
  `// customized: added "success" variant, rounded-full for size="icon"` — so future shadcn
  updates can be merged by hand.

## Task: add a variant

```tsx
const buttonVariants = cva("inline-flex items-center ...", {
  variants: {
    variant: {
      default: "bg-primary text-primary-foreground hover:bg-primary/90",
      success: "bg-success text-success-foreground hover:bg-success/90", // new
    },
    size: { default: "h-9 px-4", sm: "h-8 px-3", lg: "h-10 px-6", icon: "size-9" },
  },
  defaultVariants: { variant: "default", size: "default" },
});
```
- Variants must use tokens. If the variant needs a new color, add the token first (next task).
- Never branch on props to build className strings at call sites — add a variant instead.

## Task: add or change a token

Tokens are semantic (what it's **for**), never literal (what it **looks like**):
`--success`, not `--green`.

1. In `globals.css`, define the value in **both** themes (OKLCH):
   ```css
   :root {
     --success: oklch(0.62 0.17 150);
     --success-foreground: oklch(0.98 0 0);
   }
   .dark {
     --success: oklch(0.70 0.15 150);
     --success-foreground: oklch(0.15 0 0);
   }
   ```
2. Expose it to Tailwind in the `@theme inline` block:
   ```css
   @theme inline {
     --color-success: var(--success);
     --color-success-foreground: var(--success-foreground);
   }
   ```
   Now `bg-success`, `text-success-foreground`, `border-success` work.
3. Every background token gets a matching `-foreground` token. Check contrast ≥ 4.5:1 for
   text (3:1 for large text / UI borders) in **both** themes.
4. Changing an existing token changes the whole app — grep its usages
   (`grep -rn "primary" apps/web/src`) and tell the user what will visibly change.
5. Radius: change `--radius` once; derived `--radius-sm/md/lg/xl` follow. Fonts: add the
   `@fontsource-variable/<font>` package, import it in `main.tsx`, set `--font-sans` in
   `@theme`.

## Task: update a shadcn component from upstream

1. Copy the current file aside, run `shadcn add <component> --overwrite`, diff the two.
2. Re-apply our customizations (listed in the file's header comment).
3. Run `pnpm --filter web typecheck` and click through the screens that use it.

## Task: remove a component

Grep for imports (`grep -rn "components/ui/<name>" apps/web/src`); only delete when there are
none, then remove now-unused dependencies from `apps/web/package.json`.

## Never

- Raw palette classes (`bg-red-500`), hex/rgb/hsl literals, or inline color styles in components.
- `dark:` overrides with raw colors — fix the token's `.dark` value instead.
- Data fetching, routing, or feature imports inside `components/ui/`.
- A second component library (MUI, Mantine, Chakra, Ant) alongside shadcn — ask first.
- `!important` or `!` Tailwind modifiers to win specificity fights — fix the variant/`cn()` order.
- Removing focus rings or Radix ARIA wiring.
- Desktop-only layouts, `h-screen` for full-height mobile views, or actions reachable only on hover.
- Full-page spinners, blank screens while loading, or lists without an empty state.
- Buttons labelled "Submit" / "OK" / "Click here"; raw error codes or stack traces in the UI.
- "Are you sure?" dialogs for reversible actions — use undo instead.
- More than one primary (`default` variant) button in a view; decorative color or animation.

## UX review checklist (required for every UI PR)

Walk through the screen as a first-time user, on a phone (375 px) and desktop (1280 px):
- [ ] The screen's purpose is obvious in 3 seconds; one clear primary action
- [ ] Main task done in ≤ 3 taps; no unnecessary questions or fields
- [ ] Every tap gives feedback within 100 ms; long work shows progress in words
- [ ] Loading (skeleton), empty (explain + action), and error (what happened + how to fix) states
      all exist and read well
- [ ] Destructive actions are undoable or clearly confirmed; no user input is lost on error
- [ ] Copy is plain, sentence case, verbs on buttons; no jargon or raw error codes
- [ ] Visual: 4 px spacing rhythm, type scale, ≤ 2 weights, tokens only, consistent radius,
      generous whitespace; looks right in light **and** dark
- [ ] Motion is short, purposeful, and respects reduced motion
- [ ] Keyboard: logical tab order, visible focus, Enter submits, Esc closes
- [ ] Thumb-friendly on mobile: primary action reachable, targets ≥ 44 px, right keyboard type

## Done checklist
- [ ] Reused existing primitives; new component placed in the right layer
- [ ] Only semantic tokens; any new token defined for light **and** dark + mapped in `@theme inline`
- [ ] Variants via `cva`; `className` forwarded with `cn()`
- [ ] Loading / empty / error / disabled states handled
- [ ] Keyboard + screen-reader basics (labels, `aria-label` on icon buttons, focus visible)
- [ ] Responsive: checked at 375 / 768 / 1280px, matches the layout in `docs/PRODUCT.md`
- [ ] Looks right in dark mode
- [ ] UX review checklist above passes
- [ ] `pnpm --filter web lint typecheck test` pass
