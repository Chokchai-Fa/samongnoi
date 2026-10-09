---
name: design-system
description: Work on the frontend design system in apps/web — add or change design tokens (colors, radius, fonts, dark mode), add or customize shadcn/ui components, add component variants, or build new shared/feature UI that must follow the token + primitive rules. Use whenever a change touches apps/web/src/styles/globals.css, apps/web/src/components/**, or creates new UI.
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

## Task: build new UI (most common)

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

## Done checklist
- [ ] Reused existing primitives; new component placed in the right layer
- [ ] Only semantic tokens; any new token defined for light **and** dark + mapped in `@theme inline`
- [ ] Variants via `cva`; `className` forwarded with `cn()`
- [ ] Loading / empty / error / disabled states handled
- [ ] Keyboard + screen-reader basics (labels, `aria-label` on icon buttons, focus visible)
- [ ] Responsive: checked at 375 / 768 / 1280px, matches the layout in `docs/PRODUCT.md`
- [ ] Looks right in dark mode
- [ ] `pnpm --filter web lint typecheck test` pass
