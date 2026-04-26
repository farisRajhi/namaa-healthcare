# Tawafud — Brand Context for AI/LLM Use

> **How to use this document:** Paste the whole file into a system prompt or context window when asking an AI to generate copy, visual designs, UI components, marketing assets, or anything brand-facing for Tawafud. Every hex code, font name, class name, and string below is extracted from the production codebase — treat these as non-negotiable tokens. When in doubt, reuse existing tokens instead of inventing new ones.

---

## 1. Product

Tawafud (توافد) is an AI-powered medical-receptionist platform for small-to-mid clinics in Saudi Arabia and the Gulf. It automates patient communication on WhatsApp (primary), web chat, and SMS — booking appointments, reducing no-shows, running recall campaigns, and handling bilingual Arabic/English conversations 24/7. Customers are clinic owners and receptionists; end users are Saudi patients. The product is PDPL-compliant and priced in SAR with monthly tiers (Starter / Professional / Enterprise).

---

## 2. Brand name & marks

| Element | Value |
|---|---|
| **Name (EN)** | Tawafud |
| **Name (AR)** | توافد |
| **Meaning** | "Convergence / flow of people arriving" — metaphor for patient flow |
| **Pronunciation** | *ta-WAA-fud* |
| **Primary logo** | 40×40 rounded-xl tile with a **teal gradient** background + a white bold plus glyph `✚` (U+271E) |
| **Wordmark** | "Tawafud" in **Figtree Bold**, 18 px, color `#2D3436` |
| **Eyebrow** | "TAWAFUD HEALTH AI" — 10 px, uppercase, wide tracking, color `#6B7280` |
| **Logo gradient** | `linear-gradient(135deg, #4A7C6F, #3D6A5E)` |
| **Logo shadow** | `0 2px 4px rgba(74, 124, 111, 0.2)` |

Write the Arabic name when you need it as **توافد** (never transliterate inside Arabic copy).

**Gap:** Favicon is still the Vite default (`/vite.svg`). Do not reference a custom Tawafud favicon until one is shipped.

---

## 3. Voice & tone

Action-oriented, outcome-first, and specific. Copy leads with the result ("Reduce no-shows by 50%"), then the mechanism. Short sentences. Strong verbs. Never hype for hype's sake — quantified claims only.

**Register**
- Professional but warm — not corporate, not casual. Like a confident clinic manager, not a startup bro.
- Arabic register is slightly more formal than English; both are respectful of healthcare's seriousness.
- Arabic is the **default** locale; English is parity, not primary.

**Signature moves**
- **24/7 anchor** — availability is the repeated value prop ("AI that works 24/7", "Available 24/7", "< 1 min response time").
- **Quantified outcomes** — "50%", "3×", "60%", "under 30 minutes". Never "a lot", "many", "significant".
- **Compliance as trust** — PDPL, end-to-end encryption, PII redaction, audit logging. These are brand assets, not fine print.
- **Saudi/Gulf-specific** — "across Saudi Arabia and the Gulf", SAR pricing, Mada payment, Arabic-first.

**Avoid**
- Generic SaaS speak ("game-changing", "revolutionary", "unlock your potential").
- Medical claims or diagnostic language — the AI schedules and answers FAQs; it does not diagnose or treat. This is a product guardrail, not just copy advice.
- Non-Islamic / culturally insensitive imagery, references to alcohol/pork, Western holiday framing.
- Mascots, cutesy illustrations, emoji as decoration.

---

## 4. Signature copy patterns

**Tagline** — "AI-Powered Healthcare Automation"
**Secondary tagline** — "AI-powered healthcare automation platform for clinics and hospitals."

**Hero formula** — `[Category] + [Audience]` with a highlight span:
> The AI-Powered Platform for **Modern Healthcare**

**Hero sub-formula** — `[Action verb] + [what] + [channels] + [outcomes] + [24/7 close]`:
> Automate patient communication across WhatsApp, web chat, and SMS. Reduce no-shows, fill schedules, and grow your practice with AI that works 24/7.

**CTA verbs (ranked by frequency of use)**
1. "Start Free Trial" — primary conversion CTA
2. "Get Started for Free" — secondary/final-CTA variant
3. "See How It Works" — low-commitment secondary

