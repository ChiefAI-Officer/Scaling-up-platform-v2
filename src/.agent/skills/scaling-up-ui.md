---
name: scaling-up-ui
description: Component inventory, design tokens, globals.css variables, and shadcn/ui patterns for Scaling Up v2
---

# Scaling Up v2 — UI System

## Design Tokens (globals.css)
```css
:root {
  --primary: 221.2 83.2% 53.3%;        /* Blue — buttons, links, active */
  --primary-foreground: 210 40% 98%;    /* White text on primary */
  --secondary: 210 40% 96.1%;           /* Light blue-gray — subtle backgrounds */
  --muted: 210 40% 96.1%;              /* Same as secondary */
  --muted-foreground: 215.4 16.3% 46.9%; /* Gray text — descriptions, labels */
  --destructive: 0 84.2% 60.2%;        /* Red — delete, cancel, errors */
  --background: 0 0% 100%;             /* White */
  --foreground: 222.2 84% 4.9%;        /* Near-black text */
  --border: 214.3 31.8% 91.4%;         /* Light border */
  --ring: 221.2 83.2% 53.3%;           /* Focus ring = primary */
  --radius: 0.5rem;                     /* Border radius standard */
}
```

## Typography
- **Sans:** `var(--font-geist-sans)` (Geist Sans via next/font)
- **Mono:** `var(--font-geist-mono)` (Geist Mono via next/font)
- **Framework:** Tailwind CSS v4 (`@import "tailwindcss"`)

## Component Library (shadcn/ui)
Located in `src/components/ui/`. These are the building blocks:

| Component | File | Usage |
|-----------|------|-------|
| Button | `button.tsx` | Primary actions, variants: default/destructive/outline/secondary/ghost/link |
| Card | `card.tsx` | Content containers, dashboard widgets |
| Table | `table.tsx` | Data display (workshops, registrations, contacts) |
| Select | `select.tsx` | Dropdown selections |
| Badge | `badge.tsx` | Status indicators |
| Input | `input.tsx` | Form text inputs |
| Textarea | `textarea.tsx` | Multi-line text |
| Label | `label.tsx` | Form labels |
| Dialog | `dialog.tsx` | Modals and confirmations |
| Tabs | `tabs.tsx` | Tab-based navigation |
| Dropdown Menu | `dropdown-menu.tsx` | Context menus, action menus |
| Avatar | `avatar.tsx` | Profile images |
| Toast | Via `sonner` | Notifications |
| Confirmation Modal | Custom | Delete/cancel confirmations with fee warnings |
| StatusPill | Custom | Workshop status badges with color-coding |

## Layout Structure
```
src/app/
  (dashboard)/layout.tsx  — Admin sidebar: Dashboard / Workshops / Coaches + nav
  (portal)/layout.tsx     — Coach portal: My Workshops / Profile / Landing Pages
  (public)/layout.tsx     — Public-facing pages (landing pages, registration)
  admin/layout.tsx        — Admin-specific layouts
  layout.tsx              — Root: Geist fonts, Toaster, SessionProvider
```

## Component Rules
1. **Always use existing shadcn/ui components** — don't recreate buttons, inputs, etc.
2. **Use HSL variables** — never hardcode hex colors, always `hsl(var(--primary))`
3. **Consistent radius** — use `rounded-md` (maps to --radius: 0.5rem)
4. **Icons** — use `lucide-react` for all icons
5. **Status colors** — follow existing StatusPill patterns for workshop statuses
6. **Forms** — use Label + Input/Select/Textarea pattern, validate with zod
7. **Loading states** — use skeleton components or spinner, never leave blank
8. **Error boundaries** — wrap client components with error boundaries
