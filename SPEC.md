# Arcspect — Product Specification
**Version:** 2.0  
**Last Updated:** March 2026  
**Status:** Live at [arcspect.netlify.app](https://arcspect.netlify.app)  
**Built by:** Efe Ogufere — Group PM, PiggyTech

---

## What is Arcspect

Arcspect is an AI-powered product documentation tool that turns a one-line idea into structured product specs in seconds. It is built for senior PMs who need to eliminate the blank page problem — not replace their thinking.

**Tagline:** Think clearly. Ship faster.  
**Parent brand:** The Aventurine Tech Hub Ltd.  
**Position in product suite:** Arcspect (Build) → Luster (Move) → Clarity (Operate)

---

## Problem it solves

Writing product documentation is one of the highest-leverage activities a PM does — and one of the most time-consuming. A PRD that takes two hours to draft from scratch takes two minutes with Arcspect. The PM still owns the decisions; Arcspect removes the friction of getting the first draft on the page.

---

## Documentation modes

| Mode | What it generates |
|------|------------------|
| **Full PRD** | Problem statement, goals, non-goals, personas, proposed solution, key features, user flow, success metrics, risks, open questions |
| **User Stories** | 5–8 backlog-ready stories in As a / I want / So that format with Given/When/Then acceptance criteria |
| **Acceptance Criteria** | Happy path, edge cases, error states, non-functional requirements |
| **Success Metrics** | North star metric, leading/lagging indicators, guardrail metrics, measurement guidance, targets |
| **Risks & Assumptions** | Technical, business, user/adoption, and regulatory risk registers with likelihood/impact/mitigation |

---

## Feature inventory

### Core generation
- Five documentation modes with per-session output caching
- Auto-generate on mode tab switch (uses cached output if available)
- Live status indicators per mode tab (generated / not yet)
- Context input (collapsible) — accepts user research, constraints, business goals
- Wireframe and screenshot upload — up to 5 images (PNG/JPG/WebP, 10MB each), sent as multimodal context to Claude API
- ⌘↵ keyboard shortcut to generate from anywhere

### Output
- Preview (rendered markdown) and Edit (raw markdown) toggle
- Word count display
- Copy to clipboard
- Download as .md, .docx, or .pdf

### Export
- Full brief download modal — select any combination of generated modes
- Three export formats: Markdown, Word (.docx), PDF
- DOCX: Inter font, green section labels, header/footer, page numbers
- PDF: Inter font embedded as base64 via pdfkit, structured document with header/footer

### Intelligence layer
- Go Deeper — Competitive Intelligence: uses PRD as context, generates named competitor profiles, a comparison table, and opportunity analysis
- Gold aesthetic to distinguish from core green generation flow
- Intel panel appears below workspace after generation

### Examples
- Three pre-loaded fintech examples (no API key needed)
- Merchant instant settlement — Full PRD
- Savings goal feature — User Stories
- Cross-border payment integration — Risks & Assumptions
- Accessible from "Examples" button in header and "Try an example" link in empty state
- Loading an example populates the idea field and renders output — fully editable and regeneratable

### Session management
- Auto-save to localStorage after every generation
- History modal (clock icon) — view, search, restore, delete sessions
- Max 20 sessions stored
- New session button — resets idea, context, images, output, and all caches
- Restore session — repopulates all fields and cached outputs

### Theme
- Dark mode (default) — deep forest green, dark surfaces
- Light mode — sage green background, white cards, deep forest green header
- System preference respected on first load
- Manual override stored in localStorage
- Sun/moon toggle in header

### Keyboard shortcuts
| Shortcut | Action |
|----------|--------|
| ⌘↵ | Generate |
| ⌘K | New session |
| ⌘1–5 | Switch mode (PRD, Stories, Criteria, Metrics, Risks) |
| ⌘E | Open examples |
| ⌘H | Session history |
| ⌘C | Copy output (when not in text field) |
| ⌘D | Download Markdown |
| ? | Open keyboard shortcuts |
| Esc | Close any open panel |

---

## Technical architecture

### Stack
- **Frontend:** Vanilla HTML, CSS, JavaScript — no frameworks, no build step
- **Backend:** Netlify Functions (serverless)
- **AI:** Anthropic Claude Haiku via `/v1/messages`
- **PDF export:** pdfkit with Inter Regular + Bold embedded as base64
- **DOCX export:** docx npm package

### File structure
```
arcspect/
├── index.html              — full frontend (single file, ~2,950 lines)
├── netlify.toml            — functions directory config
├── package.json            — pdfkit, docx dependencies
├── README.md               — public-facing documentation
├── SPEC.md                 — this file
└── functions/
    ├── generate.js         — Claude API proxy (multimodal: text + images)
    ├── export-docx.js      — Word document generation
    ├── export-pdf.js       — PDF generation with embedded fonts
    └── fonts.js            — Inter Regular + Bold as base64
```

### API flow
1. User enters idea + optional context + optional images
2. Frontend builds prompt using mode-specific template
3. POST to `/.netlify/functions/generate` with API key in `x-api-key` header
4. Netlify function proxies to Anthropic API — no CORS issues, key never exposed in browser
5. Response streamed back, rendered as markdown in output panel

### Multimodal flow
When images are attached:
- Images converted to base64 in browser
- Sent as `image` content blocks before the text prompt
- Claude API processes visual context alongside the text idea

### Export flow
- `.md` — client-side Blob download, no server call
- `.docx` — POST to `/.netlify/functions/export-docx`, returns binary
- `.pdf` — POST to `/.netlify/functions/export-pdf`, returns binary
- Full brief — collects all cached mode outputs, sends as single payload

### Critical implementation notes
- `index.html` has exactly one `<script>` tag — never add a second
- Check for duplicate `const` declarations before committing — they crash the entire script silently
- `netlify.toml` must NOT have `node_bundler = "esbuild"` — breaks pdfkit
- `fonts.js` must be in `functions/` alongside export scripts
- API key is passed via request header, never stored server-side
- Hard refresh after deploy: Cmd+Shift+R

---

## Design system

**Parent brand:** The Aventurine Tech Hub Ltd.  
**Logo:** Mark C — Spectrum mark (5 vertical lines, decreasing weight, light-to-dark green fade)

### Colour palette (dark mode)
| Token | Hex | Usage |
|-------|-----|-------|
| `--bg` | `#080C09` | Page background |
| `--surface` | `#0D1410` | Panel backgrounds |
| `--aventurine` | `#4A7C59` | Interactive elements, borders |
| `--aventurine-light` | `#6BAF80` | Hover states, emphasis |
| `--gold` | `#C9A84C` | Premium accent (Go Deeper, Full Brief) |
| `--text` | `#EDF2EE` | Primary text |

### Colour palette (light mode)
| Token | Hex | Usage |
|-------|-----|-------|
| `--bg` | `#EDF5EF` | Sage green page background |
| `--surface` | `#FFFFFF` | White cards |
| `--aventurine` | `#1C4A2A` | Header, CTAs, active states |
| `--aventurine-light` | `#2E6B42` | Hover states |
| `--gold` | `#7A5C10` | Eyebrow, premium accents |

### Typography
- **Display:** Plus Jakarta Sans 800 — headlines, product name
- **Body:** DM Sans 300–600 — UI copy, descriptions
- **Mono:** DM Mono 400–500 — labels, badges, metadata, code

---

## Roadmap

### Completed
- [x] Five documentation modes with caching
- [x] Go Deeper competitive intelligence
- [x] Wireframe and screenshot input (multimodal)
- [x] Full brief export (Markdown, DOCX, PDF)
- [x] Session history with restore
- [x] Pre-loaded fintech examples
- [x] Light and dark mode
- [x] Keyboard shortcuts panel
- [x] GitHub README

### Next
- [ ] Landing page at arcspect.netlify.app
- [ ] Notion export
- [ ] Demo GIF for README

### Parked (until external users exist)
- [ ] Memory architecture — persistent context across sessions
- [ ] User accounts and saved projects
- [ ] Industry/sector onboarding
- [ ] Go Deeper monetisation (usage-based credits)

---

## Why this exists

Built by a Group PM with 7+ years across fintech and payments to solve a problem faced daily — leading four PMs across six products at PiggyTech. The blank page problem is real. Arcspect is the answer.

Part of a deliberate strategy to build technical range as a PM: not to become an engineer, but to close the gap between thinking and shipping to near-zero.

*The Aventurine Tech Hub Ltd. · github.com/anovelbygod · March 2026*