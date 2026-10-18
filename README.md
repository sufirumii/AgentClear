# AgentClear — Static Demo Build

**Test customer-support AI agents before your customers find out.**

AgentClear turns AI-agent testing into a repeatable, evidence-backed engineering
workflow: run a 25-case starter suite against an agent, verify tool usage in
three phases (requested / observed / confirmed), and get an evidence-backed
report of exactly what passed, what failed, and why.

> Clear results. Clear evidence. Clear next steps.

---

## About this build

This is the **static demo build** of AgentClear. It deploys to any static
host — **Render Static Site, GitHub Pages, Netlify, Vercel, Cloudflare
Pages** — with **no Node server and no database**. The entire product runs
in the browser:

- **Marketing site** — home, how-it-works, capabilities, security, docs,
  privacy, terms, contact, brand assets.
- **Full product demo** — sign up (stored locally in your browser), and you
  get a workspace with:
  - the **demo sandbox agent** (a scripted "Trailhead Outfitters" support
    agent with four realistic flaws) — runs are **REAL client-side
    executions** through the genuine rule evaluator, with live progress,
    cancellation, per-case evidence, tool timelines and exports;
  - the editable **25-case starter suite** (10 correctness, 8 tool usage,
    7 safety) plus a seeded, clearly-labeled **simulated sample report**;
  - agents, suites, cases, runs, reports, comparison, settings, API tokens
    and account management — all functional against the local store.

The in-browser backend (`src/lib/local.ts`) implements the exact `/api`
contract of the full-stack build, so this codebase is a faithful demo of the
real product. Data persists in `localStorage` only — it never leaves the
browser.

**Disclosed differences from the full-stack build:**

| Capability | Static demo build | Full-stack build |
| --- | --- | --- |
| Sandbox agent runs | ✅ real client-side execution | ✅ server-side execution |
| CUSTOM_HTTP agents | ❌ not executable from a static site (browser CORS + no SSRF guard) | ✅ SSRF-guarded outbound requests |
| Data | browser `localStorage` (single browser) | SQLite / PostgreSQL (multi-user) |
| Auth | demo sessions (plain-text, local only) | scrypt + DB-backed httpOnly-cookie sessions |
| Rate limiting / audit log | not applicable | ✅ |

The full-stack source is distributed by the deployed site at
`/downloads/agentclear-source-code.zip` (Brand assets → Download source).

## Project structure (~46 files)

```
├── src/
│   ├── app/                      # single static route
│   │   ├── layout.tsx            #   fonts, theme provider, toaster
│   │   ├── page.tsx              #   SPA shell (hash-based routing)
│   │   └── globals.css           #   design tokens, light/dark themes
│   ├── components/
│   │   ├── shared.tsx            # logo, status primitives, diagrams, theme
│   │   ├── marketing.tsx         # all public pages (home…brand)
│   │   ├── ui/                   # 10 shadcn/ui primitives used by the app
│   │   └── app/                  # authenticated app shell + views
│   │       ├── agentclear-app.tsx#   hash router wiring
│   │       ├── shell.tsx         #   sidebar, session, new-run dialog, auth pages
│   │       ├── views.tsx         #   overview, agents, suites
│   │       ├── runs.tsx          #   runs list, run detail, report, compare
│   │       └── settings.tsx      #   workspace/profile/tokens/sessions/danger
│   └── lib/
│       ├── types.ts              # shared type system + labels
│       ├── utils.ts              # cn() helper
│       ├── evaluator.ts          # the real rule evaluator (PASS/FAIL/NOT_EVIDENCED)
│       ├── starter-suite.ts      # 25 cases + simulated sample data
│       ├── demo-agent.ts         # scripted sandbox agent (client-safe)
│       ├── local.ts              # in-browser backend: full /api contract,
│       │                         #   localStorage store, run executor, exports
│       └── client.ts             # api wrapper → local backend, router, hooks
├── public/                       # logo, robots, brand assets, source zip
├── next.config.ts                # output: "export" → out/
└── package.json
```

## Deploy as a static site

### Render (Static Site)

1. Push this folder to a GitHub repository.
2. Render dashboard → **New → Static Site** → connect the repo.
3. Build command: `npm install && npm run build`
4. Publish directory: `out`
5. Deploy. Done — no server, no environment variables.

> The earlier `Module not found: Can't resolve '@/components/shared'` deploy
> failure was caused by files going missing between the source zip and the
> repository. This build is verified end-to-end from a clean copy: install →
> build → serve → full product walkthrough. If you re-create the repo, upload
> the complete folder (including `tsconfig.json` — it defines the `@/*`
> import alias).

### GitHub Pages

1. `npm install && npm run build`
2. Publish the `out/` directory (e.g. push it to a `gh-pages` branch).
3. For project sites served under a sub-path (`/repo-name/`), add
   `assetPrefix: "/repo-name"` to `next.config.ts` before building.
   The included `.nojekyll` file keeps GitHub Pages from ignoring the
   `_next/` folder.

### Netlify / Vercel / Cloudflare Pages

- Build command: `npm run build`
- Publish directory: `out`

## Local development

```bash
npm install     # or: bun install
npm run dev     # http://localhost:3000
```

`npm run build` emits the deployable static site into `out/`.
`npm run serve` serves `out/` at http://localhost:4173 for local review.

## Try the full demo

1. Open the deployed site → **Start testing** → create an account (stored
   only in your browser).
2. Your workspace is seeded with the sandbox agent, the 25-case starter
   suite and a labeled simulated sample report.
3. **New test run** → Demo sandbox agent + starter suite → run it for real:
   20 pass / 4 fail / 1 inconclusive (score 80%) with full per-case evidence.
4. Compare runs, edit suites, export JSON/CSV reports, explore Settings.

## Evaluation methodology (unchanged from the full-stack build)

- **Result states** — PASS, FAIL, INCONCLUSIVE, ERROR, NOT_EXECUTED are kept
  strictly distinct; missing evidence is never scored as a pass.
- **Tool verification** — REQUESTED / OBSERVED / CONFIRMED phases; a reply
  claiming an action requires a confirmed tool result to pass.
- **Scoring** — `score = passed ÷ (passed + failed + inconclusive) × 100`;
  errors and not-executed cases are excluded from the denominator but never
  count as passes.

## License / attribution

Demo build of AgentClear. All evaluation logic, sample content and brand
assets are part of the AgentClear project.