**Section headings — preferred shapes**
- "Everything Your Clinic Needs"
- "Why Healthcare Providers Choose Tawafud"
- "How It Works"
- "Ready to Transform Your Practice?"

**Repeatable phrases (reuse verbatim where possible)**
- "Go from setup to live in under 30 minutes"
- "One platform to automate every patient touchpoint"
- "Built for clinics and hospitals across Saudi Arabia and the Gulf"
- "Join clinics across Saudi Arabia already using Tawafud"

**Tier names** — Starter / Professional / Enterprise. Descriptions are one-liners: "For small clinics" / "For growing clinics" / "For clinic groups". Never rename these.

**Channel pill order** — WhatsApp → Web Chat → SMS. WhatsApp always first.

**Stat card format** — Big number + tight label: `50%` / "Reduction in No-Shows" · `24/7` / "Availability" · `3×` / "More Bookings" · `< 1min` / "Response Time".

---

## 5. Audience & register

Three surfaces, three tones:

| Surface | Audience | Tone |
|---|---|---|
| **Landing / marketing** | Clinic owners, decision-makers | Outcome-first, ROI-framed, compliance-backed |
| **Admin dashboard** | Receptionists, clinic managers (daily use) | Functional, calm, directive; status-dense |
| **Patient portal / WhatsApp bot** | Saudi patients (all ages) | Warm, respectful, concise; Arabic-first; greeting-led ("Welcome 👋" / "مرحباً") |

The **receptionist is the primary human-in-the-loop** across the whole product — suggestions, campaigns, and outbound messages default to "approve before send" unless explicitly toggled to auto. Copy and UX should reinforce the receptionist's agency, never replace them.

---

## 6. Color system

All colors are defined as Tailwind tokens in `frontend/tailwind.config.js` and as CSS variables in `frontend/src/index.css`. Stay within these tokens.

### Primary — muted teal (the brand)

| Token | Hex | Use |
|---|---|---|
| `primary-50` | `#F0F5F3` | Hover backgrounds, subtle tint |
| `primary-100` | `#D9E8E3` | Badge bg, soft fills |
| `primary-200` | `#B5D1C8` | Borders, decorative |
| `primary-400` | `#639E8E` | — |
| **`primary-500`** | **`#4A7C6F`** | **Brand hue, primary buttons, active nav** |
| `primary-600` | `#3D6A5E` | Hover on primary buttons |
| `primary-700` | `#30564C` | Badge text, link text |
| `primary-900` | `#1A332C` | Deep accent |

### Secondary — warm ochre (supporting)

| Token | Hex | Use |
|---|---|---|
| `secondary-400` | `#C4956A` | Decorative accent, gradient endpoint |
| **`secondary-500`** | **`#B07D52`** | **Secondary accent color** |

Use sparingly — secondary is a spice, not a main ingredient. Typical usage is in `text-gradient` (primary→secondary) on hero highlight words.

### Semantic (statuses)

| Token | Hex | Use |
|---|---|---|
| `success-500` | `#059669` | Confirmed, success toasts, positive trends |
| `warning-500` | `#F59E0B` | Pending, coming-soon, warning toasts |
| `danger-500` | `#DC2626` | Cancelled, errors, destructive actions |

### Healthcare neutrals (the canvas)

| Token | Hex | Use |
|---|---|---|
| `healthcare-bg` | `#F5F5F0` | App background — off-white with warm tint (reduces eye strain) |
| `healthcare-surface` | `#FAFAF7` | Card / elevated surface bg |
| `healthcare-text` | `#2D3436` | Primary text (nearly-black charcoal, not pure black) |
| `healthcare-muted` | `#6B7280` | Secondary text, placeholders |
| `healthcare-border` | `#D6D3CC` | Dividers, card borders |
| `healthcare-hover` | `#F0F5F3` | Row hover, interactive tint |

### Signature gradients (named utilities)

| Class | Value | Use |
|---|---|---|
| `bg-teal-gradient` | `linear-gradient(135deg, #4A7C6F, #3D6A5E)` | Logo tile, primary CTAs on landing, step-number pips |
| `bg-hero-gradient` | `linear-gradient(135deg, #F5F5F0 0%, #E8EDE9 30%, #F0F5F3 60%, #FBF6F1 100%)` | Hero + final-CTA section backgrounds |
| `bg-mesh` | Three stacked radial gradients in primary/cyan/success at 4–8% opacity | Ambient depth under hero |
| `text-gradient` | `bg-gradient-to-r from-primary-500 to-secondary-500` clipped to text | Hero highlight word ("Modern Healthcare") |
| `bg-green-gradient` | `linear-gradient(135deg, #059669, #047857)` | Success-themed emphasis (rare) |

