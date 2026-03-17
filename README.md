# Arcspect

**Think clearly. Ship faster.**

Arcspect is an AI-powered product documentation tool built by a Group PM with 7+ years in fintech and payments. Describe a product idea in one sentence — get a structured PRD, user stories, acceptance criteria, success metrics, or risk register in seconds.

**[→ Try it live](https://arcspect.netlify.app)**

---

## What it does

Arcspect has five documentation modes, each producing output ready to hand directly to an engineering team or drop into a stakeholder review:

| Mode | Output |
|------|--------|
| **Full PRD** | Problem statement, personas, proposed solution, user flow, success metrics, risks |
| **User Stories** | Backlog-ready stories in As a / I want / So that format with Given/When/Then acceptance criteria |
| **Acceptance Criteria** | Happy path, edge cases, error states, and non-functional requirements |
| **Success Metrics** | North star metric, leading/lagging indicators, guardrail metrics, and measurement guidance |
| **Risks & Assumptions** | Structured risk register across technical, business, user, and compliance dimensions |

Add context — user research, technical constraints, business goals — to make output more precise. Attach wireframes or screenshots for visual context (multimodal). Export as Markdown, Word, or PDF.

---

## Features

- **5 documentation modes** with per-session caching and auto-generate on tab switch
- **Wireframe and screenshot input** — attach up to 5 images as visual context
- **Competitive intelligence** — Go Deeper analyses your PRD and surfaces named competitors, positioning gaps, and a comparison table
- **Full brief export** — combine any selection of modes into a single Markdown, DOCX, or PDF document
- **Session history** — auto-saves after every generation, restore any past session with one click
- **Pre-loaded examples** — three real fintech PRDs to explore without an API key
- **Light and dark mode** — system preference respected, manual override available
- **Keyboard shortcut** — ⌘↵ to generate from anywhere

---

## Built with

- **Claude Haiku** (Anthropic API) — documentation generation and competitive intelligence
- **Netlify Functions** — serverless backend for secure API calls and document export
- **pdfkit** — PDF generation with embedded Inter font
- **docx** — Word document generation
- **Vanilla HTML, CSS, JavaScript** — no frameworks, no build step

---

## Why I built this

Writing product documentation is one of the highest-leverage things a PM does — and one of the most time-consuming. The blank page problem is real. A PRD that would take two hours to draft from scratch takes two minutes with Arcspect.

This is not a writing assistant. It is a thinking accelerator. You still own the product decisions — Arcspect removes the friction of getting the first draft on the page so you can spend your time refining, not formatting.

I built it to sharpen my technical range as a PM and to solve a problem I face daily leading a team of four PMs across six products at PiggyTech.

---

## Local development

No build step required.

```bash
git clone https://github.com/anovelbygod/arcspect.git
cd arcspect
```

To run the Netlify functions locally:

```bash
npm install
npm install -g netlify-cli
netlify dev
```

You will need an [Anthropic API key](https://console.anthropic.com) to generate documentation.

---

## Roadmap

- [x] Five documentation modes with caching
- [x] Competitive intelligence (Go Deeper)
- [x] Wireframe and screenshot input
- [x] Full brief export (Markdown, DOCX, PDF)
- [x] Session history with restore
- [x] Pre-loaded fintech examples
- [x] Light and dark mode
- [ ] Landing page
- [ ] Notion export
- [ ] Saved projects with memory across sessions

---

*Built by [Efe Ogufere](https://github.com/anovelbygod) — Group PM at PiggyTech. 7+ years across fintech and payments.*

*Part of the [Aventurine Tech Hub](https://github.com/anovelbygod) product suite — Arcspect (build) · Luster (move) · Clarity (operate).*