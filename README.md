# AgentClear — AI Agent Testing & Evaluation Platform

**Know your AI agent works before your customers find out.**

AgentClear tests AI agents (first use case: customer-support agents) against
controlled test cases before they reach real customers. It executes real
requests against your agent's API, verifies responses and tool usage with a
three-level evidence model (requested / observed / confirmed), checks safety
behavior (prompt injection, PII protection, unauthorized actions), and
produces evidence-backed reports you can reopen, compare and export.

It is **not** an agent builder — it independently tests agents you already have.

---

## Stack & architecture

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16 (App Router) + TypeScript 5 | single user-facing route `/` with hash-based SPA routing; all backend logic in `/api/*` route handlers |
| Styling | Tailwind CSS 4 + shadcn/ui (New York) | dark-navy "ink" surfaces, indigo accent, light/dark themes (`next-themes`) |
| Database | Prisma ORM + **SQLite** | the deployment target for this build provides SQLite; the schema is portable to PostgreSQL (see *Deploying*) |
| Auth | custom session auth | scrypt password hashing, opaque tokens hashed in DB, httpOnly/sameSite cookies, login rate limiting |
| Execution | in-process server worker | bounded concurrency (2), per-request timeouts, cancellation checkpoints, aggregates computed from **saved** results |
| Validation | zod on every mutating endpoint | strict server-side validation for all external input |

The codebase is deliberately compact — **~50 files** — with modules grouped by
domain instead of many tiny files:

```
src/
  app/
    page.tsx                    # the single user-visible route (SPA)
    layout.tsx                  # root layout, fonts, theme provider, toaster
    globals.css                 # Tailwind 4 theme tokens (ink/indigo/status colors)
    api/[...path]/route.ts      # ALL backend endpoints: one catch-all route handler
                                # (auth, agents, suites, cases, runs, compare, export,
                                # overview, settings, sessions, tokens, account, contact)
  components/
    shared.tsx                  # logo/wordmark, status badges, score ring, diagrams,
                                # theme provider
    marketing.tsx               # public site: home, how-it-works, capabilities,
                                # security, docs, privacy, terms, contact, brand
    app/agentclear-app.tsx      # SPA router (public/auth/app route switching)
    app/shell.tsx               # session context, sidebar shell, new-run dialog,
                                # auth pages, onboarding
    app/views.tsx               # overview, agents (config + connection test), suites
                                # (+ structured case editor)
    app/runs.tsx                # runs list, live run detail, report view, compare,
                                # public sample report
    app/settings.tsx            # workspace/profile settings, API tokens, sessions,
                                # danger zone
    ui/                         # the 10 shadcn/ui primitives actually used
  lib/
    types.ts                    # shared DTOs, enums, labels
    starter-suite.ts            # the 25 seeded test cases + SIMULATED sample report
    evaluator.ts                # pure rule evaluator (client-safe)
    engine.ts                   # agent client (SSRF-guarded HTTP), demo sandbox agent,
                                # run executor (server-side)
    server.ts                   # db client, session auth, AES-256-GCM crypto, SSRF
                                # guard, audit, rate limit, seeding, DTO mappers
    client.ts                   # hash router, fetch wrapper, data hooks, formatters
prisma/schema.prisma            # normalized schema (see below)
public/brand/                   # logo PNGs/SVG, app tile, social card
```

### Data model

Users, Sessions, Workspaces, Memberships, Agents (with encrypted secret),
TestSuites, TestCases, TestRuns, TestResults, **ToolCallEvents**, ApiTokens,
AuditEvents, ContactMessages. Runs snapshot agent/suite names and keep their
evidence when agents or suites are deleted (SetNull), so reports are durable.
Every workspace-scoped query filters by workspace **server-side** — changing
an ID in a request cannot cross workspaces.

---

## Quickstart

```bash
# 1 — install
bun install

# 2 — configure
cp .env.example .env
#    then set ENCRYPTION_KEY (generate one: openssl rand -base64 32)

# 3 — database
bun run db:push        # create the SQLite schema
bun run db:generate    # (re)generate the Prisma client

# 4 — develop
bun run dev            # http://localhost:3000

# 5 — quality gates
bun run lint
bunx tsc --noEmit

# production
bun run build && bun run start
```

Sign up and a workspace is created automatically, seeded with:

- the **demo sandbox agent** — a scripted support bot ("Trailhead Outfitters")
  that runs entirely inside the server (no outbound network calls) and contains
  four deliberate flaws so you can explore real evaluation results immediately;
- the **25-case starter suite** (10 correctness · 8 tool usage · 7 safety), fully editable;
- a **simulated sample run** (84%, labeled `SAMPLE` everywhere) so the UI is
  explorable with zero credentials. Sample records are flagged `isSample` and
  never mixed into real-run metrics.

No email is sent anywhere; no external credentials are needed.

---

## How evaluation works

### Result states (kept strictly distinct)

- **Pass** — every evaluation criterion passed.
- **Fail** — at least one criterion definitively failed.
- **Inconclusive** — evidence for one or more criteria was not available
  (e.g. the agent returned no tool-call trace). Missing evidence is never
  treated as a pass *or* a fail.
- **Error** — execution failure (timeout, HTTP 4xx/5xx, blocked endpoint).
  An API timeout is an infrastructure error, not proof the agent reasons badly.
- **Not executed** — the run was cancelled before this case ran.

