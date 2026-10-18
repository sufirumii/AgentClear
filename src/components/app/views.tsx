"use client";
import { ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, Bot, Check, ChevronDown, Copy, ListChecks, Minus, MoreHorizontal, Pencil, Play, PlayCircle, Plug, Plus, Power, PowerOff, ShieldCheck, Trash2, TriangleAlert, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { NewRunDialog } from "@/components/app/shell";
import { useSession } from "@/components/app/shell";
import { CategoryBadge, EmptyState, RunStatusBadge, SampleBadge, ScoreRing, SeverityBadge, Sparkline, StatusBadge } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api, formatDuration, formatRelative, formatScore, ruleSummary, useApiData, useHashRoute, verdict } from "@/lib/client";
import { AgentDTO, CaseCategory, CaseSeverity, ConnectionTestResultDTO, EvalRule, OverviewDTO, RunSummaryDTO, SuiteDetail, SuiteSummary, TestCaseData } from "@/lib/types";
import { cn } from "@/lib/utils";



/* ========================================================================== */
/* from src/components/app/overview.tsx */
/* ========================================================================== */

export function OverviewPage() {
  const { currentWorkspaceId } = useSession();
  const { navigate } = useHashRoute();
  const { data, loading, error } = useApiData<OverviewDTO>(
    currentWorkspaceId ? "/api/overview" : null
  );
  const [runOpen, setRunOpen] = React.useState(false);

  if (loading) return <OverviewSkeleton />;
  if (error)
    return (
      <EmptyState
        icon={<TriangleAlert />}
        title="Could not load your dashboard"
        description={error}
        action={<Button onClick={() => window.location.reload()}>Retry</Button>}
      />
    );
  if (!data) return null;

  const v = data.latestRun ? verdict(data.latestRun) : null;
  const realRuns = data.recentRuns.filter((r) => !r.isSample);
  const sampleRun = data.recentRuns.find((r) => r.isSample);
  const trend = realRuns
    .slice(0, 8)
    .reverse()
    .map((r) => r.score ?? 0)
    .filter((s) => s > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        actions={
          <Button onClick={() => setRunOpen(true)} className="gap-2">
            <PlayCircle className="size-4" /> New test run
          </Button>
        }
      />

      {/* onboarding banner */}
      {!data.onboarding.hasRun && (
        <div className="flex flex-col gap-3 rounded-xl border border-primary/25 bg-accent/60 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              Get started
              {data.onboarding.hasAgent && (
                <span className="text-xs font-normal text-muted-foreground">
                  agent connected · suite ready
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Run the 25-case starter suite against the demo sandbox agent — no
              credentials required.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/app/onboarding")}>
              Guided setup
            </Button>
            <Button onClick={() => setRunOpen(true)} className="gap-2">
              <PlayCircle className="size-4" /> Run starter suite
            </Button>
          </div>
        </div>
      )}

      {/* stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Bot className="size-4" />}
          label="Connected agents"
          value={String(data.agentsConnected)}
          hint="active connections"
          onClick={() => navigate("/app/agents")}
        />
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Latest evaluation
            </span>
            {v && (
              <span
                className={cn(
                  "text-xs font-medium",
                  v.tone === "pass" && "text-pass",
                  v.tone === "warn" && "text-warn",
                  v.tone === "fail" && "text-fail"
                )}
              >
                {v.label}
              </span>
            )}
          </div>
          <div className="mt-2 flex items-end gap-2">
            <span className="text-2xl font-semibold tabular-nums tracking-tight">
              {data.latestRun ? formatScore(data.latestRun.score) : "—"}
            </span>
            {data.scoreDelta !== null && (
              <span
                className={cn(
                  "mb-1 inline-flex items-center gap-0.5 text-xs font-medium",
                  data.scoreDelta > 0 && "text-pass",
                  data.scoreDelta < 0 && "text-fail",
                  data.scoreDelta === 0 && "text-muted-foreground"
                )}
              >
                {data.scoreDelta > 0 ? (
                  <ArrowUpRight className="size-3" />
                ) : data.scoreDelta < 0 ? (
                  <ArrowDownRight className="size-3" />
                ) : (
                  <Minus className="size-3" />
                )}
                {data.scoreDelta > 0 ? "+" : ""}
                {data.scoreDelta} vs previous
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {data.latestRun
              ? `${data.latestRun.suiteName} · ${formatRelative(data.latestRun.completedAt ?? data.latestRun.startedAt)}`
              : "No real runs yet"}
          </p>
          {trend.length > 1 && (
            <div className="mt-2">
              <Sparkline values={trend} width={180} height={30} />
            </div>
          )}
        </div>
        <StatCard
          icon={<TriangleAlert className="size-4" />}
          label="Open failures"
          value={String(data.recentFailures.length)}
          hint="in latest real run"
          tone={data.recentFailures.length > 0 ? "warn" : "neutral"}
        />
        <StatCard
          icon={<PlayCircle className="size-4" />}
          label="Recent runs"
          value={String(realRuns.length)}
          hint="executed test runs"
          onClick={() => navigate("/app/runs")}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* recent runs */}
        <div className="lg:col-span-3">
          <SectionHeading title="Recent test runs" />
          {data.recentRuns.length === 0 ? (
            <EmptyState
              icon={<PlayCircle />}
              title="No runs yet"
              description="Start your first test run to see results here."
              action={
                <Button onClick={() => setRunOpen(true)} className="gap-2">
                  <PlayCircle className="size-4" /> New test run
                </Button>
              }
            />
          ) : (
            <RecentRunsTable
              runs={data.recentRuns}
              onSelect={(id) => navigate(`/app/runs/${id}`)}
            />
          )}
        </div>

        {/* failures */}
        <div className="lg:col-span-2">
          <SectionHeading title="Most recent failures" />
          {data.recentFailures.length === 0 ? (
            <EmptyState
              title={data.hasAnyRealRun ? "No failures in the latest run" : "No real runs yet"}
              description={
                data.hasAnyRealRun
                  ? "The latest completed run had no failed or inconclusive cases."
                  : "Run the starter suite to see failures with full evidence here."
              }
              action={
                !data.hasAnyRealRun && sampleRun ? (
                  <Button
                    variant="outline"
                    onClick={() => navigate(`/app/reports/${sampleRun.id}`)}
                    className="gap-2"
                  >
                    Explore sample report <ArrowRight className="size-4" />
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="space-y-2">
              {data.recentFailures.map((f) => (
                <button
                  key={`${f.runId}-${f.caseId}`}
                  onClick={() => navigate(`/app/runs/${f.runId}?case=${f.caseId}`)}
                  className="w-full rounded-xl border bg-card p-3.5 text-left transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-center gap-2">
                    <StatusBadge status={f.status} />
                    <span className="font-mono text-xs text-muted-foreground">
                      {f.caseId}
                    </span>
                    <SeverityBadge severity={f.severity} className="ml-auto" />
                  </div>
                  <div className="mt-1.5 text-sm font-medium leading-snug">
                    {f.title}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {f.explanation}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <CategoryBadge category={f.category} />
                    {f.completedAt && formatRelative(f.completedAt)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <NewRunDialog open={runOpen} onOpenChange={setRunOpen} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

function SectionHeading({ title }: { title: string }) {
  return (
    <h2 className="mb-2.5 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
      {title}
    </h2>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  tone = "neutral",
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "warn";
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "rounded-xl border bg-card p-4 text-left",
        onClick && "transition-colors hover:bg-muted/40"
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </span>
        <span
          className={cn(
            "flex size-7 items-center justify-center rounded-lg",
            tone === "warn" ? "bg-warn-soft text-warn" : "bg-muted text-muted-foreground"
          )}
        >
          {icon}
        </span>
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
        {value}
      </div>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </button>
  );
}

function RecentRunsTable({
  runs,
  onSelect,
}: {
  runs: RunSummaryDTO[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">Run</th>
            <th className="hidden px-3 py-2.5 font-medium md:table-cell">Agent</th>
            <th className="px-3 py-2.5 font-medium">Score</th>
            <th className="hidden px-3 py-2.5 font-medium sm:table-cell">Results</th>
            <th className="hidden px-3 py-2.5 font-medium lg:table-cell">When</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {runs.map((r) => (
            <tr
              key={r.id}
              onClick={() => onSelect(r.id)}
              className="cursor-pointer transition-colors hover:bg-muted/30"
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <RunStatusBadge status={r.status} />
                  {r.isSample && <SampleBadge />}
                </div>
                <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                  {r.id.slice(0, 12)}
                </div>
              </td>
              <td className="hidden px-3 py-3 md:table-cell">
                <div className="max-w-40 truncate text-xs font-medium">
                  {r.agentName}
                </div>
                <div className="max-w-40 truncate text-[11px] text-muted-foreground">
                  {r.suiteName}
                </div>
              </td>
              <td className="px-3 py-3">
                <span className="font-semibold tabular-nums">
                  {formatScore(r.score)}
                </span>
                <div className="text-[11px] text-muted-foreground">
                  {r.threshold}% threshold
                </div>
              </td>
              <td className="hidden px-3 py-3 sm:table-cell">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] tabular-nums">
                  <span className="text-pass">{r.passed} pass</span>
                  {r.failed > 0 && <span className="text-fail">{r.failed} fail</span>}
                  {r.inconclusive > 0 && (
                    <span className="text-muted-foreground">{r.inconclusive} inconclusive</span>
                  )}
                  {r.errored > 0 && <span className="text-error">{r.errored} errors</span>}
                </div>
              </td>
              <td className="hidden px-3 py-3 text-xs text-muted-foreground lg:table-cell">
                {formatRelative(r.startedAt)}
                {r.durationMs != null && (
                  <div className="text-[11px]">{formatDuration(r.durationMs)}</div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-40 animate-pulse rounded-md bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl border bg-muted/50" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl border bg-muted/50" />
    </div>
  );
}


/* ========================================================================== */
/* from src/components/app/agents.tsx */
/* ========================================================================== */

const DEFAULT_TEMPLATE = `{
  "session_id": "{{session_id}}",
  "messages": {{history_json}}
}`;

/* ------------------------------------------------------------------ */
/* Agents list                                                         */
/* ------------------------------------------------------------------ */

export function AgentsPage() {
  const { currentWorkspaceId } = useSession();
  const { navigate } = useHashRoute();
  const { data, loading, refetch } = useApiData<{ agents: AgentDTO[] }>(
    currentWorkspaceId ? "/api/agents" : null
  );

  if (loading)
    return (
      <div className="space-y-4">
        <div className="h-8 w-40 animate-pulse rounded-md bg-muted" />
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border bg-muted/50" />
        ))}
      </div>
    );

  const agents = data?.agents ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agents"
        description="Connections to the AI agents you want to test."
        actions={
          <Button onClick={() => navigate("/app/agents/new")} className="gap-2">
            <Plus className="size-4" /> Add agent
          </Button>
        }
      />

      {agents.length === 0 ? (
        <EmptyState
          icon={<Bot />}
          title="No agents connected"
          description="Connect an agent through its API, or use the bundled demo sandbox agent to explore AgentClear with zero setup."
          action={
            <div className="flex gap-2">
              <Button onClick={() => navigate("/app/agents/new")} className="gap-2">
                <Plus className="size-4" /> Connect agent
              </Button>
            </div>
          }
        />
      ) : (
        <div className="space-y-3">
          {agents.map((a) => (
            <AgentCard key={a.id} agent={a} onChanged={refetch} />
          ))}
        </div>
      )}
    </div>
  );
}

function AgentCard({
  agent,
  onChanged,
}: {
  agent: AgentDTO;
  onChanged: () => void;
}) {
  const { navigate } = useHashRoute();
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const toggleStatus = async () => {
    try {
      await api(`/api/agents/${agent.id}`, {
        method: "PATCH",
        json: { status: agent.status === "ACTIVE" ? "DISABLED" : "ACTIVE" },
      });
      toast.success(
        agent.status === "ACTIVE" ? "Agent disabled" : "Agent enabled"
      );
      onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Update failed.");
    }
  };

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => navigate(`/app/agents/${agent.id}`)}
              className="text-sm font-semibold hover:underline"
            >
              {agent.name}
            </button>
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                agent.type === "DEMO_SANDBOX"
                  ? "border-primary/30 bg-accent text-accent-foreground"
                  : "border-border bg-muted text-muted-foreground"
              )}
            >
              {agent.type === "DEMO_SANDBOX" ? "Sandbox · internal" : "HTTP endpoint"}
            </span>
            {agent.status === "DISABLED" && (
              <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                Disabled
              </span>
            )}
          </div>
          <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
            {agent.description || "No description"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {agent.type === "CUSTOM_HTTP" ? (
              <span className="font-mono text-[11px]">
                {agent.method} {agent.endpointUrl}
              </span>
            ) : (
              <span>No network calls — runs inside the server</span>
            )}
            {agent.lastTestedAt && (
              <span>
                tested {formatRelative(agent.lastTestedAt)}
                {agent.lastTestResult?.durationMs != null &&
                  ` · ${formatDuration(agent.lastTestResult.durationMs)}`}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ConnectionChip agent={agent} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Agent actions">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate(`/app/agents/${agent.id}`)} className="gap-2">
                <Pencil className="size-4" /> Edit configuration
              </DropdownMenuItem>
              <DropdownMenuItem onClick={toggleStatus} className="gap-2">
                {agent.status === "ACTIVE" ? (
                  <>
                    <PowerOff className="size-4" /> Disable
                  </>
                ) : (
                  <>
                    <Power className="size-4" /> Enable
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setDeleteOpen(true)}
                className="gap-2 text-fail focus:text-fail"
              >
                <Trash2 className="size-4" /> Delete agent
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <DeleteAgentDialog
        agent={agent}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => {
          setDeleteOpen(false);
          onChanged();
        }}
      />
    </div>
  );
}

function ConnectionChip({ agent }: { agent: AgentDTO }) {
  const config = {
    CONNECTED: { cls: "border-pass/25 bg-pass-soft text-pass", icon: <Check className="size-3" />, label: "Connected" },
    FAILED: { cls: "border-fail/25 bg-fail-soft text-fail", icon: <X className="size-3" />, label: "Failing" },
    UNKNOWN: { cls: "border-border bg-muted text-muted-foreground", icon: <Plug className="size-3" />, label: "Not tested" },
  }[agent.connectionStatus];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        config.cls
      )}
    >
      {config.icon}
      {config.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Agent form (new / edit)                                             */
/* ------------------------------------------------------------------ */

interface FormState {
  name: string;
  description: string;
  type: "DEMO_SANDBOX" | "CUSTOM_HTTP";
  endpointUrl: string;
  method: string;
  headersText: string;
  bodyTemplate: string;
  responseField: string;
  toolCallsField: string;
  authType: "NONE" | "BEARER" | "HEADER" | "BASIC";
  authHeaderName: string;
  secret: string;
  timeoutMs: number;
  expectedContentType: "JSON" | "TEXT";
}

export function AgentFormPage({ agentId }: { agentId: string }) {
  const isNew = agentId === "new";
  const { navigate } = useHashRoute();
  const { data, loading } = useApiData<{ agent: AgentDTO }>(
    !isNew ? `/api/agents/${agentId}` : null
  );
  const [form, setForm] = React.useState<FormState | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [testResult, setTestResult] = React.useState<ConnectionTestResultDTO | null>(
    null
  );
  const [testing, setTesting] = React.useState(false);
  const [savedId, setSavedId] = React.useState<string | null>(isNew ? null : agentId);

  React.useEffect(() => {
    if (isNew) {
      setForm({
        name: "",
        description: "",
        type: "CUSTOM_HTTP",
        endpointUrl: "",
        method: "POST",
        headersText: '{\n  "Content-Type": "application/json"\n}',
        bodyTemplate: DEFAULT_TEMPLATE,
        responseField: "reply",
        toolCallsField: "tool_calls",
        authType: "NONE",
        authHeaderName: "",
        secret: "",
        timeoutMs: 15000,
        expectedContentType: "JSON",
      });
    } else if (data?.agent) {
      const a = data.agent;
      setForm({
        name: a.name,
        description: a.description,
        type: a.type,
        endpointUrl: a.endpointUrl ?? "",
        method: a.method,
        headersText: JSON.stringify(a.headers, null, 2),
        bodyTemplate: a.bodyTemplate,
        responseField: a.responseField,
        toolCallsField: a.toolCallsField,
        authType: a.authType,
        authHeaderName: a.authHeaderName ?? "",
        secret: "",
        timeoutMs: a.timeoutMs,
        expectedContentType: a.expectedContentType,
      });
      setTestResult(a.lastTestResult);
    }
  }, [isNew, data]);

  if (loading || !form) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
        <div className="h-96 animate-pulse rounded-xl border bg-muted/50" />
      </div>
    );
  }

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const validate = (): string | null => {
    if (!form.name.trim()) return "Agent name is required.";
    if (form.type === "CUSTOM_HTTP" && !form.endpointUrl.trim())
      return "Endpoint URL is required for HTTP agents.";
    if (form.type === "CUSTOM_HTTP") {
      try {
        new URL(form.endpointUrl.trim());
      } catch {
        return "The endpoint URL is not a valid URL.";
      }
    }
    try {
      const parsed = JSON.parse(form.headersText || "{}");
      if (typeof parsed !== "object" || Array.isArray(parsed))
        return "Headers must be a JSON object.";
    } catch {
      return "Headers must be valid JSON.";
    }
    return null;
  };

  const save = async () => {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let headers: Record<string, string>;
      try {
        headers = JSON.parse(form.headersText || "{}");
      } catch {
        headers = {};
      }
      const payload: Record<string, unknown> = {
        name: form.name,
        description: form.description,
        type: form.type,
        method: form.method,
        headers,
        bodyTemplate: form.bodyTemplate,
        responseField: form.responseField,
        toolCallsField: form.toolCallsField,
        authType: form.authType,
        timeoutMs: form.timeoutMs,
        expectedContentType: form.expectedContentType,
      };
      if (form.type === "CUSTOM_HTTP") payload.endpointUrl = form.endpointUrl.trim();
      if (form.authHeaderName.trim()) payload.authHeaderName = form.authHeaderName.trim();
      if (form.secret.length > 0) payload.secret = form.secret;

      const res = isNew
        ? await api<{ agent: AgentDTO }>("/api/agents", { json: payload })
        : await api<{ agent: AgentDTO }>(`/api/agents/${agentId}`, {
            method: "PATCH",
            json: payload,
          });
      toast.success(isNew ? "Agent connected" : "Agent updated");
      setSavedId(res.agent.id);
      setTestResult(res.agent.lastTestResult);
      if (isNew) navigate(`/app/agents/${res.agent.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    if (savedId === null) {
      setError("Save the agent before testing the connection.");
      return;
    }
    setTesting(true);
    setError(null);
    try {
      const res = await api<{ result: ConnectionTestResultDTO }>(
        `/api/agents/${savedId}/test`,
        { method: "POST" }
      );
      setTestResult(res.result);
      if (res.result.ok) toast.success("Connection verified");
      else toast.error("Connection test failed", { description: res.result.error });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Test failed.");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/app/agents")}
          aria-label="Back to agents"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <PageHeader
          title={isNew ? "Connect an agent" : `Edit ${form.name || "agent"}`}
          description={
            isNew
              ? "Point AgentClear at your agent's HTTP API, or pick the internal sandbox."
              : undefined
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* basics */}
          <section className="rounded-xl border bg-card p-5 space-y-4">
            <h2 className="text-sm font-semibold">Basics</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ag-name">Agent name</Label>
                <Input
                  id="ag-name"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Acme support agent"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ag-type">Agent type</Label>
                <select
                  id="ag-type"
                  value={form.type}
                  onChange={(e) =>
                    set("type", e.target.value as FormState["type"])
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs"
                >
                  <option value="CUSTOM_HTTP">Custom HTTP endpoint</option>
                  <option value="DEMO_SANDBOX">Demo sandbox agent (internal)</option>
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ag-desc">Description</Label>
              <Input
                id="ag-desc"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="What does this agent do?"
              />
            </div>
            {form.type === "DEMO_SANDBOX" && (
              <div className="flex gap-2 rounded-lg border border-primary/25 bg-accent/50 p-3 text-sm">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                <p className="text-accent-foreground">
                  The sandbox agent is a scripted customer-support bot
                  (&ldquo;Trailhead Outfitters&rdquo;) that runs entirely inside
                  the AgentClear server — no outbound network calls. It contains
                  deliberate flaws so you can explore real failures.
                </p>
              </div>
            )}
          </section>

          {form.type === "CUSTOM_HTTP" && (
            <>
              {/* endpoint */}
              <section className="rounded-xl border bg-card p-5 space-y-4">
                <h2 className="text-sm font-semibold">Endpoint</h2>
                <div className="grid gap-4 sm:grid-cols-4">
                  <div className="space-y-1.5 sm:col-span-1">
                    <Label htmlFor="ag-method">Method</Label>
                    <select
                      id="ag-method"
                      value={form.method}
                      onChange={(e) => set("method", e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs"
                    >
                      <option>POST</option>
                      <option>PUT</option>
                      <option>PATCH</option>
                    </select>
                  </div>
                  <div className="space-y-1.5 sm:col-span-3">
                    <Label htmlFor="ag-url">Endpoint URL</Label>
                    <Input
                      id="ag-url"
                      value={form.endpointUrl}
                      onChange={(e) => set("endpointUrl", e.target.value)}
                      placeholder="https://api.yourcompany.com/support-agent"
                      className="font-mono text-xs"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Validated server-side: private networks, loopback, and cloud
                      metadata addresses are blocked; redirects are refused.
                    </p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ag-timeout">Timeout (ms)</Label>
                    <Input
                      id="ag-timeout"
                      type="number"
                      min={1000}
                      max={120000}
                      step={500}
                      value={form.timeoutMs}
                      onChange={(e) => set("timeoutMs", Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ag-ct">Response format</Label>
                    <select
                      id="ag-ct"
                      value={form.expectedContentType}
                      onChange={(e) =>
                        set("expectedContentType", e.target.value as "JSON" | "TEXT")
                      }
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs"
                    >
                      <option value="JSON">JSON</option>
                      <option value="TEXT">Plain text</option>
                    </select>
                  </div>
                </div>
              </section>

              {/* request */}
              <section className="rounded-xl border bg-card p-5 space-y-4">
                <h2 className="text-sm font-semibold">Request</h2>
                <div className="space-y-1.5">
                  <Label htmlFor="ag-headers">Headers (JSON)</Label>
                  <Textarea
                    id="ag-headers"
                    value={form.headersText}
                    onChange={(e) => set("headersText", e.target.value)}
                    className="font-mono text-xs"
                    rows={3}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ag-body">Request body template</Label>
                  <Textarea
                    id="ag-body"
                    value={form.bodyTemplate}
                    onChange={(e) => set("bodyTemplate", e.target.value)}
                    className="font-mono text-xs"
                    rows={5}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Placeholders:{" "}
                    <code className="font-mono">{"{{session_id}}"}</code> (stable per
                    case), <code className="font-mono">{"{{message}}"}</code> (current
                    turn), <code className="font-mono">{"{{history_json}}"}</code>{" "}
                    (full conversation), <code className="font-mono">{"{{turn}}"}</code>{" "}
                    (index).
                  </p>
                </div>
              </section>

              {/* response mapping + auth */}
              <section className="rounded-xl border bg-card p-5 space-y-4">
                <h2 className="text-sm font-semibold">Response mapping & authentication</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="ag-resp">Reply field (dot path)</Label>
                    <Input
                      id="ag-resp"
                      value={form.responseField}
                      onChange={(e) => set("responseField", e.target.value)}
                      placeholder="reply"
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ag-tools">Tool-calls field (dot path)</Label>
                    <Input
                      id="ag-tools"
                      value={form.toolCallsField}
                      onChange={(e) => set("toolCallsField", e.target.value)}
                      placeholder="tool_calls"
                      className="font-mono text-xs"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Omit or leave empty if your agent can&apos;t emit tool
                      traces — tool checks will be reported as inconclusive.
                    </p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ag-auth">Authentication</Label>
                    <select
                      id="ag-auth"
                      value={form.authType}
                      onChange={(e) =>
                        set("authType", e.target.value as FormState["authType"])
                      }
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs"
                    >
                      <option value="NONE">None</option>
                      <option value="BEARER">Bearer token</option>
                      <option value="HEADER">Custom header</option>
                      <option value="BASIC">Basic auth</option>
                    </select>
                  </div>
                  {form.authType === "HEADER" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="ag-headername">Header name</Label>
                      <Input
                        id="ag-headername"
                        value={form.authHeaderName}
                        onChange={(e) => set("authHeaderName", e.target.value)}
                        placeholder="X-API-Key"
                        className="font-mono text-xs"
                      />
                    </div>
                  )}
                  {form.authType !== "NONE" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="ag-secret">Secret</Label>
                      <Input
                        id="ag-secret"
                        type="password"
                        value={form.secret}
                        onChange={(e) => set("secret", e.target.value)}
                        placeholder={
                          isNew ? "Paste the secret" : "•••• (saved — leave blank to keep)"
                        }
                        autoComplete="new-password"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Encrypted with AES-256-GCM before storage; never shown
                        again.
                      </p>
                    </div>
                  )}
                </div>
              </section>
            </>
          )}

          {error && (
            <p className="flex items-start gap-2 rounded-lg border border-fail/30 bg-fail-soft/50 p-3 text-sm text-fail">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : isNew ? "Create agent" : "Save changes"}
            </Button>
            <Button variant="outline" onClick={() => navigate("/app/agents")}>
              Cancel
            </Button>
          </div>
        </div>

        {/* connection test panel */}
        <div className="space-y-4">
          <section className="rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold">Connection test</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Sends one harmless greeting through the configured template and
              validates the response shape before you run a suite.
            </p>
            <Button
              onClick={testConnection}
              disabled={testing || savedId === null}
              variant={testResult?.ok ? "outline" : "default"}
              className="mt-3 w-full gap-2"
            >
              {testing ? (
                <>
                  <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />
                  Testing…
                </>
              ) : (
                <>
                  <Plug className="size-4" /> Test connection
                </>
              )}
            </Button>
            {savedId === null && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Save the agent first to enable testing.
              </p>
            )}
            {testResult && (
              <div
                className={cn(
                  "mt-4 rounded-lg border p-3 text-sm",
                  testResult.ok
                    ? "border-pass/25 bg-pass-soft/40"
                    : "border-fail/25 bg-fail-soft/40"
                )}
              >
                <div className="flex items-center gap-2 font-medium">
                  {testResult.ok ? (
                    <>
                      <Check className="size-4 text-pass" />
                      <span className="text-pass">Connection verified</span>
                    </>
                  ) : (
                    <>
                      <X className="size-4 text-fail" />
                      <span className="text-fail">Connection failed</span>
                    </>
                  )}
                </div>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {testResult.statusCode != null && (
                    <div className="tabular-nums">
                      HTTP {testResult.statusCode} · {formatDuration(testResult.durationMs)}
                    </div>
                  )}
                  {testResult.replyPreview && (
                    <div className="rounded-md bg-card px-2 py-1.5 font-mono text-[11px] leading-relaxed">
                      “{testResult.replyPreview}”
                    </div>
                  )}
                  {testResult.error && (
                    <p className="text-fail">{testResult.error}</p>
                  )}
                  {"note" in testResult && (testResult as { note?: string }).note && (
                    <p className="italic">{(testResult as { note?: string }).note}</p>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function DeleteAgentDialog({
  agent,
  open,
  onOpenChange,
  onDeleted,
}: {
  agent: AgentDTO;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDeleted: () => void;
}) {
  const [confirmText, setConfirmText] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete “{agent.name}”?</DialogTitle>
          <DialogDescription>
            This removes the connection configuration (including its encrypted
            secret). Historical runs and their evidence are preserved.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="del-agent-confirm">
            Type <span className="font-mono font-semibold">DELETE</span> to confirm
          </Label>
          <Input
            id="del-agent-confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={confirmText !== "DELETE" || deleting}
            onClick={async () => {
              setDeleting(true);
              try {
                await api(`/api/agents/${agent.id}`, { method: "DELETE" });
                toast.success("Agent deleted");
                onDeleted();
              } catch (e) {
                toast.error(e instanceof ApiError ? e.message : "Delete failed.");
              } finally {
                setDeleting(false);
                setConfirmText("");
              }
            }}
          >
            {deleting ? "Deleting…" : "Delete agent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


/* ========================================================================== */
/* from src/components/app/suites.tsx */
/* ========================================================================== */

/* ------------------------------------------------------------------ */
/* Suites list                                                         */
/* ------------------------------------------------------------------ */

export function SuitesPage() {
  const { currentWorkspaceId } = useSession();
  const { navigate } = useHashRoute();
  const { data, loading, refetch } = useApiData<{ suites: SuiteSummary[] }>(
    currentWorkspaceId ? "/api/suites" : null
  );

  if (loading)
    return (
      <div className="space-y-4">
        <div className="h-8 w-40 animate-pulse rounded-md bg-muted" />
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl border bg-muted/50" />
        ))}
      </div>
    );

  const suites = data?.suites ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Test suites"
        description="Repeatable sets of test cases with expected behavior and evaluation criteria."
        actions={
          <Button onClick={() => navigate("/app/suites/new")} className="gap-2">
            <Plus className="size-4" /> New suite
          </Button>
        }
      />

      {suites.length === 0 ? (
        <EmptyState
          icon={<ListChecks />}
          title="No test suites"
          description="Create a suite of test cases, or duplicate the starter suite to customize it."
        />
      ) : (
        <div className="space-y-3">
          {suites.map((s) => (
            <div
              key={s.id}
              className="group rounded-xl border bg-card p-4 transition-colors hover:bg-muted/20"
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => navigate(`/app/suites/${s.id}`)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold group-hover:underline">
                      {s.name}
                    </span>
                    {s.isStarter && (
                      <span className="rounded-full border border-primary/30 bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
                        Starter · seeded
                      </span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                    {s.description || "No description"}
                  </p>
                  <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
                    {s.caseCount} test cases
                  </p>
                </button>
                <SuiteActions suite={s} onChanged={refetch} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SuiteActions({
  suite,
  onChanged,
}: {
  suite: SuiteSummary;
  onChanged: () => void;
}) {
  const { navigate } = useHashRoute();
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [confirmText, setConfirmText] = React.useState("");

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Duplicate suite"
        onClick={async () => {
          try {
            await api(`/api/suites/${suite.id}/duplicate`, { method: "POST" });
            toast.success("Suite duplicated");
            onChanged();
          } catch (e) {
            toast.error(e instanceof ApiError ? e.message : "Duplicate failed.");
          }
        }}
      >
        <Copy className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Delete suite"
        className="text-muted-foreground hover:text-fail"
        onClick={() => setDeleteOpen(true)}
      >
        <Trash2 className="size-4" />
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5"
        onClick={() => navigate(`/app/suites/${suite.id}`)}
      >
        Open
      </Button>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete “{suite.name}”?</DialogTitle>
            <DialogDescription>
              The suite and its {suite.caseCount} cases will be removed. Runs
              already executed keep their evidence.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="del-suite">
              Type <span className="font-mono font-semibold">DELETE</span> to confirm
            </Label>
            <Input
              id="del-suite"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={confirmText !== "DELETE"}
              onClick={async () => {
                try {
                  await api(`/api/suites/${suite.id}`, { method: "DELETE" });
                  toast.success("Suite deleted");
                  setDeleteOpen(false);
                  onChanged();
                } catch (e) {
                  toast.error(e instanceof ApiError ? e.message : "Delete failed.");
                }
              }}
            >
              Delete suite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Suite detail                                                        */
/* ------------------------------------------------------------------ */

export function SuiteDetailPage({ suiteId }: { suiteId: string }) {
  const { navigate } = useHashRoute();
  const { data, loading, refetch } = useApiData<{ suite: SuiteDetail }>(
    suiteId !== "new" ? `/api/suites/${suiteId}` : null
  );
  const [runOpen, setRunOpen] = React.useState(false);
  const [editingCase, setEditingCase] = React.useState<TestCaseData | null>(null);
  const [creatingCase, setCreatingCase] = React.useState(false);
  const [metaOpen, setMetaOpen] = React.useState(false);

  if (suiteId === "new") return <NewSuitePage />;

  if (loading || !data)
    return (
      <div className="space-y-4">
        <div className="h-8 w-56 animate-pulse rounded-md bg-muted" />
        <div className="h-96 animate-pulse rounded-xl border bg-muted/50" />
      </div>
    );

  const suite = data.suite;
  const byCat = (c: CaseCategory) =>
    suite.cases.filter((x) => x.category === c).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/app/suites")}
          aria-label="Back to suites"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <PageHeader
          title={suite.name}
          description={suite.description || undefined}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setMetaOpen(true)} className="gap-2">
                <Pencil className="size-4" /> Edit
              </Button>
              <Button onClick={() => setRunOpen(true)} className="gap-2">
                <Play className="size-4" /> Run suite
              </Button>
            </div>
          }
        />
      </div>

      <div className="flex flex-wrap gap-4 rounded-xl border bg-card px-4 py-3 text-sm">
        <span className="tabular-nums">
          <strong className="font-semibold">{suite.cases.length}</strong>{" "}
          <span className="text-muted-foreground">cases</span>
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="tabular-nums">
          <strong className="font-semibold">{byCat("CORRECTNESS")}</strong>{" "}
          <span className="text-muted-foreground">correctness</span>
        </span>
        <span className="tabular-nums">
          <strong className="font-semibold">{byCat("TOOL_USAGE")}</strong>{" "}
          <span className="text-muted-foreground">tool usage</span>
        </span>
        <span className="tabular-nums">
          <strong className="font-semibold">{byCat("SAFETY")}</strong>{" "}
          <span className="text-muted-foreground">safety</span>
        </span>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto gap-2"
          onClick={() => setCreatingCase(true)}
        >
          <Plus className="size-4" /> Add test case
        </Button>
      </div>

      {/* case list */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Case</th>
              <th className="hidden px-3 py-2.5 font-medium md:table-cell">Category</th>
              <th className="hidden px-3 py-2.5 font-medium sm:table-cell">Severity</th>
              <th className="hidden px-3 py-2.5 font-medium lg:table-cell">Criteria</th>
              <th className="hidden px-3 py-2.5 font-medium lg:table-cell">Turns</th>
              <th className="w-10 px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {suite.cases.map((c) => (
              <tr
                key={c.id}
                className="cursor-pointer transition-colors hover:bg-muted/30"
                onClick={() => setEditingCase(c)}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {c.id}
                    </span>
                    <span className="font-medium">{c.title}</span>
                  </div>
                </td>
                <td className="hidden px-3 py-3 md:table-cell">
                  <CategoryBadge category={c.category} />
                </td>
                <td className="hidden px-3 py-3 sm:table-cell">
                  <SeverityBadge severity={c.severity} />
                </td>
                <td className="hidden px-3 py-3 text-xs text-muted-foreground lg:table-cell tabular-nums">
                  {c.rules.length} rules
                </td>
                <td className="hidden px-3 py-3 text-xs text-muted-foreground lg:table-cell tabular-nums">
                  {c.turns.length}
                </td>
                <td className="px-3 py-3">
                  <ChevronDown className="size-4 -rotate-90 text-muted-foreground" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <NewRunDialog
        open={runOpen}
        onOpenChange={setRunOpen}
        presetSuiteId={suite.id}
      />
      {(editingCase || creatingCase) && (
        <CaseEditorDialog
          suiteId={suite.id}
          testCase={creatingCase ? null : editingCase}
          existingIds={suite.cases.map((c) => c.id)}
          onClose={() => {
            setEditingCase(null);
            setCreatingCase(false);
          }}
          onSaved={() => {
            setEditingCase(null);
            setCreatingCase(false);
            refetch();
          }}
        />
      )}
      <SuiteMetaDialog
        suite={suite}
        open={metaOpen}
        onOpenChange={setMetaOpen}
        onSaved={refetch}
      />
    </div>
  );
}

function NewSuitePage() {
  const { navigate } = useHashRoute();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/app/suites")}
          aria-label="Back to suites"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <PageHeader
          title="New test suite"
          description="Create an empty suite, then add test cases with expected behavior and evaluation rules."
        />
      </div>
      <div className="space-y-4 rounded-xl border bg-card p-5">
        <div className="space-y-1.5">
          <Label htmlFor="ns-name">Suite name</Label>
          <Input
            id="ns-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Refund flows — edge cases"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ns-desc">Description</Label>
          <Textarea
            id="ns-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="What does this suite cover?"
          />
        </div>
        {error && <p className="text-sm text-fail">{error}</p>}
        <div className="flex gap-2">
          <Button
            disabled={saving || !name.trim()}
            onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                const res = await api<{ suite: SuiteSummary }>("/api/suites", {
                  json: { name, description },
                });
                toast.success("Suite created");
                navigate(`/app/suites/${res.suite.id}`);
              } catch (e) {
                setError(e instanceof ApiError ? e.message : "Creation failed.");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Creating…" : "Create suite"}
          </Button>
          <Button variant="outline" onClick={() => navigate("/app/suites")}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

function SuiteMetaDialog({
  suite,
  open,
  onOpenChange,
  onSaved,
}: {
  suite: SuiteDetail;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState(suite.name);
  const [description, setDescription] = React.useState(suite.description);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setName(suite.name);
    setDescription(suite.description);
  }, [suite]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit suite</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="em-name">Name</Label>
            <Input id="em-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="em-desc">Description</Label>
            <Textarea
              id="em-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={saving || !name.trim()}
            onClick={async () => {
              setSaving(true);
              try {
                await api(`/api/suites/${suite.id}`, {
                  method: "PATCH",
                  json: { name, description },
                });
                toast.success("Suite updated");
                onOpenChange(false);
                onSaved();
              } catch (e) {
                toast.error(e instanceof ApiError ? e.message : "Update failed.");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Case editor dialog                                                  */
/* ------------------------------------------------------------------ */

const RULE_TYPES: { value: EvalRule["type"]; label: string }[] = [
  { value: "mustInclude", label: "Reply must contain…" },
  { value: "mustIncludeAny", label: "Reply must contain one of…" },
  { value: "mustNotInclude", label: "Reply must not contain…" },
  { value: "mustNotIncludeAny", label: "Reply must not contain any of…" },
  { value: "mustNotMatch", label: "Reply must not match pattern" },
  { value: "requiredTool", label: "Required tool call" },
  { value: "forbiddenTool", label: "Forbidden tool call" },
  { value: "maxToolCalls", label: "Maximum tool calls" },
  { value: "claimRequiresConfirmedTool", label: "Claimed IDs need confirmation" },
];

function CaseEditorDialog({
  suiteId,
  testCase,
  existingIds,
  onClose,
  onSaved,
}: {
  suiteId: string;
  testCase: TestCaseData | null;
  existingIds: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = testCase !== null;
  const [displayId, setDisplayId] = React.useState("C-26");
  const [category, setCategory] = React.useState<CaseCategory>("CORRECTNESS");
  const [severity, setSeverity] = React.useState<CaseSeverity>("HIGH");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [turns, setTurns] = React.useState<string[]>([""]);
  const [expectedBehavior, setExpectedBehavior] = React.useState("");
  const [evidence, setEvidence] = React.useState("");
  const [failureHint, setFailureHint] = React.useState("");
  const [rules, setRules] = React.useState<EvalRule[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (testCase) {
      setDisplayId(testCase.id);
      setCategory(testCase.category);
      setSeverity(testCase.severity);
      setTitle(testCase.title);
      setDescription(testCase.description);
      setTurns(testCase.turns.map((t) => t.user));
      setExpectedBehavior(testCase.expectedBehavior);
      setEvidence(testCase.evidence);
      setFailureHint(testCase.failureHint ?? "");
      setRules(testCase.rules);
    }
  }, [testCase]);

  const addRule = (type: EvalRule["type"]) => {
    const base: EvalRule =
      type === "mustInclude"
        ? { type, label: "New required phrase", value: "" }
        : type === "mustIncludeAny"
          ? { type, label: "New alternative phrases", anyOf: [""] }
          : type === "mustNotInclude"
            ? { type, label: "New forbidden phrase", value: "" }
            : type === "mustNotIncludeAny"
              ? { type, label: "New forbidden phrases", anyOf: [""] }
              : type === "mustNotMatch"
                ? { type, label: "New forbidden pattern", pattern: "" }
                : type === "requiredTool"
                  ? { type, label: "New required tool", tool: "", phase: "OBSERVED" }
                  : type === "forbiddenTool"
                    ? { type, label: "New forbidden tool", tool: "" }
                    : type === "maxToolCalls"
                      ? { type, label: "Tool call limit", max: 2 }
                      : { type, label: "Claims need confirmation", claimPattern: "(TKT-\\d+)", tool: "" };
    setRules((r) => [...r, base]);
  };

  const updateRule = (i: number, patch: Partial<EvalRule>) =>
    setRules((r) => r.map((rule, idx) => (idx === i ? ({ ...rule, ...patch } as EvalRule) : rule)));

  const validate = (): string | null => {
    if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(displayId.trim()))
      return "Case id may contain letters, digits and dashes.";
    if (isEdit
        ? displayId !== testCase!.id && existingIds.includes(displayId)
        : existingIds.includes(displayId))
      return `Case id "${displayId}" already exists in this suite.`;
    if (!title.trim()) return "Title is required.";
    if (turns.some((t) => !t.trim())) return "Every turn needs text.";
    if (!expectedBehavior.trim()) return "Expected behavior is required.";
    for (const rule of rules) {
      if (!rule.label?.trim()) return "Every rule needs a label.";
      if (rule.type === "mustInclude" && !rule.value.trim())
        return "mustInclude rules need a value.";
      if (
        (rule.type === "mustIncludeAny" || rule.type === "mustNotIncludeAny") &&
        rule.anyOf.some((a) => !a.trim())
      )
        return "Phrase-list rules need at least one phrase.";
      if (rule.type === "mustNotMatch") {
        try {
          new RegExp(rule.pattern);
        } catch {
          return "Invalid regex pattern in a rule.";
        }
      }
      if ((rule.type === "requiredTool" || rule.type === "forbiddenTool" || rule.type === "claimRequiresConfirmedTool") && !rule.tool?.trim())
        return "Tool rules need a tool name.";
    }
    return null;
  };

  const save = async () => {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      displayId: displayId.trim(),
      category,
      severity,
      title: title.trim(),
      description,
      turns: turns.filter((t) => t.trim()).map((t) => ({ user: t })),
      expectedBehavior,
      evidence,
      failureHint: failureHint.trim() || null,
      rules: rules.map((r) => {
        const copy = { ...r } as Record<string, unknown>;
        if ("anyOf" in copy && Array.isArray(copy.anyOf)) {
          copy.anyOf = (copy.anyOf as string[]).map((x) => x.trim()).filter(Boolean);
        }
        return copy;
      }),
    };
    try {
      if (isEdit) {
        await api(`/api/suites/${suiteId}/cases/${testCase!.dbId ?? testCase!.id}`, {
          method: "PATCH",
          json: payload,
        });
      } else {
        await api(`/api/suites/${suiteId}/cases`, { json: payload });
      }
      toast.success(isEdit ? "Test case saved" : "Test case added");
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit case ${testCase!.id}` : "Add test case"}</DialogTitle>
          <DialogDescription>
            Define the input, expected behavior, and the criteria that decide
            pass, fail, or inconclusive.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="ce-id">Case id</Label>
              <Input
                id="ce-id"
                value={displayId}
                onChange={(e) => setDisplayId(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as CaseCategory)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CORRECTNESS">Correctness</SelectItem>
                  <SelectItem value="TOOL_USAGE">Tool usage</SelectItem>
                  <SelectItem value="SAFETY">Safety</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Severity</Label>
              <Select
                value={severity}
                onValueChange={(v) => setSeverity(v as CaseSeverity)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CRITICAL">Critical</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="LOW">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ce-title">Title</Label>
            <Input
              id="ce-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Answers refund-eligibility questions correctly"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Conversation turns</Label>
            {turns.map((t, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="mt-2.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground">
                  {i + 1}
                </span>
                <Textarea
                  value={t}
                  onChange={(e) =>
                    setTurns((ts) => ts.map((x, j) => (j === i ? e.target.value : x)))
                  }
                  rows={2}
                  placeholder={`User message ${i + 1}`}
                  className="text-sm"
                />
                {turns.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mt-1"
                    aria-label={`Remove turn ${i + 1}`}
                    onClick={() => setTurns((ts) => ts.filter((_, j) => j !== i))}
                  >
                    <X className="size-4" />
                  </Button>
                )}
              </div>
            ))}
            {turns.length < 10 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTurns((ts) => [...ts, ""])}
                className="gap-1.5"
              >
                <Plus className="size-3.5" /> Add turn
              </Button>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ce-expected">Expected behavior</Label>
            <Textarea
              id="ce-expected"
              value={expectedBehavior}
              onChange={(e) => setExpectedBehavior(e.target.value)}
              rows={2}
              placeholder="What should the agent do?"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ce-evidence">Evidence required</Label>
            <Input
              id="ce-evidence"
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              placeholder="What evidence makes a pass trustworthy?"
            />
          </div>

          {/* rules */}
          <div className="space-y-2.5">
            <Label>Evaluation criteria ({rules.length})</Label>
            {rules.map((rule, i) => (
              <RuleEditor
                key={i}
                rule={rule}
                onChange={(patch) => updateRule(i, patch)}
                onRemove={() => setRules((r) => r.filter((_, j) => j !== i))}
              />
            ))}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {RULE_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => addRule(t.value)}
                  className="rounded-full border border-dashed px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                >
                  + {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ce-hint">Fix hint (shown when this case fails)</Label>
            <Input
              id="ce-hint"
              value={failureHint}
              onChange={(e) => setFailureHint(e.target.value)}
              placeholder="Optional guidance for whoever fixes the agent"
            />
          </div>

          {error && (
            <p className="rounded-lg border border-fail/30 bg-fail-soft/50 p-3 text-sm text-fail">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          {isEdit && (
            <Button
              variant="ghost"
              className="mr-auto gap-2 text-fail hover:text-fail"
              onClick={async () => {
                try {
                  await api(`/api/suites/${suiteId}/cases/${testCase!.dbId ?? testCase!.id}`, {
                    method: "DELETE",
                  });
                  toast.success("Test case deleted");
                  onSaved();
                } catch (e) {
                  toast.error(e instanceof ApiError ? e.message : "Delete failed.");
                }
              }}
            >
              <Trash2 className="size-4" /> Delete case
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save case" : "Add case"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RuleEditor({
  rule,
  onChange,
  onRemove,
}: {
  rule: EvalRule;
  onChange: (patch: Partial<EvalRule>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-card px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
          {rule.type}
        </span>
        <Input
          value={rule.label}
          onChange={(e) => onChange({ label: e.target.value } as Partial<EvalRule>)}
          className="h-7 flex-1 text-xs"
          aria-label="Rule label"
        />
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={onRemove}
          aria-label="Remove rule"
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        {ruleSummary(rule)}
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {rule.type === "mustInclude" && (
          <TextInput
            value={rule.value}
            onChange={(v) => onChange({ value: v } as Partial<EvalRule>)}
            placeholder="Required phrase"
          />
        )}
        {rule.type === "mustNotInclude" && (
          <TextInput
            value={rule.value}
            onChange={(v) => onChange({ value: v } as Partial<EvalRule>)}
            placeholder="Forbidden phrase"
          />
        )}
        {(rule.type === "mustIncludeAny" || rule.type === "mustNotIncludeAny") && (
          <div className="sm:col-span-2 space-y-1">
            {rule.anyOf.map((a, i) => (
              <div key={i} className="flex gap-1.5">
                <TextInput
                  value={a}
                  onChange={(v) =>
                    onChange({
                      anyOf: rule.anyOf.map((x, j) => (j === i ? v : x)),
                    } as Partial<EvalRule>)
                  }
                  placeholder={`Alternative ${i + 1}`}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  aria-label="Remove phrase"
                  onClick={() =>
                    onChange({
                      anyOf: rule.anyOf.filter((_, j) => j !== i),
                    } as Partial<EvalRule>)
                  }
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 text-xs"
              onClick={() =>
                onChange({ anyOf: [...rule.anyOf, ""] } as Partial<EvalRule>)
              }
            >
              <Plus className="size-3" /> Add phrase
            </Button>
          </div>
        )}
        {rule.type === "mustNotMatch" && (
          <TextInput
            value={rule.pattern}
            onChange={(v) => onChange({ pattern: v } as Partial<EvalRule>)}
            placeholder="Regular expression"
            mono
          />
        )}
        {(rule.type === "requiredTool" || rule.type === "forbiddenTool") && (
          <TextInput
            value={rule.tool}
            onChange={(v) => onChange({ tool: v } as Partial<EvalRule>)}
            placeholder="Tool name (e.g. get_order)"
            mono
          />
        )}
        {rule.type === "requiredTool" && (
          <>
            <select
              value={rule.phase}
              onChange={(e) =>
                onChange({ phase: e.target.value as "REQUESTED" | "OBSERVED" | "CONFIRMED" })
              }
              className="h-7 rounded-md border border-input bg-background px-2 text-xs"
              aria-label="Required phase"
            >
              <option value="REQUESTED">must be requested</option>
              <option value="OBSERVED">must be observed</option>
              <option value="CONFIRMED">must be confirmed</option>
            </select>
            <TextInput
              value={rule.before ?? ""}
              onChange={(v) => onChange({ before: v || undefined } as Partial<EvalRule>)}
              placeholder="must run before (tool name, optional)"
              mono
            />
          </>
        )}
        {rule.type === "maxToolCalls" && (
          <Input
            type="number"
            min={1}
            max={100}
            value={rule.max}
            onChange={(e) => onChange({ max: Number(e.target.value) } as Partial<EvalRule>)}
            className="h-7 w-24 text-xs"
            aria-label="Maximum tool calls"
          />
        )}
        {rule.type === "claimRequiresConfirmedTool" && (
          <>
            <TextInput
              value={rule.claimPattern}
              onChange={(v) => onChange({ claimPattern: v } as Partial<EvalRule>)}
              placeholder="Regex capturing claimed IDs"
              mono
            />
            <TextInput
              value={rule.tool}
              onChange={(v) => onChange({ tool: v } as Partial<EvalRule>)}
              placeholder="Tool that must confirm"
              mono
            />
          </>
        )}
      </div>
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  mono,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn("h-7 text-xs", mono && "font-mono")}
    />
  );
}