---

## 7. Typography

| Role | Family | Weights | Notes |
|---|---|---|---|
| **Heading** | Figtree | 300, 400, 500, 600, 700 | 600 default, `letter-spacing: -0.01em`, `line-height: 1.3` |
| **Body** | Noto Sans | 300, 400, 500, 700 | `line-height: 1.6` |
| **Arabic (all roles)** | Noto Sans Arabic | 300, 400, 500, 600, 700 | Swapped via `[dir="rtl"]` selector; no letter-spacing on Arabic |

Fonts load from Google Fonts in `frontend/index.html` and `frontend/src/index.css`.

**Rules**
- Headings always use Figtree (Latin) / Noto Sans Arabic (RTL). Never mix sans families.
- Arabic headings drop `letter-spacing` (Arabic script spacing is intrinsic to the glyphs).
- Font smoothing: `-webkit-font-smoothing: antialiased`.

**Scale** — use Tailwind defaults (`text-xs` through `text-6xl`); the landing hero is `text-4xl md:text-5xl lg:text-6xl`, page titles are `text-2xl font-bold`, stat numbers are `text-3xl lg:text-4xl font-bold`.

---

## 8. Spacing, radii, shadows, motion

### Layout constants

| Variable | Value |
|---|---|
| `--sidebar-width` | 280 px |
| `--sidebar-collapsed` | 72 px |
| `--header-height` | 64 px |

### Custom spacing (on top of Tailwind defaults)

`18` = 4.5 rem · `88` = 22 rem · `104` = 26 rem · `112` = 28 rem · `128` = 32 rem

### Radii — softer than default Tailwind

| Token | Value |
|---|---|
| `rounded-sm` | 6 px |
| `rounded` (DEFAULT) | 8 px |
| `rounded-md` | 10 px |
| `rounded-lg` | 14 px |
| `rounded-xl` | 18 px |
| `rounded-2xl` | 24 px |
| `rounded-3xl` | 32 px |

Buttons use `rounded-lg`, cards use `rounded-xl`, modals use `rounded-2xl`, the logo tile uses `rounded-xl`.

### Shadows — primary-tinted, not generic gray

| Class | Value (abbreviated) | Use |
|---|---|---|
| `shadow-btn` | `0 2px 4px rgba(74,124,111,.2)` | Primary buttons |
| `shadow-btn-hover` | `0 4px 8px rgba(74,124,111,.3)` | Button hover |
| `shadow-card` | Soft primary-tinted double shadow | Cards (default elevation) |
| `shadow-card-hover` | Stronger variant | Interactive card hover |
| `shadow-neu-sm/md/lg/xl` | Two-tone neumorphic (dark + white) | Stat cards, featured elements |
| `shadow-sidebar` | `4px 0 12px rgba(0,0,0,.05)` | Sidebar |
| `shadow-header` | `0 2px 8px rgba(0,0,0,.04)` | Sticky top bar |
| `shadow-modal` | `0 20px 60px rgba(0,0,0,.15)` | Modals |

Shadows are tinted with the primary teal's RGB — this is a brand move, not an oversight. Do not replace with neutral grays.

### Motion

**Durations & easing**
- `--transition-fast` = 150 ms · `--transition-base` = 250 ms · `--transition-slow` = 350 ms
- Standard ease: `cubic-bezier(0.4, 0, 0.2, 1)` (Tailwind: `ease-smooth`)
- GSAP easing vocabulary: `power2.out` (most common), `power3.out` (stronger deceleration), `back.out(1.7)` (reserved for icon bounce on CTA sections)

**Stock CSS animations** (`tailwind.config.js`): `animate-fade-in` (0.3s), `animate-slide-in` (X), `animate-slide-up` (Y), `animate-scale-in` (0.2s), `animate-pulse-soft` (2s infinite, status dots), `animate-shimmer` (1.5s infinite, loading states).

