/**
 * AgentClear shared types — used by the evaluation engine, API routes,
 * seed data, and the frontend. Single source of truth for the product's
 * data language.
 */

/* ------------------------------------------------------------------ */
/* Enumerations                                                        */
/* ------------------------------------------------------------------ */

export type CaseCategory = "CORRECTNESS" | "TOOL_USAGE" | "SAFETY";

export type CaseSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

/** Individual test-case result states — kept strictly distinct. */
export type ResultStatus =
  | "PASS"
  | "FAIL"
  | "INCONCLUSIVE"
  | "ERROR"
  | "NOT_EXECUTED";

export type RunStatus =
  | "QUEUED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

/**
 * Tool-call verification levels:
 * - REQUESTED : the agent indicated a tool should be used (no execution proof)
 * - OBSERVED  : a reliable execution trace shows the tool call occurred
 * - CONFIRMED : a trusted tool result / external system confirmed the outcome
 */
export type ToolPhase = "REQUESTED" | "OBSERVED" | "CONFIRMED";

export type ToolCallStatus = "SUCCESS" | "FAILURE" | "UNKNOWN";

export type AgentType = "DEMO_SANDBOX" | "CUSTOM_HTTP";

export type AgentAuthType = "NONE" | "BEARER" | "HEADER" | "BASIC";

export type AgentConnectionStatus = "UNKNOWN" | "CONNECTED" | "FAILED";

/* ------------------------------------------------------------------ */
/* Evaluation rules                                                    */
/* ------------------------------------------------------------------ */

export type EvalRule =
  | {
      type: "mustInclude";
      label: string;
      value: string;
    }
  | {
      type: "mustIncludeAny";
      label: string;
      anyOf: string[];
    }
  | {
      type: "mustNotInclude";
      label: string;
      value: string;
    }
  | {
      type: "mustNotIncludeAny";
      label: string;
      anyOf: string[];
    }
  | {
      type: "mustNotMatch";
      label: string;
      pattern: string;
      flags?: string;
    }
  | {
      type: "requiredTool";
      label: string;
      tool: string;
      phase: ToolPhase;
      args?: Record<string, { equals?: string; contains?: string }>;
      /** optional: this tool must be observed before the named tool runs */
      before?: string;
    }
  | {
      type: "forbiddenTool";
      label: string;
      tool: string;
    }
  | {
      type: "maxToolCalls";
      label: string;
      max: number;
    }
  | {
      /** Any identifier matching claimPattern in the reply must appear in a
       * CONFIRMED tool result for the named tool (truthful claims). */
      type: "claimRequiresConfirmedTool";
      label: string;
      claimPattern: string;
      tool: string;
    };

export type RuleOutcomeStatus = "PASS" | "FAIL" | "NOT_EVIDENCED";

export interface RuleOutcome {
  label: string;
  ruleType: EvalRule["type"];
  outcome: RuleOutcomeStatus;
  detail: string;
}

/* ------------------------------------------------------------------ */
/* Test cases & suites                                                 */
/* ------------------------------------------------------------------ */

export interface TestCaseTurn {
  user: string;
}

export interface TestCaseData {
  /** Stable display id, e.g. "C-01" */
  id: string;
  /** Database id (present on DTOs loaded from the API) */
  dbId?: string;
  order: number;
  category: CaseCategory;
  severity: CaseSeverity;
  title: string;
  description: string;
  turns: TestCaseTurn[];
  expectedBehavior: string;
  /** Human description of the evidence required to trust a pass */
  evidence: string;
  rules: EvalRule[];
  /** Extra guidance shown when this case fails */
  failureHint?: string;
  tags?: string[];
}