### Tool-call verification (the core idea)

1. **Requested** — the agent indicated a tool should be used (no execution proof).
2. **Observed** — a reliable execution trace shows the call occurred.
3. **Confirmed** — a trusted tool result proves the outcome.

A reply claiming “Refund completed” is **not** proof that a refund occurred.
The `claimRequiresConfirmedTool` rule fails any reply that claims identifiers
(ticket/refund ids) which do not appear in a **confirmed** tool result.

### Scoring

```
score = passed / (passed + failed + inconclusive) × 100
```

Errors and not-executed cases are excluded from the denominator but never
count as passes and are always displayed. The 90% pass threshold is a
workspace setting; passing it does **not** certify production safety.

### Request/response contract (fully configurable per agent)

Default body template:

```json
{
  "session_id": "{{session_id}}",
  "messages": {{history_json}}
}
```

Placeholders: `{{session_id}}` (stable per test case), `{{message}}` (current
turn), `{{history_json}}` (full conversation), `{{turn}}` (index). Reply and
tool-calls are extracted via configurable dot paths (`reply`, `tool_calls`).
Reference response shape:

```json
{
  "reply": "string",
  "tool_calls": [
    {
      "phase": "requested | observed | confirmed",
      "name": "get_order",
      "arguments": { "orderId": "ORD-1001" },
      "status": "success | failure | unknown",
      "result": { "found": true },
      "timestamp": "2025-06-14T10:32:14.104Z"
    }
  ]
}
```

Agents that cannot emit tool traces still work — tool rules become
**inconclusive** and the report says so honestly.

### Rules available per test case

`mustInclude` · `mustIncludeAny` · `mustNotInclude` · `mustNotIncludeAny` ·
`mustNotMatch` (regex) · `requiredTool` (phase + argument matching + `before`
ordering) · `forbiddenTool` · `maxToolCalls` · `claimRequiresConfirmedTool`.

All rules are deterministic and inspectable — each outcome shows the exact
criterion, the evidence, and (for failures) a practical recommendation.

---

## Security posture (implemented, not claimed)

- **SSRF guard**: user-configured endpoints are validated server-side —
  private/loopback/link-local/CGNAT/metadata IP ranges blocked (DNS-resolved),
  redirects refused, per-request timeouts, 1 MiB response cap,
  credential-in-URL rejected.
- **Secrets**: agent credentials encrypted at rest with AES-256-GCM
  (`ENCRYPTION_KEY`); never returned to the browser; masked in all logs/evidence.
- **Sessions**: opaque tokens (SHA-256 hashed in DB) in httpOnly, sameSite=lax
  cookies; scrypt password hashing; login/signup rate limiting; per-session revocation.
- **Workspace isolation** enforced in every query path.
- **Read-only API tokens** (shown once, stored hashed) for programmatic report access.
- **Audit log** for agent config, runs, exports, settings and auth events.
- **Sandbox-first**: the bundled demo agent performs no network I/O.
- Disclosed limitations (also on the in-app Security page): no external KMS,
  DNS-rebinding TOCTOU residual risk, no SSO, no third-party audit or
  certification — none are claimed.

**Testing live agents safely:** point AgentClear at staging endpoints, use
dry-run/sandbox tool integrations, and never trigger real refunds, emails or
account changes from tests. You are responsible for what your test runs invoke.

---

## Deployment notes

- Requires a Node host that can run Next.js API routes, access the database,
  and keep the process alive for run execution (e.g. a VM, container, or
  long-running serverless with warm instances). A static-only host is **not**
  sufficient.
- **SQLite** (this build): set `DATABASE_URL=file:...` and give the runtime
  write access to the DB file. **PostgreSQL** (port): change the datasource
  provider in `prisma/schema.prisma` and run `bunx prisma migrate dev` — no
  code changes required.
- Set a strong `ENCRYPTION_KEY` (32 bytes, base64) before storing any real
  agent credentials. Rotating it invalidates previously stored secrets.
- Run retention is enforced per workspace (`retentionDays` in Settings).
- PDF export is intentionally not implemented (JSON + CSV are); see
  *Limitations*.

## Limitations

- Execution runs in the Next.js process (no distributed queue); very large
  suites on a single node are bounded by the server.
- Evaluation is deterministic-rules only in this release; an optional
  LLM-based semantic evaluator is planned but not enabled, so nothing
  model-generated affects scores today.
- No email delivery (contact messages are stored locally only).
- Multi-user collaboration exists at the data-model level (memberships) but
  the UI manages a single owner per workspace in this release.

## Feature checklist

Public site (home, how it works, capabilities, sample report, security, docs,
privacy, terms, contact) · sign-up/sign-in/logout with rate limiting ·
onboarding · workspace seeding (sandbox agent + 25-case starter suite +
labeled sample run) · agent CRUD with SSRF validation, encrypted secrets,
connection testing, enable/disable · suite & case editor with rule builder ·
real run execution with live progress, bounded concurrency, cancellation ·
result states pass/fail/inconclusive/error/not-executed · tool-call evidence
(requested/observed/confirmed) · reports with filters, per-case evidence,
recommendations · run comparison with regression detection · JSON/CSV export ·
read-only API tokens · session management · workspace/account deletion ·
retention enforcement · audit log · light/dark themes · responsive (mobile
verified) · sticky footer on public pages.