**Scroll reveals** — GSAP + ScrollTrigger. Start at `top 85%` (reveal well before in view). Batch feature cards with `stagger: 0.08s`. FOUC guard: elements with `data-hero`, `data-feature`, `data-step`, `data-demo`, `data-benefits`, `data-cta` start hidden and reveal only after `html.js-loaded` is set.

**Reduced motion** — `prefers-reduced-motion: reduce` must skip all entrance animations and present elements at their final state immediately.

---

## 9. Component vocabulary

All primitives live in `frontend/src/components/ui/` and are styled via utility classes defined in `frontend/src/index.css`. **Reuse these — do not invent new patterns.**

### Primitives

| Component | Variants / sizes | Notes |
|---|---|---|
| **Badge** | `primary / success / warning / danger / neutral / info` | Optional status dot. Use `getStatusBadgeVariant()` to map appointment statuses → variant |
| **StatCard** | — | KPI card with icon tile, value, label, trend indicator, optional live-pulsing dot |
| **Modal** | `sm / md / lg / xl` | Click-outside + ESC dismiss. Animated `fade-in + scale-in` |
| **Toast** | `success / error / warning / info` | Top-right (LTR) / top-left (RTL), auto-dismiss 4–6 s, max 5 stacked |
| **DataTable** | — | Loading + empty states, RTL-aware pagination chevrons |
| **EmptyState** | — | Icon + title + description + action |
| **LoadingSpinner** | `sm / md / lg` | Ring spinner in primary tint |
| **StatusDot** | `live / warning / danger / neutral` | `live` variant uses `animate-pulse-soft` |
| **SearchInput** | — | `.input` + leading icon |
| **BranchSelector** | — | Multi-clinic dropdown, default "كل الفروع" |
| **ComingSoonOverlay** | — | Dims content at 40% opacity, amber clock badge |

### Utility classes (from `index.css`)

Reuse before composing: `.card`, `.card-interactive` (hover lifts `-translate-y-0.5`), `.card-neu`, `.stat-card`, `.btn` + `.btn-primary / -success / -danger / -outline / -ghost`, sizes `.btn-sm / -lg / -icon`, `.badge` + 5 variants, `.input`, `.select`, `.checkbox`, `.toggle`, `.table-container / -header / -row`, `.nav-link` + `.nav-link-active`, `.modal-overlay / -content / -header / -footer`, `.chip` + `.chip-active`, `.sidebar*`, `.top-header`, `.page-header`, `.page-title`.

### Button sizing rule
Minimum touch target is **44×44 px** on all buttons (`.btn`) — this is a WCAG target built into the class, not optional.

### Focus state
Global: `ring-[3px] ring-primary-400 ring-offset-2 ring-offset-white`. Visible focus ring is required on every interactive element (keyboard accessibility).

---

## 10. Iconography

Library: **`lucide-react`** (v0.468) — the only icon set in use. Do not mix in Heroicons, Feather, or custom SVGs unless the icon doesn't exist in Lucide.

**In-use icon vocabulary (curated — reuse these first):**

| Domain | Icons |
|---|---|
| Navigation | `LayoutDashboard`, `Calendar`, `Users`, `Settings`, `LogOut`, `Menu`, `X`, `Bell`, `Globe`, `CreditCard` |
| Healthcare | `HeartPulse`, `Heart`, `Activity`, `Stethoscope`, `Brain`, `Shield` |
| Channels | `MessageCircle` (WhatsApp), `MessageSquare` (Web Chat), `Mail` (SMS) |
| Features | `BarChart3`, `Workflow`, `Building2`, `Megaphone`, `Clock`, `Sparkles`, `Zap`, `Crown` |
| Status | `CheckCircle`, `AlertCircle`, `AlertTriangle`, `Info`, `TrendingUp`, `TrendingDown` |
| Direction (RTL-aware) | `ArrowRight` / `ArrowLeft`, `ChevronLeft` / `ChevronRight` — swap based on `i18n.language` |

Icon sizing convention: 18 px in sidebar nav, 24 px in hero/feature cards, 40 px in step badges.

---

## 11. Cultural & regional rules

Saudi healthcare is the product's home. These are non-negotiable:

