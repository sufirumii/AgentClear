"use client";
/**
 * AgentClear — local demo backend (static build).
 *
 * This module implements the full AgentClear API surface entirely in the
 * browser so the product can be deployed as a STATIC SITE (no Node server,
 * no database). It mirrors the server build's /api contract handler-for-
 * handler and response-for-response:
 *
 *  - Custom-session auth (localStorage-backed, single-browser demo accounts)
 *  - Workspace-scoped CRUD for agents, suites and test cases
 *  - REAL client-side test execution against the internal demo sandbox
 *    agent through the genuine rule evaluator (same 25-case starter suite,
 *    same PASS/FAIL/INCONCLUSIVE evidence)
 *  - Live run progress, cancellation and NOT_EXECUTED handling
 *  - Overview stats, run comparison, JSON/CSV report exports
 *  - Settings, API tokens, sessions and account/workspace deletion
 *
 * Disclosed differences from the server build:
 *  - Data lives in this browser's localStorage only (no multi-user sharing)
 *  - CUSTOM_HTTP agents cannot be executed or connection-tested from a
 *    static site (the server build's SSRF-guarded outbound requests are
 *    not possible client-side); the sandbox agent is fully supported.
 *  - Passwords are stored locally in plain text — this is a demo, not a
 *    real auth system. The server build uses scrypt + DB-backed sessions.
 */

import {
  DEFAULT_BODY_TEMPLATE,
  buildHistory,
  mapToolCalls,
  renderTemplate,
  runDemoAgent,
} from "@/lib/demo-agent";
import { computeRunStats, evaluateCase } from "@/lib/evaluator";
import {
  STARTER_SUITE,
  STARTER_SUITE_DESCRIPTION,
  STARTER_SUITE_NAME,
  buildSampleRunDetail,
} from "@/lib/starter-suite";
import {
  AgentDTO,
  ApiTokenDTO,
  AuthSessionDTO,
  CaseResultDTO,
  CompareDTO,
  ConnectionTestResultDTO,
  OverviewDTO,
  ResultStatus,
  RunDetailDTO,
  RunSummaryDTO,
  SessionInfoDTO,
  SuiteDetail,
  SuiteSummary,
  TestCaseData,
  ToolEventDTO,
  TurnEvidenceDTO,
  WorkspaceDTO,
} from "@/lib/types";

/* ========================================================================== */
/* Errors                                                                     */
/* ========================================================================== */

class LocalApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "LocalApiError";
    this.status = status;
  }
}

/* ========================================================================== */
/* Store — persisted to localStorage, always held in memory                  */
/* ========================================================================== */

const STORE_KEY = "agentclear.demo.v1";
const TOKEN_KEY = "agentclear.demo.token";
/** Mirrors the client api() wrapper's workspace key (client.ts owns it). */
const WORKSPACE_KEY = "agentclear.workspace";

interface UserRow {
  id: string;
  name: string;
  email: string;
  /** Demo only — plain text, never leaves this browser. */
  password: string;
  createdAt: string;
}

interface SessionRow {
  id: string;
  token: string;
  userId: string;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
}

interface WorkspaceRow {
  id: string;
  name: string;
  passThreshold: number;
  retentionDays: number;
  createdAt: string;
  updatedAt: string;
}

interface MembershipRow {
  userId: string;
  workspaceId: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  createdAt: string;
}

interface AgentRow {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  type: "DEMO_SANDBOX" | "CUSTOM_HTTP";
  endpointUrl: string | null;
  method: string;
  headersJson: string;
  bodyTemplate: string;
  responseField: string;
  toolCallsField: string;
  authType: "NONE" | "BEARER" | "HEADER" | "BASIC";
  authHeaderName: string | null;
  secret: string | null;
  timeoutMs: number;
  expectedContentType: "JSON" | "TEXT";
  status: "ACTIVE" | "DISABLED";
  connectionStatus: "UNKNOWN" | "CONNECTED" | "FAILED";
  lastTestedAt: string | null;
  lastTestResultJson: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SuiteRow {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  isStarter: boolean;
  tagsCsv: string;
  createdAt: string;
  updatedAt: string;
}

interface CaseRow {
  id: string;
  suiteId: string;
  displayId: string;
  orderIndex: number;
  category: string;
  severity: string;
  title: string;
  description: string;
  turnsJson: string;
  expectedBehavior: string;
  evidenceNote: string;
  rulesJson: string;
  failureHint: string | null;
  tagsCsv: string;
}

interface RunRow {
  id: string;
  workspaceId: string;
  agentId: string | null;
  suiteId: string | null;
  agentNameSnapshot: string;
  agentTypeSnapshot: string;
  suiteNameSnapshot: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  isSample: boolean;
  totalCases: number;
  progress: number;
  passed: number;
  failed: number;
  inconclusive: number;
  errored: number;
  notExecuted: number;
  score: number | null;
  categoriesJson: string;
  cancelRequested: boolean;
  failureMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
}

interface ResultRow {
  id: string;
  runId: string;
  caseId: string;
  displayId: string;
  orderIndex: number;
  category: string;
  severity: string;
  title: string;
  status: string;
  explanation: string;
  recommendation: string | null;
  observedReply: string | null;
  expectedBehavior: string;
  evidenceNote: string;
  failureHint: string | null;
  turnsEvidenceJson: string;
  ruleOutcomesJson: string;
  durationMs: number | null;
}

interface ToolEventRow {
  id: string;
  resultId: string;
  phase: string;
  name: string;
  argumentsJson: string | null;
  status: string;
  resultJson: string | null;
  timestamp: string | null;
  orderIndex: number;
  turnIndex: number | null;
}

interface TokenRow {
  id: string;
  workspaceId: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

interface ContactRow {
  id: string;
  email: string;
  message: string;
  createdAt: string;
}

interface Store {
  users: UserRow[];
  sessions: SessionRow[];
  workspaces: WorkspaceRow[];
  memberships: MembershipRow[];
  agents: AgentRow[];
  suites: SuiteRow[];
  cases: CaseRow[];
  runs: RunRow[];
  results: ResultRow[];
  toolEvents: ToolEventRow[];
  tokens: TokenRow[];
  contactMessages: ContactRow[];
}

function emptyStore(): Store {
  return {
    users: [],
    sessions: [],
    workspaces: [],
    memberships: [],
    agents: [],
    suites: [],
    cases: [],
    runs: [],
    results: [],
    toolEvents: [],
    tokens: [],
    contactMessages: [],
  };
}

let store: Store | null = null;

function db(): Store {
  if (store) return store;
  if (typeof window === "undefined") {
    // SSR/prerender — nothing persisted, nothing readable.
    store = emptyStore();
    return store;
  }
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    store = raw ? { ...emptyStore(), ...(JSON.parse(raw) as Store) } : emptyStore();
  } catch {
    store = emptyStore();
  }
  return store;
}

/** Persist the store; prune old runs if the localStorage quota is hit. */
function save(): void {
  if (typeof window === "undefined") return;
  const s = db();
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(s));
      return;
    } catch {
      // Quota exceeded — drop the oldest non-sample runs (with their
      // results and tool events) and retry.
      const idx = s.runs.findIndex((r) => !r.isSample);
      if (idx === -1) return; // nothing more to prune; stay in memory
      const victim = s.runs[idx];
      s.runs = s.runs.filter((r) => r.id !== victim.id);
      const victimResultIds = new Set(
        s.results.filter((r) => r.runId === victim.id).map((r) => r.id)
      );
      s.results = s.results.filter((r) => r.runId !== victim.id);
      s.toolEvents = s.toolEvents.filter((e) => !victimResultIds.has(e.resultId));
    }
  }
}

/* ========================================================================== */
/* Ids, tokens, dates                                                         */
/* ========================================================================== */

