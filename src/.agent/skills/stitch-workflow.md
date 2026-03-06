---
name: uupm-integration
description: How UI UX Pro Max skill replaces Stitch MCP for design intelligence in Scaling Up v2
---

# UI UX Pro Max Integration

## What It Is
An AI skill (30k+ GitHub stars) that provides design intelligence. It auto-activates when you do UI work — no commands, no API calls, no tokens.

## Installation
```bash
npx -y uipro-cli init --ai antigravity
```

## What It Gives Us (For Free)
- shadcn/ui + Next.js specific guidelines
- Pre-delivery anti-pattern checks (missing focus states, no hover transitions, broken accessibility)
- WCAG AA accessibility validation
- Responsive breakpoint validation (375px, 768px, 1024px, 1440px)
- Typography pairing recommendations

## What We Use From It
Only the **auto-activation on UI tasks** and **pre-delivery checklist**. We skip the style exploration features — our design system is already defined in `globals.css`.

## Our Design System (Locked)
- Primary: HSL `221.2 83.2% 53.3%` (Blue)
- Font: Geist Sans / Geist Mono
- Radius: 0.5rem
- Components: shadcn/ui
- Icons: lucide-react

UUPM validates our output against these tokens. It doesn't replace them.

## Replaces
- ~~stitch-workflow.md~~ (deleted)
- ~~Stitch MCP~~ (no longer needed for design generation)
- ~~Google Cloud auth for Stitch~~ (eliminated)