export interface SuiteSummary {
  id: string;
  name: string;
  description: string;
  isStarter: boolean;
  caseCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SuiteDetail extends SuiteSummary {
  cases: TestCaseData[];
}

/* ------------------------------------------------------------------ */
/* Tool-call events & execution evidence                               */
/* ------------------------------------------------------------------ */

export interface ToolEventDTO {
  phase: ToolPhase;
  name: string;
  arguments?: Record<string, unknown>;
  status: ToolCallStatus;
  result?: unknown;
  timestamp?: string;
  /** which conversation turn produced this event */
  turn?: number;
}

export interface TurnEvidenceDTO {
  turnIndex: number;
  userMessage: string;
  requestPreview?: string;
  statusCode?: number;
  durationMs?: number;
  responsePreview?: string;
  parseError?: string;
}

/* ------------------------------------------------------------------ */
/* Results & runs                                                      */
/* ------------------------------------------------------------------ */

export interface CaseResultDTO {
  caseId: string;
  order: number;
  title: string;
  category: CaseCategory;
  severity: CaseSeverity;
  status: ResultStatus;
  explanation: string;
  recommendation?: string;
  observedReply?: string;
  expectedBehavior: string;
  evidence: string;
  failureHint?: string;
  turns: TurnEvidenceDTO[];
  toolEvents: ToolEventDTO[];
  ruleOutcomes: RuleOutcome[];
  durationMs?: number;
}

export interface CategoryBreakdown {
  total: number;
  passed: number;
  failed: number;
  inconclusive: number;
  errored: number;
  notExecuted: number;
}

export type CategoryBreakdownMap = Record<
  CaseCategory,
  CategoryBreakdown
>;

export interface RunSummaryDTO {
  id: string;
  agentId: string;
  agentName: string;
  agentType: AgentType;
  suiteId: string;
  suiteName: string;
  status: RunStatus;
  isSample: boolean;
  total: number;
  executed: number;
  passed: number;
  failed: number;
  inconclusive: number;
  errored: number;
  notExecuted: number;
  /** score = passed / (pass + fail + inconclusive) * 100, from saved results */
  score: number | null;
  threshold: number;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  createdBy: string;
  categories: CategoryBreakdownMap;
}

export interface RunDetailDTO extends RunSummaryDTO {
  results: CaseResultDTO[];
  limitations: string[];
}

/* ------------------------------------------------------------------ */
/* Agents                                                              */
/* ------------------------------------------------------------------ */

export interface AgentDTO {
  id: string;
  name: string;
  description: string;
  category: "CUSTOMER_SUPPORT";
  type: AgentType;
  endpointUrl: string | null;
  method: string;
  headers: Record<string, string>;
  bodyTemplate: string;
  responseField: string;
  toolCallsField: string;
  authType: AgentAuthType;
  authHeaderName: string | null;
  hasSecret: boolean;
  timeoutMs: number;
  expectedContentType: "JSON" | "TEXT";
  status: "ACTIVE" | "DISABLED";
  connectionStatus: AgentConnectionStatus;
  lastTestedAt: string | null;
  lastTestResult: ConnectionTestResultDTO | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectionTestResultDTO {
  ok: boolean;
  statusCode?: number;
  durationMs?: number;
  replyPreview?: string;
  error?: string;
  testedAt: string;
}

/* ------------------------------------------------------------------ */
/* Auth / workspace / settings                                         */
/* ------------------------------------------------------------------ */

export interface WorkspaceDTO {
  id: string;
  name: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  createdAt: string;
}

export interface SessionUserDTO {
  id: string;
  email: string;
  name: string;
}

export interface AuthSessionDTO {
  user: SessionUserDTO;
  workspaces: WorkspaceDTO[];
  currentWorkspaceId: string | null;
}

export interface SessionInfoDTO {
  id: string;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

export interface ApiTokenDTO {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  /** only returned once at creation */
  token?: string;
}

export interface SettingsDTO {
  workspace: {
    id: string;
    name: string;
    passThreshold: number;
    retentionDays: number;
  };
  user: SessionUserDTO;
}

export interface OverviewDTO {
  agentsConnected: number;
  latestRun: RunSummaryDTO | null;
  previousRun: RunSummaryDTO | null;
  scoreDelta: number | null;
  recentRuns: RunSummaryDTO[];
  recentFailures: {
    runId: string;
    runStatus: RunStatus;
    isSample: boolean;
    caseId: string;
    title: string;
    category: CaseCategory;
    severity: CaseSeverity;
    status: ResultStatus;
    explanation: string;
    completedAt: string | null;
  }[];
  hasAnyRealRun: boolean;
  onboarding: {
    hasAgent: boolean;
    hasSuite: boolean;
    hasRun: boolean;
  };
}

/* ------------------------------------------------------------------ */
/* Run comparison                                                      */
/* ------------------------------------------------------------------ */

export interface CompareCaseRow {
  caseId: string;
  order: number;
  title: string;
  category: CaseCategory;
  severity: CaseSeverity;
  statusA: ResultStatus;
  statusB: ResultStatus;
  regression: boolean;
  improvement: boolean;
}

export interface CompareDTO {
  runA: RunSummaryDTO;
  runB: RunSummaryDTO;
  rows: CompareCaseRow[];
  regressions: number;
  improvements: number;
}

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */

export const CATEGORY_LABELS: Record<CaseCategory, string> = {
  CORRECTNESS: "Correctness",
  TOOL_USAGE: "Tool usage",
  SAFETY: "Safety",
};

export const SEVERITY_LABELS: Record<CaseSeverity, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

export const RESULT_STATUS_LABELS: Record<ResultStatus, string> = {
  PASS: "Pass",
  FAIL: "Fail",
  INCONCLUSIVE: "Inconclusive",
  ERROR: "Error",
  NOT_EXECUTED: "Not executed",
};

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  QUEUED: "Queued",
  RUNNING: "Running",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

export const TOOL_PHASE_LABELS: Record<ToolPhase, string> = {
  REQUESTED: "Requested",
  OBSERVED: "Observed",
  CONFIRMED: "Confirmed",
};