function uid(): string {
  // Dash-free ids (like the server build's database ids) — some UI routes
  // parse ids out of the hash with [a-z0-9]+ patterns, so dashes would be
  // truncated.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

function randomToken(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

const nowIso = () => new Date().toISOString();

/* ========================================================================== */
/* Session helpers                                                            */
/* ========================================================================== */

function readToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

function setToken(token: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
}

interface AuthContext {
  userId: string;
  email: string;
  name: string;
}

function getAuth(): AuthContext | null {
  const token = readToken();
  if (!token) return null;
  const session = db().sessions.find((s) => s.token === token);
  if (!session) return null;
  const user = db().users.find((u) => u.id === session.userId);
  if (!user) return null;
  session.lastSeenAt = nowIso(); // in-memory only; persisted on next save()
  return { userId: user.id, email: user.email, name: user.name };
}

function createSession(userId: string): SessionRow {
  const row: SessionRow = {
    id: uid(),
    token: randomToken(24),
    userId,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null,
    createdAt: nowIso(),
    lastSeenAt: nowIso(),
  };
  db().sessions.push(row);
  setToken(row.token);
  return row;
}

function requireSession(): AuthContext {
  const auth = getAuth();
  if (!auth) throw new LocalApiError("Authentication required.", 401);
  return auth;
}

interface WorkspaceContext extends AuthContext {
  workspaceId: string;
  workspaceName: string;
  role: string;
}

/**
 * Resolve the active workspace: X-Workspace-Id (read from the same
 * localStorage key the client api() wrapper uses) when valid, else the
 * user's first membership. Cross-workspace ids are rejected.
 */
function requireWorkspaceContext(): WorkspaceContext {
  const auth = requireSession();
  const s = db();
  const memberships = s.memberships
    .filter((m) => m.userId === auth.userId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (memberships.length === 0) {
    throw new LocalApiError("No workspace found for this account.", 404);
  }
  const headerId =
    typeof window === "undefined" ? null : window.localStorage.getItem(WORKSPACE_KEY);
  let membership = headerId
    ? memberships.find((m) => m.workspaceId === headerId) ?? null
    : null;
  if (!membership && !headerId) membership = memberships[0];
  if (!membership) {
    throw new LocalApiError("You don't have access to this workspace.", 403);
  }
  const workspace = s.workspaces.find((w) => w.id === membership!.workspaceId)!;
  return {
    ...auth,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    role: membership.role,
  };
}

function workspaceThreshold(workspaceId: string): number {
  return db().workspaces.find((w) => w.id === workspaceId)?.passThreshold ?? 90;
}

/* ========================================================================== */
/* Validation (mirrors the server's zod schemas and messages)                 */
/* ========================================================================== */

const EMAIL_RE = /^\S+@\S+\.\S+$/;

function vString(
  value: unknown,
  field: string,
  opts: { required?: string; min?: number; max?: number } = {}
): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (opts.required && s.length === 0) throw new LocalApiError(opts.required, 422);
  if (opts.min && s.length < opts.min) {
    throw new LocalApiError(`${field} must be at least ${opts.min} characters.`, 422);
  }
  if (opts.max && s.length > opts.max) {
    throw new LocalApiError(`${field} must be at most ${opts.max} characters.`, 422);
  }
  return s;
}

function assertEndpointUrl(raw: unknown): string {
  const url = typeof raw === "string" ? raw.trim() : "";
  if (!url) throw new LocalApiError("An endpoint URL is required for HTTP agents.", 422);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new LocalApiError("The endpoint URL is not a valid absolute URL.", 422);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new LocalApiError("The endpoint URL must use http or https.", 422);
  }
  const host = parsed.hostname.toLowerCase();
  const privateHost =
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === "[::1]" ||
    host === "metadata.google.internal";
  if (privateHost) {
    throw new LocalApiError(
      "The endpoint URL points to a private, loopback or metadata address, which is not allowed.",
      422
    );
  }
  return url.slice(0, 2000);
}

/* ========================================================================== */
/* DTO mappers                                                                */
/* ========================================================================== */

function mapAgentRow(row: AgentRow): AgentDTO {
  let headers: Record<string, string> = {};
  try {
    headers = JSON.parse(row.headersJson || "{}");
  } catch {
    headers = {};
  }
  let lastTestResult: AgentDTO["lastTestResult"] = null;
  try {
    lastTestResult = row.lastTestResultJson ? JSON.parse(row.lastTestResultJson) : null;
  } catch {
    lastTestResult = null;
  }
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: "CUSTOMER_SUPPORT",
    type: row.type,
    endpointUrl: row.endpointUrl,
    method: row.method,
    headers,
    bodyTemplate: row.bodyTemplate,
    responseField: row.responseField,
    toolCallsField: row.toolCallsField,
    authType: row.authType,
    authHeaderName: row.authHeaderName,
    hasSecret: Boolean(row.secret),
    timeoutMs: row.timeoutMs,
    expectedContentType: row.expectedContentType,
    status: row.status,
    connectionStatus: row.connectionStatus,
    lastTestedAt: row.lastTestedAt,
    lastTestResult,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapCaseRow(row: CaseRow): TestCaseData {
  return {
    id: row.displayId,
    dbId: row.id,
    order: row.orderIndex,
    category: row.category as TestCaseData["category"],
    severity: row.severity as TestCaseData["severity"],
    title: row.title,
    description: row.description,
    turns: JSON.parse(row.turnsJson || "[]"),
    expectedBehavior: row.expectedBehavior,
    evidence: row.evidenceNote,
    rules: JSON.parse(row.rulesJson || "[]"),
    failureHint: row.failureHint ?? undefined,
    tags: row.tagsCsv ? row.tagsCsv.split(",").filter(Boolean) : [],
  };
}

function suiteSummary(row: SuiteRow): SuiteSummary {
  const caseCount = db().cases.filter((c) => c.suiteId === row.id).length;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isStarter: row.isStarter,
    caseCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function loadSuiteDetail(suiteId: string, workspaceId: string): SuiteDetail | null {
  const s = db();
  const suite = s.suites.find((x) => x.id === suiteId && x.workspaceId === workspaceId);
  if (!suite) return null;
  const cases = s.cases
    .filter((c) => c.suiteId === suite.id)
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map(mapCaseRow);
  return {
    id: suite.id,
    name: suite.name,
    description: suite.description,
    isStarter: suite.isStarter,
    caseCount: cases.length,
    createdAt: suite.createdAt,
    updatedAt: suite.updatedAt,
    cases,
  };
}

const EMPTY_CATEGORIES = {
  CORRECTNESS: { total: 0, passed: 0, failed: 0, inconclusive: 0, errored: 0, notExecuted: 0 },
  TOOL_USAGE: { total: 0, passed: 0, failed: 0, inconclusive: 0, errored: 0, notExecuted: 0 },
  SAFETY: { total: 0, passed: 0, failed: 0, inconclusive: 0, errored: 0, notExecuted: 0 },
};

function mapRunSummary(row: RunRow, threshold: number): RunSummaryDTO {
  let categories: RunSummaryDTO["categories"];
  try {
    categories = { ...EMPTY_CATEGORIES, ...JSON.parse(row.categoriesJson || "{}") };
  } catch {
    categories = { ...EMPTY_CATEGORIES };
  }
  const s = db();
  const agent = row.agentId ? s.agents.find((a) => a.id === row.agentId) : undefined;
  const suite = row.suiteId ? s.suites.find((x) => x.id === row.suiteId) : undefined;
  const evaluated = row.passed + row.failed + row.inconclusive;
  return {
    id: row.id,
    agentId: agent?.id ?? "deleted",
    agentName: agent?.name ?? row.agentNameSnapshot ?? "Deleted agent",
    agentType: (agent?.type ?? row.agentTypeSnapshot) as RunSummaryDTO["agentType"],
    suiteId: suite?.id ?? "deleted",
    suiteName: suite?.name ?? row.suiteNameSnapshot ?? "Deleted suite",
    status: row.status,
    isSample: row.isSample,
    total: row.totalCases,
    executed: evaluated,
    passed: row.passed,
    failed: row.failed,
    inconclusive: row.inconclusive,
    errored: row.errored,
    notExecuted: row.notExecuted,
    score: row.score,
    threshold,
    startedAt: row.startedAt ?? new Date(0).toISOString(),
    completedAt: row.completedAt,
    durationMs: row.durationMs,
    createdBy: row.createdByName || row.createdByUserId,
    categories,
  };
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

function mapRunDetail(runId: string, threshold: number): RunDetailDTO | null {
  const s = db();
  const row = s.runs.find((r) => r.id === runId);
  if (!row) return null;

  const results: CaseResultDTO[] = s.results
    .filter((r) => r.runId === runId)
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((r) => {
      let turns: TurnEvidenceDTO[] = [];
      try {
        turns = JSON.parse(r.turnsEvidenceJson || "[]");
      } catch {
        turns = [];
      }
      let ruleOutcomes: CaseResultDTO["ruleOutcomes"] = [];
      try {
        ruleOutcomes = JSON.parse(r.ruleOutcomesJson || "[]");
      } catch {
        ruleOutcomes = [];
      }
      const toolEvents: ToolEventDTO[] = s.toolEvents
        .filter((e) => e.resultId === r.id)
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((e) => {
          const args = e.argumentsJson ? safeParse(e.argumentsJson) : undefined;
          return {
            phase: e.phase as ToolEventDTO["phase"],
            name: e.name,
            arguments:
              args && typeof args === "object" && !Array.isArray(args)
                ? (args as Record<string, unknown>)
                : undefined,
            status: e.status as ToolEventDTO["status"],
            result: e.resultJson ? safeParse(e.resultJson) : undefined,
            timestamp: e.timestamp ?? undefined,
            turn: e.turnIndex ?? undefined,
          };
        });
      return {
        caseId: r.displayId,
        order: r.orderIndex,
        title: r.title,
        category: r.category as CaseResultDTO["category"],
        severity: r.severity as CaseResultDTO["severity"],
        status: r.status as CaseResultDTO["status"],
        explanation: r.explanation,
        recommendation: r.recommendation ?? undefined,
        observedReply: r.observedReply ?? undefined,
        expectedBehavior: r.expectedBehavior,
        evidence: r.evidenceNote,
        failureHint: r.failureHint ?? undefined,
        turns,
        toolEvents,
        ruleOutcomes,
        durationMs: r.durationMs ?? undefined,
      };
    });

  const summary = mapRunSummary(row, threshold);
  return {
    ...summary,
    results,
    limitations: [
      "Score = passed ÷ (pass + fail + inconclusive). Execution errors and not-executed cases are excluded from the denominator but never count as passes.",
      row.isSample
        ? "This is SIMULATED SAMPLE data — no agent was executed and no HTTP requests were sent."
        : "Tool verification depends on the agent returning a tool-call trace. Missing traces are reported as inconclusive, never as passes.",
      `The ${threshold}% pass threshold is a workspace configuration and does not certify production safety.`,
    ],
  };
}

/* ========================================================================== */
/* Workspace seeding — same three artifacts as the server build               */
/* ========================================================================== */

function seedWorkspace(workspaceId: string, ownerId: string, ownerName: string) {
  const s = db();

  /* 1 — demo sandbox agent */
  const agent: AgentRow = {
    id: uid(),
    workspaceId,
    name: "Demo sandbox agent — Retail support",
    description:
      'A fully internal, scripted customer-support agent ("Trailhead Outfitters"). It makes no network calls and deliberately contains four realistic flaws so you can explore real evaluation results without connecting a production agent.',
    type: "DEMO_SANDBOX",
    endpointUrl: null,
    method: "POST",
    headersJson: "{}",
    bodyTemplate: DEFAULT_BODY_TEMPLATE,
    responseField: "reply",
    toolCallsField: "tool_calls",
    authType: "NONE",
    authHeaderName: null,
    secret: null,
    timeoutMs: 15000,
    expectedContentType: "JSON",
    status: "ACTIVE",
    connectionStatus: "CONNECTED",
    lastTestedAt: nowIso(),
    lastTestResultJson: JSON.stringify({
      ok: true,
      statusCode: 200,
      durationMs: 118,
      replyPreview:
        "Hello! This is the Trailhead Outfitters support sandbox. Connection successful — how can I help you today?",
      testedAt: nowIso(),
      note: "Internal sandbox — no network request was made.",
    }),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  s.agents.push(agent);

  /* 2 — starter suite with 25 cases */
  const suite: SuiteRow = {
    id: uid(),
    workspaceId,
    name: STARTER_SUITE_NAME,
    description: STARTER_SUITE_DESCRIPTION,
    isStarter: true,
    tagsCsv: "customer-support,starter",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  s.suites.push(suite);
  for (const c of STARTER_SUITE) {
    s.cases.push({
      id: uid(),
      suiteId: suite.id,
      displayId: c.id,
      orderIndex: c.order,
      category: c.category,
      severity: c.severity,
      title: c.title,
      description: c.description,
      turnsJson: JSON.stringify(c.turns),
      expectedBehavior: c.expectedBehavior,
      evidenceNote: c.evidence,
      rulesJson: JSON.stringify(c.rules),
      failureHint: c.failureHint ?? null,
      tagsCsv: (c.tags ?? []).join(","),
    });
  }

  /* 3 — simulated sample run (clearly labeled, isolated from real runs) */
  const sample = buildSampleRunDetail();
  const run: RunRow = {
    id: uid(),
    workspaceId,
    agentId: agent.id,
    suiteId: suite.id,
    agentNameSnapshot: agent.name,
    agentTypeSnapshot: "DEMO_SANDBOX",
    suiteNameSnapshot: suite.name,
    status: "COMPLETED",
    isSample: true,
    totalCases: sample.total,
    progress: sample.total,
    passed: sample.passed,
    failed: sample.failed,
    inconclusive: sample.inconclusive,
    errored: sample.errored,
    notExecuted: sample.notExecuted,
    score: sample.score,
    categoriesJson: JSON.stringify(sample.categories),
    cancelRequested: false,
    failureMessage: null,
    startedAt: sample.startedAt,
    completedAt: sample.completedAt,
    durationMs: sample.durationMs,
    createdByUserId: ownerId,
    createdByName: ownerName,
    createdAt: nowIso(),
  };
  s.runs.push(run);
  for (const r of sample.results) {
    const resultId = uid();
    s.results.push({
      id: resultId,
      runId: run.id,
      caseId: `sample-${r.caseId}`,
      displayId: r.caseId,
      orderIndex: r.order,
      category: r.category,
      severity: r.severity,
      title: r.title,
      status: r.status,
      explanation: r.explanation,
      recommendation: r.recommendation ?? null,
      observedReply: r.observedReply ?? null,
      expectedBehavior: r.expectedBehavior,
      evidenceNote: r.evidence,
      failureHint: r.failureHint ?? null,
      turnsEvidenceJson: JSON.stringify(r.turns),
      ruleOutcomesJson: JSON.stringify(r.ruleOutcomes),
      durationMs: r.durationMs ?? null,
    });
    (r.toolEvents ?? []).forEach((e, idx) => {
      s.toolEvents.push({
        id: uid(),
        resultId,
        phase: e.phase,
        name: e.name,
        argumentsJson: e.arguments ? JSON.stringify(e.arguments) : null,
        status: e.status,
        resultJson: e.result !== undefined ? JSON.stringify(e.result) : null,
        timestamp: e.timestamp ?? null,
        orderIndex: idx,
        turnIndex: e.turn ?? null,
      });
    });
  }
}

/* ========================================================================== */
/* Client-side run executor                                                   */
/* ========================================================================== */

const CONCURRENCY = 2;
const runningRuns = new Set<string>();
const MAX_RESPONSE_STORE = 8 * 1024;

interface TurnExecution {
  statusCode: number;
  durationMs: number;
  responseRaw: string;
  truncated: boolean;
  reply: string | null;
  toolCallsPresent: boolean;
  toolEvents: ToolEventDTO[];
  error: string | null;
}

/**
 * Client-side turn execution. The sandbox agent is fully real (scripted,
 * no network). CUSTOM_HTTP agents cannot be reached from a static site —
 * those turns end in a clear execution error, exactly like a server-side
 * infrastructure failure would.
 */
async function executeTurnLocal(
  agent: { type: string; bodyTemplate: string; responseField: string },
  renderedBody: string
): Promise<TurnExecution> {
  const started = Date.now();

  if (agent.type === "DEMO_SANDBOX") {
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(renderedBody);
    } catch {
      return {
        statusCode: 0,
        durationMs: 0,
        responseRaw: "",
        truncated: false,
        reply: null,
        toolCallsPresent: false,
        toolEvents: [],
        error:
          "The rendered request body is not valid JSON. Fix the agent's request body template.",
      };
    }
    const res = await runDemoAgent(parsedBody);
    const durationMs = Date.now() - started;
    if (res.status !== 200) {
      const errMsg = (res.body as { error?: string }).error ?? "Sandbox agent rejected the request.";
      return {
        statusCode: res.status,
        durationMs,
        responseRaw: JSON.stringify(res.body).slice(0, MAX_RESPONSE_STORE),
        truncated: false,
        reply: null,
        toolCallsPresent: false,
        toolEvents: [],
        error: errMsg,
      };
    }
    const body = res.body as { reply?: unknown; tool_calls?: unknown };
    const reply = typeof body.reply === "string" ? body.reply : null;
    const toolCallsPresent = "tool_calls" in body;
    const { events } = mapToolCalls(body.tool_calls);
    const raw = JSON.stringify(body);
    return {
      statusCode: 200,
      durationMs,
      responseRaw: raw.slice(0, MAX_RESPONSE_STORE),
      truncated: raw.length > MAX_RESPONSE_STORE,
      reply,
      toolCallsPresent,
      toolEvents: events,
      error: null,
    };
  }

  return {
    statusCode: 0,
    durationMs: Date.now() - started,
    responseRaw: "",
    truncated: false,
    reply: null,
    toolCallsPresent: false,
    toolEvents: [],
    error:
      "HTTP agent execution requires the full-stack AgentClear server build (SSRF-guarded outbound requests). This static demo executes the internal sandbox agent only.",
  };
}

async function executeCaseLocal(
  agent: { type: string; bodyTemplate: string; responseField: string },
  caseData: TestCaseData
): Promise<CaseResultDTO> {
  const userTurns = caseData.turns.map((t) => t.user);
  const turnsEvidence: TurnEvidenceDTO[] = [];
  const toolEvents: ToolEventDTO[] = [];
  const assistantReplies: string[] = [];
  let traceAvailable = true;
  let executionError: string | null = null;
  let finalReply: string | null = null;
  let totalDuration = 0;

  for (let i = 0; i < userTurns.length; i++) {
    const history = buildHistory(userTurns, assistantReplies, i);
    const vars = {
      session_id: `case-${caseData.id.toLowerCase()}`,
      message: userTurns[i],
      history_json: JSON.stringify(history),
      turn: String(i),
    };
    const rendered = renderTemplate(agent.bodyTemplate, vars);

    const turn = await executeTurnLocal(agent, rendered);
    totalDuration += turn.durationMs;

    if (turn.error) {
      executionError = turn.error;
      turnsEvidence.push({
        turnIndex: i,
        userMessage: userTurns[i],
        requestPreview: rendered.slice(0, 4000),
        statusCode: turn.statusCode,
        durationMs: turn.durationMs,
        responsePreview: turn.responseRaw || undefined,
        parseError: turn.error,
      });
      break;
    }

    if (!turn.toolCallsPresent) traceAvailable = false;
    if (turn.reply !== null) assistantReplies.push(turn.reply);
    finalReply = turn.reply;
    for (const ev of turn.toolEvents) {
      toolEvents.push({ ...ev, turn: i });
    }

    turnsEvidence.push({
      turnIndex: i,
      userMessage: userTurns[i],
      requestPreview: rendered.slice(0, 4000),
      statusCode: turn.statusCode,
      durationMs: turn.durationMs,
      responsePreview: turn.responseRaw || undefined,
    });
  }

  let status: CaseResultDTO["status"];
  let explanation: string;
  let recommendation: string | undefined;
  let ruleOutcomes: CaseResultDTO["ruleOutcomes"] = [];

  if (executionError) {
    status = "ERROR";
    explanation = `Execution error: ${executionError} This is an infrastructure or integration error — it is not evidence about the agent's reasoning.`;
  } else {
    const evaluation = evaluateCase(caseData, finalReply, toolEvents, traceAvailable);
    status = evaluation.status;
    explanation = evaluation.explanation;
    recommendation = evaluation.recommendation;
    ruleOutcomes = evaluation.outcomes;
    if (finalReply === null) {
      explanation = `The agent reply could not be extracted from the response using the configured response field ("${agent.responseField || "reply"}"). ${explanation}`;
    }
  }

  return {
    caseId: caseData.id,
    order: caseData.order,
    title: caseData.title,
    category: caseData.category,
    severity: caseData.severity,
    status,
    explanation,
    recommendation,
    observedReply: finalReply ?? undefined,
    expectedBehavior: caseData.expectedBehavior,
    evidence: caseData.evidence,
    failureHint: caseData.failureHint,
    turns: turnsEvidence,
    toolEvents,
    ruleOutcomes,
    durationMs: totalDuration > 0 ? totalDuration : undefined,
  };
}

function persistResultLocal(runId: string, result: CaseResultDTO) {
  const s = db();
  const caseRow = s.cases.find((c) => c.displayId === result.caseId);
  const resultId = uid();
  s.results.push({
    id: resultId,
    runId,
    caseId: caseRow?.id ?? result.caseId,
    displayId: result.caseId,
    orderIndex: result.order,
    category: result.category,
    severity: result.severity,
    title: result.title,
    status: result.status,
    explanation: result.explanation.slice(0, 8000),
    recommendation: result.recommendation?.slice(0, 4000) ?? null,
    observedReply: result.observedReply?.slice(0, 20000) ?? null,
    expectedBehavior: result.expectedBehavior,
    evidenceNote: result.evidence,
    failureHint: result.failureHint ?? null,
    turnsEvidenceJson: JSON.stringify(result.turns).slice(0, 100000),
    ruleOutcomesJson: JSON.stringify(result.ruleOutcomes).slice(0, 50000),
    durationMs: result.durationMs ?? null,
  });
  result.toolEvents.forEach((e, idx) => {
    s.toolEvents.push({
      id: uid(),
      resultId,
      phase: e.phase,
      name: e.name,
      argumentsJson: e.arguments ? JSON.stringify(e.arguments).slice(0, 5000) : null,
      status: e.status,
      resultJson: e.result !== undefined ? JSON.stringify(e.result).slice(0, 5000) : null,
      timestamp: e.timestamp ?? null,
      orderIndex: idx,
      turnIndex: e.turn ?? null,
    });
  });
}

function finalizeRunLocal(runId: string, startedAt: number, cancelled: boolean) {
  const s = db();
  const results = s.results
    .filter((r) => r.runId === runId)
    .sort((a, b) => a.orderIndex - b.orderIndex);
  const asDto: CaseResultDTO[] = results.map((r) => ({
    caseId: r.displayId,
    order: r.orderIndex,
    title: r.title,
    category: r.category as CaseResultDTO["category"],
    severity: r.severity as CaseResultDTO["severity"],
    status: r.status as CaseResultDTO["status"],
    explanation: r.explanation,
    recommendation: r.recommendation ?? undefined,
    observedReply: r.observedReply ?? undefined,
    expectedBehavior: r.expectedBehavior,
    evidence: r.evidenceNote,
    failureHint: r.failureHint ?? undefined,
    turns: [],
    toolEvents: [],
    ruleOutcomes: [],
    durationMs: r.durationMs ?? undefined,
  }));
  const stats = computeRunStats(asDto);
  const run = s.runs.find((r) => r.id === runId);
  if (!run) return;
  run.status = cancelled ? "CANCELLED" : "COMPLETED";
  run.passed = stats.passed;
  run.failed = stats.failed;
  run.inconclusive = stats.inconclusive;
  run.errored = stats.errored;
  run.notExecuted = stats.notExecuted;
  run.score = stats.score;
  run.categoriesJson = JSON.stringify(stats.categories);
  run.completedAt = nowIso();
  run.durationMs = Date.now() - startedAt;
  run.totalCases = results.length;
  save();

  // Retention enforcement (same rule as the server build).
  const ws = s.workspaces.find((w) => w.id === run.workspaceId);
  if (ws && ws.retentionDays > 0) {
    const cutoff = Date.now() - ws.retentionDays * 86400000;
    const expired = s.runs.filter(
      (r) => !r.isSample && r.workspaceId === ws.id && new Date(r.createdAt).getTime() < cutoff
    );
    if (expired.length > 0) {
      const expiredIds = new Set(expired.map((r) => r.id));
      s.runs = s.runs.filter((r) => !expiredIds.has(r.id));
      const resultIds = new Set(
        s.results.filter((r) => expiredIds.has(r.runId)).map((r) => r.id)
      );
      s.results = s.results.filter((r) => !expiredIds.has(r.runId));
      s.toolEvents = s.toolEvents.filter((e) => !resultIds.has(e.resultId));
      save();
    }
  }
}

/**
 * The real client-side execution workflow: bounded concurrency, live
 * progress persisted after every case, cancellation between cases and
 * NOT_EXECUTED rows for the remainder — identical to the server executor.
 */
async function executeRunLocal(runId: string): Promise<void> {
  if (runningRuns.has(runId)) return;
  runningRuns.add(runId);
  try {
    const s = db();
    const run = s.runs.find((r) => r.id === runId);
    if (!run || run.isSample) return;

    const agentRow = run.agentId ? s.agents.find((a) => a.id === run.agentId) : undefined;
    const suiteRow = run.suiteId ? s.suites.find((x) => x.id === run.suiteId) : undefined;
    if (!agentRow || !suiteRow) {
      run.status = "FAILED";
      run.failureMessage =
        "The agent or suite for this run was deleted before execution started.";
      run.completedAt = nowIso();
      save();
      return;
    }

    const cases = s.cases
      .filter((c) => c.suiteId === suiteRow.id)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map(
        (row): TestCaseData => ({
          id: row.displayId,
          order: row.orderIndex,
          category: row.category as TestCaseData["category"],
          severity: row.severity as TestCaseData["severity"],
          title: row.title,
          description: row.description,
          turns: JSON.parse(row.turnsJson || "[]"),
          expectedBehavior: row.expectedBehavior,
          evidence: row.evidenceNote,
          rules: JSON.parse(row.rulesJson || "[]"),
          failureHint: row.failureHint ?? undefined,
        })
      );

    run.status = "RUNNING";
    run.startedAt = nowIso();
    run.totalCases = cases.length;
    run.progress = 0;
    run.passed = 0;
    run.failed = 0;
    run.inconclusive = 0;
    run.errored = 0;
    run.notExecuted = 0;
    save();

    const startedAt = Date.now();
    let cursor = 0;
    let cancelled = false;

    const agent = {
      type: agentRow.type,
      bodyTemplate: agentRow.bodyTemplate || DEFAULT_BODY_TEMPLATE,
      responseField: agentRow.responseField,
    };

    const worker = async () => {
      for (;;) {
        if (cancelled) return;
        const current = s.runs.find((r) => r.id === runId);
        if (!current || current.cancelRequested) {
          cancelled = true;
          return;
        }
        const idx = cursor++;
        if (idx >= cases.length) return;
        const result = await executeCaseLocal(agent, cases[idx]);
        persistResultLocal(runId, result);
        const r = s.runs.find((x) => x.id === runId);
        if (r) r.progress += 1;
        save();
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, Math.max(1, cases.length)) }, () =>
        worker().catch(() => {
          cancelled = true;
        })
      )
    );

    if (cancelled) {
      const doneIds = new Set(s.results.filter((r) => r.runId === runId).map((r) => r.caseId));
      for (const row of s.cases.filter((c) => c.suiteId === suiteRow.id)) {
        if (!doneIds.has(row.id)) {
          s.results.push({
            id: uid(),
            runId,
            caseId: row.id,
            displayId: row.displayId,
            orderIndex: row.orderIndex,
            category: row.category,
            severity: row.severity,
            title: row.title,
            status: "NOT_EXECUTED",
            explanation: "Run cancelled before this case executed.",
            expectedBehavior: row.expectedBehavior,
            evidenceNote: row.evidenceNote,
            failureHint: row.failureHint,
            turnsEvidenceJson: "[]",
            ruleOutcomesJson: "[]",
            durationMs: null,
            recommendation: null,
            observedReply: null,
          });
          const r = s.runs.find((x) => x.id === runId);
          if (r) r.progress += 1;
        }
      }
      save();
    }

    finalizeRunLocal(runId, startedAt, cancelled);
  } finally {
    runningRuns.delete(runId);
  }
}

/* ========================================================================== */
/* Handlers — one per server route                                            */
/* ========================================================================== */

function sessionDto(auth: AuthContext): AuthSessionDTO {
  const s = db();
  const memberships = s.memberships
    .filter((m) => m.userId === auth.userId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((m): WorkspaceDTO => {
      const w = s.workspaces.find((x) => x.id === m.workspaceId)!;
      return {
        id: m.workspaceId,
        name: w.name,
        role: m.role,
        createdAt: w.createdAt,
      };
    });
  return {
    user: { id: auth.userId, email: auth.email, name: auth.name },
    workspaces: memberships,
    currentWorkspaceId: memberships[0]?.id ?? null,
  };
}

/* --- auth ----------------------------------------------------------------- */

/** Unauthenticated sessions serialize exactly like the server build: user=null. */
type SessionResponse =
  | AuthSessionDTO
  | { user: null; workspaces: never[]; currentWorkspaceId: null };

function auth_session(): SessionResponse {
  const auth = getAuth();
  if (!auth) return { user: null, workspaces: [], currentWorkspaceId: null };
  return sessionDto(auth);
}

function auth_login(body: unknown): AuthSessionDTO {
  const b = (body ?? {}) as { email?: unknown; password?: unknown };
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const password = typeof b.password === "string" ? b.password : "";
  if (!EMAIL_RE.test(email)) throw new LocalApiError("Enter a valid email address.", 422);
  if (password.length === 0) throw new LocalApiError("Password is required.", 422);

  const s = db();
  const user = s.users.find((u) => u.email === email);
  if (!user || user.password !== password) {
    throw new LocalApiError("Incorrect email or password.", 401);
  }
  createSession(user.id);
  save();
  return sessionDto({ userId: user.id, email: user.email, name: user.name });
}

function auth_signup(body: unknown): AuthSessionDTO {
  const b = (body ?? {}) as { name?: unknown; email?: unknown; password?: unknown };
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const password = typeof b.password === "string" ? b.password : "";
  if (name.length === 0) throw new LocalApiError("Name is required.", 422);
  if (name.length > 80) throw new LocalApiError("Name must be at most 80 characters.", 422);
  if (!EMAIL_RE.test(email)) throw new LocalApiError("Enter a valid email address.", 422);
  if (password.length < 8) {
    throw new LocalApiError("Password must be at least 8 characters.", 422);
  }
  if (password.length > 200) {
    throw new LocalApiError("Password must be at most 200 characters.", 422);
  }

  const s = db();
  if (s.users.some((u) => u.email === email)) {
    throw new LocalApiError("An account with this email already exists.", 409);
  }

  const user: UserRow = { id: uid(), name, email, password, createdAt: nowIso() };
  s.users.push(user);
  const workspace: WorkspaceRow = {
    id: uid(),
    name: `${name.split(" ")[0]}'s Workspace`,
    passThreshold: 90,
    retentionDays: 365,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  s.workspaces.push(workspace);
  s.memberships.push({
    userId: user.id,
    workspaceId: workspace.id,
    role: "OWNER",
    createdAt: nowIso(),
  });
  seedWorkspace(workspace.id, user.id, user.name);
  createSession(user.id);
  save();
  return sessionDto({ userId: user.id, email: user.email, name: user.name });
}

function auth_logout(): { ok: true } {
  const token = readToken();
  if (token) {
    const s = db();
    s.sessions = s.sessions.filter((x) => x.token !== token);
  }
  clearToken();
  save();
  return { ok: true };
}

/* --- agents --------------------------------------------------------------- */

function agents_list(): { agents: AgentDTO[] } {
  const ctx = requireWorkspaceContext();
  const s = db();
  const agents = s.agents
    .filter((a) => a.workspaceId === ctx.workspaceId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(mapAgentRow);
  return { agents };
}

function agentInput(body: unknown, partial: boolean) {
  const b = (body ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(b, k);

  if (!partial || has("name")) {
    out.name = vString(b.name, "Agent name", { required: "Agent name is required.", max: 100 });
  }
  if (has("description")) {
    out.description = typeof b.description === "string" ? b.description.trim().slice(0, 600) : "";
  }
  if (!partial || has("type")) {
    const t = b.type ?? "CUSTOM_HTTP";
    if (t !== "DEMO_SANDBOX" && t !== "CUSTOM_HTTP") {
      throw new LocalApiError("Invalid agent type.", 422);
    }
    out.type = t;
  }
  if (has("endpointUrl")) {
    out.endpointUrl =
      b.endpointUrl === null || b.endpointUrl === undefined ? null : b.endpointUrl;
  }
  if (!partial || has("method")) {
    const m = b.method ?? "POST";
    if (!["POST", "PUT", "PATCH"].includes(m as string)) {
      throw new LocalApiError("Invalid HTTP method.", 422);
    }
    out.method = m;
  }
  if (has("headers")) {
    const h = b.headers;
    if (h && typeof h === "object" && !Array.isArray(h)) {
      const cleaned: Record<string, string> = {};
      for (const [k, v] of Object.entries(h as Record<string, unknown>)) {
        if (typeof k === "string" && typeof v === "string") {
          cleaned[k.slice(0, 100)] = v.slice(0, 2000);
        }
      }
      out.headers = cleaned;
    } else {
      out.headers = {};
    }
  }
  if (has("bodyTemplate")) {
    out.bodyTemplate =
      typeof b.bodyTemplate === "string" ? b.bodyTemplate.slice(0, 8000) : undefined;
  }
  if (has("responseField")) {
    const f = typeof b.responseField === "string" ? b.responseField.trim() : "";
    if (f && !/^[A-Za-z0-9_.[\]-]*$/.test(f)) {
      throw new LocalApiError("Response field must be a dot path like data.reply", 422);
    }
    out.responseField = f || "reply";
  }
  if (has("toolCallsField")) {
    const f = typeof b.toolCallsField === "string" ? b.toolCallsField.trim() : "";
    if (f && !/^[A-Za-z0-9_.[\]-]*$/.test(f)) {
      throw new LocalApiError("Tool-calls field must be a dot path like events.tool_calls", 422);
    }
    out.toolCallsField = f || "tool_calls";
  }
  if (!partial || has("authType")) {
    const a = b.authType ?? "NONE";
    if (!["NONE", "BEARER", "HEADER", "BASIC"].includes(a as string)) {
      throw new LocalApiError("Invalid auth type.", 422);
    }
    out.authType = a;
  }
  if (has("authHeaderName")) {
    out.authHeaderName =
      typeof b.authHeaderName === "string" && b.authHeaderName.trim()
        ? b.authHeaderName.trim().slice(0, 100)
        : null;
  }
  if (has("secret")) {
    out.secret = typeof b.secret === "string" && b.secret.length > 0 ? b.secret.slice(0, 4000) : null;
  }
  if (has("timeoutMs")) {
    const t = b.timeoutMs ?? 15000;
    if (typeof t !== "number" || !Number.isInteger(t) || t < 1000 || t > 120000) {
      throw new LocalApiError("Timeout must be between 1000 and 120000 ms.", 422);
    }
    out.timeoutMs = t;
  }
  if (!partial || has("expectedContentType")) {
    const c = b.expectedContentType ?? "JSON";
    if (c !== "JSON" && c !== "TEXT") throw new LocalApiError("Invalid content type.", 422);
    out.expectedContentType = c;
  }
  if (!partial || has("status")) {
    const st = b.status ?? "ACTIVE";
    if (st !== "ACTIVE" && st !== "DISABLED") throw new LocalApiError("Invalid status.", 422);
    out.status = st;
  }
  return out;
}

function agents_create(body: unknown): { agent: AgentDTO } {
  const ctx = requireWorkspaceContext();
  const input = agentInput(body, false);
  const type = input.type as "DEMO_SANDBOX" | "CUSTOM_HTTP";
  let endpointUrl: string | null = null;
  if (type === "CUSTOM_HTTP") {
    endpointUrl = assertEndpointUrl(input.endpointUrl);
  }
  const s = db();
  const row: AgentRow = {
    id: uid(),
    workspaceId: ctx.workspaceId,
    name: input.name as string,
    description: (input.description as string) ?? "",
    type,
    endpointUrl,
    method: type === "DEMO_SANDBOX" ? "POST" : ((input.method as string) ?? "POST"),
    headersJson: JSON.stringify(input.headers ?? {}),
    bodyTemplate: (input.bodyTemplate as string) || DEFAULT_BODY_TEMPLATE,
    responseField: (input.responseField as string) || "reply",
    toolCallsField: (input.toolCallsField as string) || "tool_calls",
    authType: (input.authType as AgentRow["authType"]) ?? "NONE",
    authHeaderName: (input.authHeaderName as string | null) ?? null,
    secret: (input.secret as string | null) ?? null,
    timeoutMs: (input.timeoutMs as number) ?? 15000,
    expectedContentType: (input.expectedContentType as AgentRow["expectedContentType"]) ?? "JSON",
    status: (input.status as AgentRow["status"]) ?? "ACTIVE",
    connectionStatus: "UNKNOWN",
    lastTestedAt: null,
    lastTestResultJson: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  s.agents.push(row);
  save();
  return { agent: mapAgentRow(row) };
}

function findAgent(ctx: WorkspaceContext, id: string): AgentRow {
  const agent = db().agents.find((a) => a.id === id && a.workspaceId === ctx.workspaceId);
  if (!agent) throw new LocalApiError("Agent not found.", 404);
  return agent;
}

function agents_get(id: string): { agent: AgentDTO } {
  const ctx = requireWorkspaceContext();
  return { agent: mapAgentRow(findAgent(ctx, id)) };
}

function agents_update(id: string, body: unknown): { agent: AgentDTO } {
  const ctx = requireWorkspaceContext();
  const agent = findAgent(ctx, id);
  const input = agentInput(body, true);
  const s = db();

  const type = (input.type as AgentRow["type"]) ?? agent.type;
  let endpointUrl = agent.endpointUrl;
  if (input.endpointUrl !== undefined) endpointUrl = input.endpointUrl as string | null;
  if (type === "CUSTOM_HTTP") {
    if (!endpointUrl) {
      throw new LocalApiError("An endpoint URL is required for HTTP agents.", 422);
    }
    if (input.endpointUrl !== undefined && input.endpointUrl !== agent.endpointUrl) {
      endpointUrl = assertEndpointUrl(input.endpointUrl);
    }
  }

  if (input.name !== undefined) agent.name = input.name as string;
  if (input.description !== undefined) agent.description = input.description as string;
  if (input.type !== undefined) agent.type = type;
  agent.endpointUrl = type === "DEMO_SANDBOX" ? null : endpointUrl;
  if (input.method !== undefined) agent.method = input.method as string;
  if (input.headers !== undefined) agent.headersJson = JSON.stringify(input.headers);
  if (input.bodyTemplate !== undefined && input.bodyTemplate !== "") {
    agent.bodyTemplate = input.bodyTemplate as string;
  }
  if (input.responseField !== undefined) agent.responseField = input.responseField as string;
  if (input.toolCallsField !== undefined) agent.toolCallsField = input.toolCallsField as string;
  if (input.authType !== undefined) agent.authType = input.authType as AgentRow["authType"];
  if (input.authHeaderName !== undefined) agent.authHeaderName = input.authHeaderName as string | null;
  if (input.timeoutMs !== undefined) agent.timeoutMs = input.timeoutMs as number;
  if (input.expectedContentType !== undefined) {
    agent.expectedContentType = input.expectedContentType as AgentRow["expectedContentType"];
  }
  if (input.status !== undefined) agent.status = input.status as AgentRow["status"];
  if (input.secret !== undefined) agent.secret = input.secret as string | null;

  // config changes invalidate the last connection result (same as server)
  if (
    input.endpointUrl !== undefined ||
    input.headers !== undefined ||
    (input.bodyTemplate !== undefined && input.bodyTemplate !== "") ||
    input.responseField !== undefined ||
    input.toolCallsField !== undefined ||
    input.authType !== undefined ||
    (input.secret !== undefined && (input.secret as string | null) !== null)
  ) {
    agent.connectionStatus = "UNKNOWN";
    agent.lastTestedAt = null;
    agent.lastTestResultJson = null;
  }
  agent.updatedAt = nowIso();
  save();
  void s;
  return { agent: mapAgentRow(agent) };
}

function agents_delete(id: string): { ok: true } {
  const ctx = requireWorkspaceContext();
  const agent = findAgent(ctx, id);
  const s = db();
  const activeRuns = s.runs.some(
    (r) => r.agentId === agent.id && (r.status === "QUEUED" || r.status === "RUNNING")
  );
  if (activeRuns) {
    throw new LocalApiError(
      "This agent has runs in progress. Cancel them or wait for completion before deleting the agent.",
      409
    );
  }
  s.agents = s.agents.filter((a) => a.id !== agent.id);
  // history survives deletion (name snapshots) — same as server (SetNull)
  s.runs.forEach((r) => {
    if (r.agentId === agent.id) r.agentId = null;
  });
  save();
  return { ok: true };
}

async function agents_test(id: string): Promise<{ result: ConnectionTestResultDTO }> {
  const ctx = requireWorkspaceContext();
  const agent = findAgent(ctx, id);
  if (agent.status === "DISABLED") {
    throw new LocalApiError("This agent connection is disabled. Enable it first.", 409);
  }

  let result: ConnectionTestResultDTO;
  if (agent.type === "DEMO_SANDBOX") {
    const sessionId = `connection-test-${agent.id.slice(-8)}`;
    const message = "Hello, this is a connection test from AgentClear.";
    const rendered = renderTemplate(agent.bodyTemplate || DEFAULT_BODY_TEMPLATE, {
      session_id: sessionId,
      message,
      history_json: JSON.stringify([{ role: "user", content: message }]),
      turn: "0",
    });
    const turn = await executeTurnLocal(
      { type: agent.type, bodyTemplate: agent.bodyTemplate, responseField: agent.responseField },
      rendered
    );
    let ok = !turn.error;
    let error: string | undefined = turn.error ?? undefined;
    if (ok && turn.reply === null) {
      ok = false;
      error = `The response was received (HTTP ${turn.statusCode}) but the reply could not be extracted using the configured response field ("${agent.responseField || "reply"}").`;
    }
    result = {
      ok,
      statusCode: turn.statusCode || undefined,
      durationMs: turn.durationMs,
      replyPreview: turn.reply?.slice(0, 400) ?? undefined,
      error,
      testedAt: nowIso(),
    };
    agent.lastTestResultJson = JSON.stringify({
      ...result,
      note: "Internal sandbox — no network request was made.",
    });
  } else {
    result = {
      ok: false,
      error:
        "HTTP agent connection tests require the full-stack AgentClear server build (SSRF-guarded outbound requests). This static demo supports the internal sandbox agent only.",
      testedAt: nowIso(),
    };
    agent.lastTestResultJson = JSON.stringify(result);
  }

  agent.connectionStatus = result.ok ? "CONNECTED" : "FAILED";
  agent.lastTestedAt = nowIso();
  agent.updatedAt = nowIso();
  save();
  return { result };
}

/* --- suites --------------------------------------------------------------- */

function suites_list(): { suites: SuiteSummary[] } {
  const ctx = requireWorkspaceContext();
  const s = db();
  const suites = s.suites
    .filter((x) => x.workspaceId === ctx.workspaceId)
    .sort(
      (a, b) =>
        Number(b.isStarter) - Number(a.isStarter) || a.createdAt.localeCompare(b.createdAt)
    )
    .map(suiteSummary);
  return { suites };
}

function suiteInput(body: unknown, partial: boolean) {
  const b = (body ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(b, k);
  if (!partial || has("name")) {
    out.name = vString(b.name, "Suite name", { required: "Suite name is required.", max: 120 });
  }
  if (has("description")) {
    out.description =
      typeof b.description === "string" ? b.description.trim().slice(0, 1000) : "";
  }
  if (has("tags")) {
    const t = Array.isArray(b.tags) ? b.tags : [];
    out.tags = t
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .slice(0, 10)
      .map((x) => x.trim().slice(0, 40));
  }
  return out;
}

function caseInput(body: unknown, partial: boolean) {
  const b = (body ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(b, k);

  if (!partial || has("displayId")) {
    const id = vString(b.displayId, "Case id", { required: "Case id is required.", max: 20 });
    if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(id)) {
      throw new LocalApiError(
        "Case id may contain letters, digits and dashes (e.g. C-11).",
        422
      );
    }
    out.displayId = id;
  }
  if (!partial || has("category")) {
    if (!["CORRECTNESS", "TOOL_USAGE", "SAFETY"].includes(b.category as string)) {
      throw new LocalApiError("Invalid category.", 422);
    }
    out.category = b.category;
  }
  if (!partial || has("severity")) {
    if (!["CRITICAL", "HIGH", "MEDIUM", "LOW"].includes(b.severity as string)) {
      throw new LocalApiError("Invalid severity.", 422);
    }
    out.severity = b.severity;
  }
  if (!partial || has("title")) {
    out.title = vString(b.title, "Title", { required: "Title is required.", max: 200 });
  }
  if (has("description")) {
    out.description =
      typeof b.description === "string" ? b.description.trim().slice(0, 1000) : "";
  }
  if (!partial || has("turns")) {
    const turns = Array.isArray(b.turns) ? b.turns : [];
    if (turns.length < 1) throw new LocalApiError("At least one turn is required.", 422);
    if (turns.length > 10) throw new LocalApiError("At most 10 turns per case.", 422);
    for (const t of turns) {
      const user = (t as { user?: unknown })?.user;
      if (typeof user !== "string" || user.trim().length === 0) {
        throw new LocalApiError("Turn text is required.", 422);
      }
      if (user.length > 4000) {
        throw new LocalApiError("Turn text must be at most 4000 characters.", 422);
      }
    }
    out.turns = turns;
  }
  if (!partial || has("expectedBehavior")) {
    out.expectedBehavior = vString(b.expectedBehavior, "Expected behavior", {
      required: "Expected behavior is required.",
      max: 2000,
    });
  }
  if (has("evidence")) {
    out.evidence = typeof b.evidence === "string" ? b.evidence.trim().slice(0, 2000) : "";
  }
  if (has("rules")) {
    const rules = Array.isArray(b.rules) ? b.rules : [];
    if (rules.length > 30) throw new LocalApiError("At most 30 rules per case.", 422);
    out.rules = rules;
  }
  if (has("failureHint")) {
    out.failureHint =
      typeof b.failureHint === "string" ? b.failureHint.trim().slice(0, 1000) : null;
  }
  if (has("tags")) {
    const t = Array.isArray(b.tags) ? b.tags : [];
    out.tags = t
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .slice(0, 10)
      .map((x) => x.trim().slice(0, 40));
  }
  return out;
}

function suites_create(body: unknown): { suite: SuiteSummary } {
  const ctx = requireWorkspaceContext();
  const input = suiteInput(body, false);
  const cases = Array.isArray((body as { cases?: unknown }).cases)
    ? ((body as { cases: unknown[] }).cases as unknown[])
    : [];
  if (cases.length > 200) throw new LocalApiError("At most 200 cases per suite.", 422);

  const s = db();
  const suite: SuiteRow = {
    id: uid(),
    workspaceId: ctx.workspaceId,
    name: input.name as string,
    description: (input.description as string) ?? "",
    isStarter: false,
    tagsCsv: ((input.tags as string[]) ?? []).join(","),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  s.suites.push(suite);
  cases.forEach((c, i) => {
    const parsed = caseInput(c, false);
    s.cases.push({
      id: uid(),
      suiteId: suite.id,
      displayId: parsed.displayId as string,
      orderIndex: i + 1,
      category: parsed.category as string,
      severity: parsed.severity as string,
      title: parsed.title as string,
      description: (parsed.description as string) ?? "",
      turnsJson: JSON.stringify(parsed.turns ?? []),
      expectedBehavior: parsed.expectedBehavior as string,
      evidenceNote: (parsed.evidence as string) ?? "",
      rulesJson: JSON.stringify(parsed.rules ?? []),
      failureHint: (parsed.failureHint as string | null) ?? null,
      tagsCsv: ((parsed.tags as string[]) ?? []).join(","),
    });
  });
  save();
  return { suite: suiteSummary(suite) };
}

function findSuite(ctx: WorkspaceContext, id: string): SuiteRow {
  const suite = db().suites.find((x) => x.id === id && x.workspaceId === ctx.workspaceId);
  if (!suite) throw new LocalApiError("Test suite not found.", 404);
  return suite;
}

function suites_get(id: string): { suite: SuiteDetail } {
  const ctx = requireWorkspaceContext();
  const suite = findSuite(ctx, id);
  const detail = loadSuiteDetail(suite.id, ctx.workspaceId);
  if (!detail) throw new LocalApiError("Test suite not found.", 404);
  return { suite: detail };
}

function suites_update(id: string, body: unknown): { suite: SuiteDetail } {
  const ctx = requireWorkspaceContext();
  const suite = findSuite(ctx, id);
  const input = suiteInput(body, true);
  if (input.name !== undefined) suite.name = input.name as string;
  if (input.description !== undefined) suite.description = input.description as string;
  if (input.tags !== undefined) suite.tagsCsv = (input.tags as string[]).join(",");
  suite.updatedAt = nowIso();
  save();
  return { suite: loadSuiteDetail(suite.id, ctx.workspaceId)! };
}

function suites_delete(id: string): { ok: true } {
  const ctx = requireWorkspaceContext();
  const suite = findSuite(ctx, id);
  const s = db();
  const activeRuns = s.runs.some(
    (r) => r.suiteId === suite.id && (r.status === "QUEUED" || r.status === "RUNNING")
  );
  if (activeRuns) {
    throw new LocalApiError(
      "This suite has runs in progress. Cancel them or wait for completion before deleting the suite.",
      409
    );
  }
  s.suites = s.suites.filter((x) => x.id !== suite.id);
  s.cases = s.cases.filter((c) => c.suiteId !== suite.id);
  s.runs.forEach((r) => {
    if (r.suiteId === suite.id) r.suiteId = null;
  });
  save();
  return { ok: true };
}

function suites_duplicate(id: string): { suite: SuiteSummary } {
  const ctx = requireWorkspaceContext();
  const suite = findSuite(ctx, id);
  const s = db();
  const copy: SuiteRow = {
    id: uid(),
    workspaceId: ctx.workspaceId,
    name: `${suite.name} (copy)`,
    description: suite.description,
    isStarter: false,
    tagsCsv: suite.tagsCsv,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  s.suites.push(copy);
  s.cases
    .filter((c) => c.suiteId === suite.id)
    .forEach((c) => {
      s.cases.push({ ...c, id: uid(), suiteId: copy.id });
    });
  save();
  return { suite: suiteSummary(copy) };
}

function suites_cases_create(id: string, body: unknown): { case: TestCaseData } {
  const ctx = requireWorkspaceContext();
  const suite = findSuite(ctx, id);
  const input = caseInput(body, false);
  const s = db();
  if (s.cases.some((c) => c.suiteId === suite.id && c.displayId === input.displayId)) {
    throw new LocalApiError(`Case id "${input.displayId}" already exists in this suite.`, 409);
  }
  const maxOrder = s.cases
    .filter((c) => c.suiteId === suite.id)
    .reduce((m, c) => Math.max(m, c.orderIndex), 0);
  const row: CaseRow = {
    id: uid(),
    suiteId: suite.id,
    displayId: input.displayId as string,
    orderIndex: maxOrder + 1,
    category: input.category as string,
    severity: input.severity as string,
    title: input.title as string,
    description: (input.description as string) ?? "",
    turnsJson: JSON.stringify(input.turns ?? []),
    expectedBehavior: input.expectedBehavior as string,
    evidenceNote: (input.evidence as string) ?? "",
    rulesJson: JSON.stringify(input.rules ?? []),
    failureHint: (input.failureHint as string | null) ?? null,
    tagsCsv: ((input.tags as string[]) ?? []).join(","),
  };
  s.cases.push(row);
  suite.updatedAt = nowIso();
  save();
  return { case: mapCaseRow(row) };
}

function suites_cases_update(
  id: string,
  caseId: string,
  body: unknown
): { case: TestCaseData } {
  const ctx = requireWorkspaceContext();
  const suite = findSuite(ctx, id);
  const s = db();
  const row = s.cases.find((c) => c.id === caseId && c.suiteId === suite.id);
  if (!row) throw new LocalApiError("Test case not found.", 404);
  const input = caseInput(body, true);
  if (
    input.displayId !== undefined &&
    input.displayId !== row.displayId &&
    s.cases.some((c) => c.suiteId === suite.id && c.displayId === input.displayId)
  ) {
    throw new LocalApiError(`Case id "${input.displayId}" already exists in this suite.`, 409);
  }
  if (input.displayId !== undefined) row.displayId = input.displayId as string;
  if (input.category !== undefined) row.category = input.category as string;
  if (input.severity !== undefined) row.severity = input.severity as string;
  if (input.title !== undefined) row.title = input.title as string;
  if (input.description !== undefined) row.description = input.description as string;
  if (input.turns !== undefined) row.turnsJson = JSON.stringify(input.turns);
  if (input.expectedBehavior !== undefined) row.expectedBehavior = input.expectedBehavior as string;
  if (input.evidence !== undefined) row.evidenceNote = input.evidence as string;
  if (input.rules !== undefined) row.rulesJson = JSON.stringify(input.rules);
  if (input.failureHint !== undefined) row.failureHint = input.failureHint as string | null;
  if (input.tags !== undefined) row.tagsCsv = (input.tags as string[]).join(",");
  suite.updatedAt = nowIso();
  save();
  return { case: mapCaseRow(row) };
}

function suites_cases_delete(id: string, caseId: string): { ok: true } {
  const ctx = requireWorkspaceContext();
  const suite = findSuite(ctx, id);
  const s = db();
  const row = s.cases.find((c) => c.id === caseId && c.suiteId === suite.id);
  if (!row) throw new LocalApiError("Test case not found.", 404);
  s.cases = s.cases.filter((c) => c.id !== row.id);
  suite.updatedAt = nowIso();
  save();
  return { ok: true };
}

/* --- runs ------------------------------------------------------------------ */

function runs_list(query: URLSearchParams): { runs: RunSummaryDTO[] } {
  const ctx = requireWorkspaceContext();
  const s = db();
  const includeSample = query.get("includeSample");
  const runs = s.runs
    .filter(
      (r) =>
        r.workspaceId === ctx.workspaceId &&
        (includeSample === "false" ? !r.isSample : true)
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 60);
  const threshold = workspaceThreshold(ctx.workspaceId);
  return { runs: runs.map((r) => mapRunSummary(r, threshold)) };
}

function runs_create(body: unknown): { run: RunSummaryDTO } {
  const ctx = requireWorkspaceContext();
  const b = (body ?? {}) as { agentId?: unknown; suiteId?: unknown };
  const agentId = typeof b.agentId === "string" ? b.agentId : "";
  const suiteId = typeof b.suiteId === "string" ? b.suiteId : "";
  if (!agentId || !suiteId) {
    throw new LocalApiError("An agent and a test suite are required.", 422);
  }

  const s = db();
  const agent = s.agents.find((a) => a.id === agentId && a.workspaceId === ctx.workspaceId);
  if (!agent) throw new LocalApiError("Agent not found.", 404);
  if (agent.status === "DISABLED") {
    throw new LocalApiError(
      "This agent connection is disabled. Enable it before running tests.",
      409
    );
  }
  if (agent.type === "CUSTOM_HTTP" && !agent.endpointUrl) {
    throw new LocalApiError(
      "This agent has no endpoint URL configured. Configure it before running tests.",
      422
    );
  }

  const suite = s.suites.find((x) => x.id === suiteId && x.workspaceId === ctx.workspaceId);
  if (!suite) throw new LocalApiError("Test suite not found.", 404);
  const caseCount = s.cases.filter((c) => c.suiteId === suite.id).length;
  if (caseCount === 0) {
    throw new LocalApiError(
      "This suite has no test cases. Add at least one case before running.",
      422
    );
  }

  const run: RunRow = {
    id: uid(),
    workspaceId: ctx.workspaceId,
    agentId: agent.id,
    suiteId: suite.id,
    agentNameSnapshot: agent.name,
    agentTypeSnapshot: agent.type,
    suiteNameSnapshot: suite.name,
    status: "QUEUED",
    isSample: false,
    totalCases: caseCount,
    progress: 0,
    passed: 0,
    failed: 0,
    inconclusive: 0,
    errored: 0,
    notExecuted: 0,
    score: null,
    categoriesJson: "{}",
    cancelRequested: false,
    failureMessage: null,
    startedAt: null,
    completedAt: null,
    durationMs: null,
    createdByUserId: ctx.userId,
    createdByName: ctx.name,
    createdAt: nowIso(),
  };
  s.runs.push(run);
  save();

  // Client-side execution, fire-and-forget with internal error handling.
  void executeRunLocal(run.id);

  return { run: mapRunSummary(run, workspaceThreshold(ctx.workspaceId)) };
}

function runs_get(id: string): { run: RunDetailDTO } {
  const ctx = requireWorkspaceContext();
  const s = db();
  const exists = s.runs.some((r) => r.id === id && r.workspaceId === ctx.workspaceId);
  if (!exists) throw new LocalApiError("Run not found.", 404);
  const detail = mapRunDetail(id, workspaceThreshold(ctx.workspaceId));
  if (!detail) throw new LocalApiError("Run not found.", 404);
  return { run: detail };
}

function runs_cancel(id: string): { ok: true; status: string; note: string } {
  const ctx = requireWorkspaceContext();
  const s = db();
  const run = s.runs.find((r) => r.id === id && r.workspaceId === ctx.workspaceId);
  if (!run) throw new LocalApiError("Run not found.", 404);
  if (run.status !== "RUNNING" && run.status !== "QUEUED") {
    throw new LocalApiError(
      `This run is already ${run.status.toLowerCase()} and cannot be cancelled.`,
      409
    );
  }
  if (run.isSample) {
    throw new LocalApiError("Simulated sample runs cannot be cancelled.", 409);
  }
  run.cancelRequested = true;
  save();
  return {
    ok: true,
    status: "RUNNING",
    note: "Cancellation requested — in-flight cases will finish; remaining cases will be marked not executed.",
  };
}

function runs_compare(query: URLSearchParams): { compare: CompareDTO } {
  const ctx = requireWorkspaceContext();
  const a = query.get("a");
  const b = query.get("b");
  if (!a || !b) throw new LocalApiError("Provide two run ids (?a=…&b=…).", 422);
  if (a === b) throw new LocalApiError("Select two different runs to compare.", 422);

  const s = db();
  const rows = s.runs.filter(
    (r) => (r.id === a || r.id === b) && r.workspaceId === ctx.workspaceId
  );
  if (rows.length !== 2) throw new LocalApiError("One or both runs were not found.", 404);
  const runA = rows.find((r) => r.id === a)!;
  const runB = rows.find((r) => r.id === b)!;
  if ((runA.suiteId ?? runA.suiteNameSnapshot) !== (runB.suiteId ?? runB.suiteNameSnapshot)) {
    throw new LocalApiError(
      "These runs used different test suites, so their cases cannot be compared one-to-one.",
      422
    );
  }

  const threshold = workspaceThreshold(ctx.workspaceId);
  const resultsFor = (runId: string) =>
    s.results
      .filter((r) => r.runId === runId)
      .sort((x, y) => x.orderIndex - y.orderIndex);
  const resultsA = resultsFor(runA.id);
  const mapB = new Map(resultsFor(runB.id).map((r) => [r.displayId, r]));

  const rank: Record<ResultStatus, number> = {
    PASS: 3,
    FAIL: 1,
    INCONCLUSIVE: 2,
    ERROR: 0,
    NOT_EXECUTED: 0,
  };

  let regressions = 0;
  let improvements = 0;
  const rowsOut = resultsA.map((ra) => {
    const rb = mapB.get(ra.displayId);
    const statusA = ra.status as ResultStatus;
    const statusB = (rb?.status ?? "NOT_EXECUTED") as ResultStatus;
    const regression = rb ? rank[statusB] < rank[statusA] && statusA === "PASS" : false;
    const improvement = rb ? rank[statusB] > rank[statusA] && statusB === "PASS" : false;
    if (regression) regressions += 1;
    if (improvement) improvements += 1;
    return {
      caseId: ra.displayId,
      order: ra.orderIndex,
      title: rb?.title ?? ra.title,
      category: (rb?.category ?? ra.category) as CompareDTO["rows"][number]["category"],
      severity: (rb?.severity ?? ra.severity) as CompareDTO["rows"][number]["severity"],
      statusA,
      statusB,
      regression,
      improvement,
    };
  });

  return {
    compare: {
      runA: mapRunSummary(runA, threshold),
      runB: mapRunSummary(runB, threshold),
      rows: rowsOut,
      regressions,
      improvements,
    },
  };
}

/* --- overview -------------------------------------------------------------- */

function overview_get(): OverviewDTO {
  const ctx = requireWorkspaceContext();
  const s = db();
  const threshold = workspaceThreshold(ctx.workspaceId);

  const agentsConnected = s.agents.filter(
    (a) => a.workspaceId === ctx.workspaceId && a.status === "ACTIVE"
  ).length;
  const recentRuns = s.runs
    .filter((r) => r.workspaceId === ctx.workspaceId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 10);

  const summaries = recentRuns.map((r) => mapRunSummary(r, threshold));
  const realRuns = summaries.filter((r) => !r.isSample && r.status === "COMPLETED");
  const latestRun = realRuns[0] ?? null;
  const previousRun =
    realRuns.find((r) => r.suiteId === latestRun?.suiteId && r.id !== latestRun.id) ?? null;
  const scoreDelta =
    latestRun?.score != null && previousRun?.score != null
      ? Math.round((latestRun.score - previousRun.score) * 10) / 10
      : null;

  const recentFailures: OverviewDTO["recentFailures"] = [];
  const latestRealRow = recentRuns.find((r) => !r.isSample && r.status === "COMPLETED");
  if (latestRealRow) {
    const failing = s.results
      .filter(
        (r) => r.runId === latestRealRow.id && (r.status === "FAIL" || r.status === "INCONCLUSIVE")
      )
      .sort(
        (x, y) =>
          (x.status === "FAIL" ? 1 : 0) - (y.status === "FAIL" ? 1 : 0) ||
          x.orderIndex - y.orderIndex
      )
      .slice(0, 6);
    for (const f of failing) {
      recentFailures.push({
        runId: latestRealRow.id,
        runStatus: latestRealRow.status,
        isSample: false,
        caseId: f.displayId,
        title: f.title,
        category: f.category as OverviewDTO["recentFailures"][number]["category"],
        severity: f.severity as OverviewDTO["recentFailures"][number]["severity"],
        status: f.status as ResultStatus,
        explanation: f.explanation.slice(0, 300),
        completedAt: latestRealRow.completedAt,
      });
    }
  }

  const hasSuite = s.suites.some((x) => x.workspaceId === ctx.workspaceId);
  const hasRun = s.runs.some((r) => r.workspaceId === ctx.workspaceId && !r.isSample);

  return {
    agentsConnected,
    latestRun,
    previousRun,
    scoreDelta,
    recentRuns: summaries.slice(0, 8),
    recentFailures,
    hasAnyRealRun: realRuns.length > 0,
    onboarding: {
      hasAgent: agentsConnected > 0,
      hasSuite,
      hasRun,
    },
  };
}

/* --- settings / tokens / sessions / account -------------------------------- */

function settings_get() {
  const ctx = requireWorkspaceContext();
  const s = db();
  const ws = s.workspaces.find((w) => w.id === ctx.workspaceId)!;
  return {
    settings: {
      workspace: {
        id: ws.id,
        name: ws.name,
        passThreshold: ws.passThreshold,
        retentionDays: ws.retentionDays,
      },
      user: { id: ctx.userId, email: ctx.email, name: ctx.name },
    },
  };
}

function settings_patch(body: unknown) {
  const ctx = requireWorkspaceContext();
  const b = (body ?? {}) as { workspace?: Record<string, unknown>; user?: Record<string, unknown> };
  const s = db();
  const ws = s.workspaces.find((w) => w.id === ctx.workspaceId)!;
  const user = s.users.find((u) => u.id === ctx.userId)!;

  if (b.workspace) {
    const w = b.workspace;
    if (w.name !== undefined) {
      const name = typeof w.name === "string" ? w.name.trim() : "";
      if (!name || name.length > 80) {
        throw new LocalApiError("Workspace name is required (max 80 characters).", 422);
      }
      ws.name = name;
    }
    if (w.passThreshold !== undefined) {
      const t = w.passThreshold;
      if (typeof t !== "number" || !Number.isInteger(t) || t < 1 || t > 100) {
        throw new LocalApiError("Pass threshold must be an integer between 1 and 100.", 422);
      }
      ws.passThreshold = t;
    }
    if (w.retentionDays !== undefined) {
      const d = w.retentionDays;
      if (typeof d !== "number" || !Number.isInteger(d) || d < 7 || d > 3650) {
        throw new LocalApiError("Retention must be an integer between 7 and 3650 days.", 422);
      }
      ws.retentionDays = d;
    }
    ws.updatedAt = nowIso();
  }
  if (b.user) {
    const name = typeof b.user.name === "string" ? b.user.name.trim() : "";
    if (!name || name.length > 80) {
      throw new LocalApiError("Name is required (max 80 characters).", 422);
    }
    user.name = name;
  }
  save();
  return {
    settings: {
      workspace: {
        id: ws.id,
        name: ws.name,
        passThreshold: ws.passThreshold,
        retentionDays: ws.retentionDays,
      },
      user: { id: ctx.userId, email: ctx.email, name: user.name },
    },
  };
}

function tokens_list(): { tokens: ApiTokenDTO[] } {
  const ctx = requireWorkspaceContext();
  const s = db();
  const tokens = s.tokens
    .filter((t) => t.workspaceId === ctx.workspaceId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((t) => ({
      id: t.id,
      name: t.name,
      prefix: t.prefix,
      createdAt: t.createdAt,
      lastUsedAt: t.lastUsedAt,
    }));
  return { tokens };
}

function tokens_create(body: unknown): { token: ApiTokenDTO } {
  const ctx = requireWorkspaceContext();
  const name = vString((body as { name?: unknown })?.name, "Token name", {
    required: "Token name is required.",
    max: 80,
  });
  const s = db();
  if (s.tokens.filter((t) => t.workspaceId === ctx.workspaceId).length >= 20) {
    throw new LocalApiError("This workspace already has 20 tokens. Revoke one first.", 409);
  }
  const token = `ap_${randomToken(24)}`;
  const row: TokenRow = {
    id: uid(),
    workspaceId: ctx.workspaceId,
    name,
    prefix: token.slice(0, 11),
    createdAt: nowIso(),
    lastUsedAt: null,
  };
  s.tokens.push(row);
  save();
  return {
    token: {
      id: row.id,
      name: row.name,
      prefix: row.prefix,
      createdAt: row.createdAt,
      lastUsedAt: null,
      token, // shown exactly once — same as the server build
    },
  };
}

function tokens_delete(id: string): { ok: true } {
  const ctx = requireWorkspaceContext();
  const s = db();
  const row = s.tokens.find((t) => t.id === id && t.workspaceId === ctx.workspaceId);
  if (!row) throw new LocalApiError("Token not found.", 404);
  s.tokens = s.tokens.filter((t) => t.id !== row.id);
  save();
  return { ok: true };
}

function sessions_list(): { sessions: SessionInfoDTO[] } {
  const auth = requireSession();
  const s = db();
  const token = readToken();
  const sessions = s.sessions
    .filter((x) => x.userId === auth.userId)
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
    .slice(0, 30)
    .map((x) => ({
      id: x.id,
      userAgent: x.userAgent,
      createdAt: x.createdAt,
      lastSeenAt: x.lastSeenAt,
      current: x.token === token,
    }));
  return { sessions };
}

function sessions_delete(id: string): { ok: true } {
  const auth = requireSession();
  const s = db();
  const session = s.sessions.find((x) => x.id === id);
  if (!session || session.userId !== auth.userId) {
    throw new LocalApiError("Session not found.", 404);
  }
  const wasCurrent = session.token === readToken();
  s.sessions = s.sessions.filter((x) => x.id !== id);
  if (wasCurrent) clearToken();
  save();
  return { ok: true };
}

function account_delete(body: unknown): { ok: true; accountDeleted: boolean } {
  const auth = requireSession();
  const b = (body ?? {}) as { scope?: unknown; confirm?: unknown };
  if (b.scope !== "account" && b.scope !== "workspace") {
    throw new LocalApiError("Invalid deletion scope.", 422);
  }
  if (b.confirm !== "DELETE") {
    throw new LocalApiError("Type DELETE to confirm — this action cannot be undone.", 422);
  }

  const s = db();
  if (b.scope === "workspace") {
    const headerId =
      typeof window === "undefined" ? null : window.localStorage.getItem(WORKSPACE_KEY);
    const memberships = s.memberships.filter((m) => m.userId === auth.userId);
    const target = headerId
      ? memberships.find((m) => m.workspaceId === headerId)
      : memberships[0];
    if (!target) throw new LocalApiError("Workspace not found for this account.", 404);

    const activeRuns = s.runs.some(
      (r) =>
        r.workspaceId === target.workspaceId &&
        (r.status === "QUEUED" || r.status === "RUNNING")
    );
    if (activeRuns) {
      throw new LocalApiError(
        "This workspace has runs in progress. Cancel them before deleting.",
        409
      );
    }

    const wsId = target.workspaceId;
    const runIds = new Set(s.runs.filter((r) => r.workspaceId === wsId).map((r) => r.id));
    const resultIds = new Set(
      s.results.filter((r) => runIds.has(r.runId)).map((r) => r.id)
    );
    s.runs = s.runs.filter((r) => r.workspaceId !== wsId);
    s.results = s.results.filter((r) => !runIds.has(r.runId));
    s.toolEvents = s.toolEvents.filter((e) => !resultIds.has(e.resultId));
    s.agents = s.agents.filter((a) => a.workspaceId !== wsId);
    const suiteIds = new Set(s.suites.filter((x) => x.workspaceId === wsId).map((x) => x.id));
    s.suites = s.suites.filter((x) => x.workspaceId !== wsId);
    s.cases = s.cases.filter((c) => !suiteIds.has(c.suiteId));
    s.tokens = s.tokens.filter((t) => t.workspaceId !== wsId);
    s.memberships = s.memberships.filter((m) => m.workspaceId !== wsId);
    s.workspaces = s.workspaces.filter((w) => w.id !== wsId);

    const remaining = s.memberships.some((m) => m.userId === auth.userId);
    if (!remaining) {
      // last workspace gone → delete the account too (same as server)
      s.users = s.users.filter((u) => u.id !== auth.userId);
      s.sessions = s.sessions.filter((x) => x.userId !== auth.userId);
      clearToken();
      save();
      return { ok: true, accountDeleted: true };
    }
    save();
    return { ok: true, accountDeleted: false };
  }

  // scope === account
  const userWorkspaceIds = new Set(
    s.memberships.filter((m) => m.userId === auth.userId).map((m) => m.workspaceId)
  );
  const activeRuns = s.runs.some(
    (r) => userWorkspaceIds.has(r.workspaceId) && (r.status === "QUEUED" || r.status === "RUNNING")
  );
  if (activeRuns) {
    throw new LocalApiError(
      "You have runs in progress. Cancel them before deleting your account.",
      409
    );
  }
  s.users = s.users.filter((u) => u.id !== auth.userId);
  s.sessions = s.sessions.filter((x) => x.userId !== auth.userId);
  s.memberships = s.memberships.filter((m) => m.userId !== auth.userId);
  s.workspaces = s.workspaces.filter((w) => !userWorkspaceIds.has(w.id));
  s.agents = s.agents.filter((a) => !userWorkspaceIds.has(a.workspaceId));
  s.suites = s.suites.filter((x) => !userWorkspaceIds.has(x.workspaceId));
  const suiteIds = new Set(s.suites.map((x) => x.id));
  s.cases = s.cases.filter((c) => !suiteIds.has(c.suiteId));
  const runIds = new Set(s.runs.filter((r) => userWorkspaceIds.has(r.workspaceId)).map((r) => r.id));
  const resultIds = new Set(s.results.filter((r) => runIds.has(r.runId)).map((r) => r.id));
  s.runs = s.runs.filter((r) => !runIds.has(r.id));
  s.results = s.results.filter((r) => !runIds.has(r.runId));
  s.toolEvents = s.toolEvents.filter((e) => !resultIds.has(e.resultId));
  s.tokens = s.tokens.filter((t) => !userWorkspaceIds.has(t.workspaceId));
  clearToken();
  save();
  return { ok: true, accountDeleted: true };
}

/* --- contact ---------------------------------------------------------------- */

function contact_post(body: unknown): { ok: true } {
  const b = (body ?? {}) as { email?: unknown; message?: unknown };
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const message = typeof b.message === "string" ? b.message.trim() : "";
  if (!EMAIL_RE.test(email)) throw new LocalApiError("Enter a valid email address.", 422);
  if (message.length < 10) {
    throw new LocalApiError("Message must be at least 10 characters.", 422);
  }
  if (message.length > 5000) {
    throw new LocalApiError("Message must be at most 5000 characters.", 422);
  }
  db().contactMessages.push({ id: uid(), email, message, createdAt: nowIso() });
  save();
  return { ok: true };
}

/* ========================================================================== */
/* Dispatcher — same (method, segments) routing as the server build           */
/* ========================================================================== */

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

async function dispatchLocal(
  method: Method,
  path: string,
  query: URLSearchParams,
  body: unknown
): Promise<unknown> {
  const segs = path.replace(/^\/api\//, "").split("/").filter(Boolean);
  const key = segs.join("/");
  const n = segs.length;

  switch (key) {
    case "auth/login":
      if (method === "POST") return auth_login(body);
      break;
    case "auth/logout":
      if (method === "POST") return auth_logout();
      break;
    case "auth/session":
      if (method === "GET") return auth_session();
      break;
    case "auth/signup":
      if (method === "POST") return auth_signup(body);
      break;
    case "agents":
      if (method === "GET") return agents_list();
      if (method === "POST") return agents_create(body);
      break;
    case "suites":
      if (method === "GET") return suites_list();
      if (method === "POST") return suites_create(body);
      break;
    case "runs":
      if (method === "GET") return runs_list(query);
      if (method === "POST") return runs_create(body);
      break;
    case "runs/compare":
      if (method === "GET") return runs_compare(query);
      break;
    case "overview":
      if (method === "GET") return overview_get();
      break;
    case "settings":
      if (method === "GET") return settings_get();
      if (method === "PATCH") return settings_patch(body);
      break;
    case "settings/sessions":
      if (method === "GET") return sessions_list();
      break;
    case "settings/tokens":
      if (method === "GET") return tokens_list();
      if (method === "POST") return tokens_create(body);
      break;
    case "account":
      if (method === "DELETE") return account_delete(body);
      break;
    case "contact":
      if (method === "POST") return contact_post(body);
      break;
  }

  if (n === 2) {
    const [a, id] = segs;
    if (a === "agents") {
      if (method === "GET") return agents_get(id);
      if (method === "PATCH") return agents_update(id, body);
      if (method === "DELETE") return agents_delete(id);
    }
    if (a === "runs") {
      if (method === "GET") return runs_get(id);
    }
    if (a === "suites") {
      if (method === "GET") return suites_get(id);
      if (method === "PATCH") return suites_update(id, body);
      if (method === "DELETE") return suites_delete(id);
    }
  }
  if (n === 3) {
    const [a, id, tail] = segs;
    if (a === "agents" && tail === "test") {
      if (method === "POST") return agents_test(id);
    }
    if (a === "runs" && tail === "cancel") {
      if (method === "POST") return runs_cancel(id);
    }
    if (a === "suites" && tail === "duplicate") {
      if (method === "POST") return suites_duplicate(id);
    }
    if (a === "suites" && tail === "cases") {
      if (method === "POST") return suites_cases_create(id, body);
    }
    if (a === "settings" && segs[1] === "sessions") {
      if (method === "DELETE") return sessions_delete(tail);
    }
    if (a === "settings" && segs[1] === "tokens") {
      if (method === "DELETE") return tokens_delete(tail);
    }
  }
  if (n === 4) {
    const [a, id, mid, caseId] = segs;
    if (a === "suites" && mid === "cases") {
      if (method === "PATCH") return suites_cases_update(id, caseId, body);
      if (method === "DELETE") return suites_cases_delete(id, caseId);
    }
  }

  throw new LocalApiError(`No API route for ${method} /api/${key}.`, 404);
}

/**
 * Entry point used by the client api() wrapper (client.ts). Accepts the
 * same arguments the wrapper would have sent to fetch() and returns the
 * same JSON the server build would have produced.
 */
export async function localRequest(
  path: string,
  options: { method?: string; json?: unknown } = {}
): Promise<unknown> {
  if (typeof window === "undefined") {
    // Static prerender never issues requests; guard anyway.
    return null;
  }
  const [rawPath, rawQuery] = path.split("?");
  const query = new URLSearchParams(rawQuery ?? "");
  const method = (options.method ??
    (options.json !== undefined ? "POST" : "GET")) as Method;
  try {
    return await dispatchLocal(method, rawPath, query, options.json);
  } catch (e) {
    if (e instanceof LocalApiError) throw e;
    throw new LocalApiError("The local demo backend encountered an error.", 500);
  }
}

/** Re-exported so client.ts can normalize errors without importing twice. */
export { LocalApiError };

/* ========================================================================== */
/* Report exports — same payloads and filenames as the server build           */
/* ========================================================================== */

export function buildRunExport(runId: string, format: "json" | "csv"): string | null {
  if (typeof window === "undefined") return null;
  const auth = getAuth();
  if (!auth) return null;
  const s = db();
  const wsId =
    window.localStorage.getItem(WORKSPACE_KEY) ??
    s.memberships.find((m) => m.userId === auth.userId)?.workspaceId;
  const run = s.runs.find((r) => r.id === runId && r.workspaceId === wsId);
  if (!run) return null;
  const detail = mapRunDetail(runId, workspaceThreshold(run.workspaceId));
  if (!detail) return null;

  if (format === "csv") {
    const header = [
      "case_id",
      "order",
      "category",
      "severity",
      "title",
      "status",
      "failed_rules",
      "explanation",
      "recommendation",
      "tool_events",
      "duration_ms",
    ];
    const esc = (v: string) => `"${v.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
    const lines = [header.join(",")];
    for (const r of detail.results) {
      lines.push(
        [
          r.caseId,
          r.order,
          r.category,
          r.severity,
          r.title,
          r.status,
          r.ruleOutcomes.filter((o) => o.outcome === "FAIL").map((o) => o.label).join("; "),
          r.explanation,
          r.recommendation ?? "",
          r.toolEvents.map((e) => `${e.phase}:${e.name}(${e.status})`).join("; "),
          r.durationMs ?? "",
        ]
          .map((v) => esc(String(v)))
          .join(",")
      );
    }
    return lines.join("\n");
  }

  return JSON.stringify(
    {
      generatedAt: nowIso(),
      product: "AgentClear",
      report: detail,
      methodology: {
        score:
          "Score = passed / (passed + failed + inconclusive) * 100. Execution errors and not-executed cases are excluded from the denominator but never count as passes.",
        states: {
          PASS: "All evaluation criteria passed.",
          FAIL: "At least one criterion definitively failed.",
          INCONCLUSIVE: "Evidence required for one or more criteria was not available.",
          ERROR: "Execution error (timeout, HTTP failure, etc.) — not an evaluation result.",
          NOT_EXECUTED: "The run ended before this case executed.",
        },
        toolPhases: {
          REQUESTED: "The agent indicated a tool should be used.",
          OBSERVED: "An execution trace shows the tool call occurred.",
          CONFIRMED: "A trusted tool result confirmed the outcome.",
        },
      },
    },
    null,
    2
  );
}

/** Trigger a browser download of a run report (JSON or CSV). */
export function downloadRunReport(runId: string, format: "json" | "csv") {
  const content = buildRunExport(runId, format);
  if (content === null) return;
  const mime = format === "csv" ? "text/csv;charset=utf-8" : "application/json";
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `agentclear-report-${runId}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