- **Arabic is the default locale.** i18n `fallbackLng: 'ar'`. English is complete, not primary. When generating any user-facing string, produce both unless scoped otherwise.
- **Full RTL via `tailwindcss-rtl`.** Use logical properties (`start`/`end`) instead of `left`/`right` in Tailwind. `dir` attribute flips on `<html>` based on language.
- **Arabic font family swaps** automatically via `[dir="rtl"]` selectors — don't hardcode `font-family: Figtree` in Arabic contexts.
- **Directional icons flip semantically** — `ArrowRight` in English CTA becomes `ArrowLeft` in Arabic (the "forward" direction is right-to-left).
- **Prayer-time awareness** — `frontend/src/hooks/usePrayerTimes.ts` fetches the five daily prayers (Riyadh default) and exposes `isDuringPrayer(date)`. Scheduling UIs should respect this. Prayer times are a feature, not a constraint to work around.
- **Payments** — Tap Payments is the processor; display Mada + Visa + Mastercard + AMEX + 3D-Secure badges on billing surfaces.
- **Trust anchors** — PDPL (Saudi Personal Data Protection Law), SSL, PII redaction, audit logging, data residency. Name these specifically; avoid generic "GDPR-level" language (wrong jurisdiction).
- **No alcohol, pork, gambling, music-industry imagery, Western religious holidays** in any generated asset.
- **Imagery currently zero** — no photography or illustrations ship today. The visual language is pure color, gradients, type, and lucide icons. Adding photographic or illustrated assets is a product decision, not a default.

---

## 12. Do / Don't

**Do**
- Lead with a quantified outcome, then the mechanism.
- Reuse the named utility classes (`.card`, `.btn-primary`, etc.) — they carry the design system invariants (44 px touch targets, ring focus, tinted shadows).
- Use the teal gradient on hero CTAs, logo tiles, and step-number badges.
- Put WhatsApp first whenever the three channels are listed.
- Use `text-gradient` (primary→secondary) on exactly one emphasized word per hero headline.
- Treat PDPL + encryption as brand anchors, not fine print.
- Respect the receptionist's role: suggestions default to approve-before-send.

**Don't**
- Don't introduce a fourth accent color. The palette is primary (teal) + secondary (ochre) + three semantic + neutrals. That's it.
- Don't use pure black (`#000`) for text — always `healthcare-text` `#2D3436`.
- Don't use pure white backgrounds for the app canvas — use `#F5F5F0` (`healthcare-bg`). Pure white is reserved for cards/surfaces.
- Don't write medical claims or diagnostic language — the AI is a receptionist, not a doctor.
- Don't use emojis as decoration. One greeting emoji in the patient portal (👋) is allowed; everywhere else, use lucide icons.
- Don't use neutral gray shadows — use the primary-tinted shadow tokens.
- Don't invent new component classes when an existing one fits.
- Don't produce English-only surfaces. Every public-facing string has an Arabic pair.

---

## 13. Open gaps (known, don't hallucinate)

- **Favicon** is still the Vite default (`/vite.svg`) — a Tawafud favicon has not been designed yet.
- **No photography or illustration library** ships today. Any reference to "brand photography" is inaccurate.
- **Prayer-times hook exists but is not yet surfaced in the UI** — the data is available but there's no visible indicator in the dashboard as of the current snapshot.
- **Sub-brand "Namaa"** was removed (the `NAMAA_VISION_AND_FUTURE.md` file was deleted). Treat "Namaa" as historical, not current.
- **No dark mode.** The system is light-only by design — healthcare admin software is typically used in well-lit environments.

---

## Source of truth

Every value in this document was extracted from:

- `frontend/tailwind.config.js` — colors, fonts, radii, shadows, animations
- `frontend/src/index.css` — CSS variables, component utility classes, gradients
- `frontend/src/pages/Landing.tsx` — hero, section headings, copy patterns
- `frontend/src/pages/Pricing.tsx` + `frontend/src/components/pricing/PricingSection.tsx` — tier naming, pricing tone
- `frontend/src/i18n/locales/en/translation.json` + `…/ar/translation.json` — bilingual strings
- `frontend/src/components/layout/DashboardLayout.tsx` — logo lockup, sidebar vocabulary
- `frontend/src/components/ui/` — primitive components
- `frontend/src/hooks/usePrayerTimes.ts` — prayer-time integration
- `backend/src/lib/messages.ts` — bilingual backend message pairs
- `CLAUDE.md` — product scope, architecture conventions

When the codebase changes, this document should be regenerated from source — don't edit it drift-style.
