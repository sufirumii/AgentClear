"use client";
import { ArrowLeft, ArrowRight, ArrowUpDown, Ban, Check, ChevronDown, ChevronRight, Clock, Download, FileJson, FileText, GitCompareArrows, HelpCircle, Lightbulb, PlayCircle, TriangleAlert, Wrench, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { NewRunDialog } from "@/components/app/shell";
import { PageHeader } from "@/components/app/views";
import { useSession } from "@/components/app/shell";
import { CategoryBadge, CategoryBar, EmptyState, PhaseBadge, ResultLegend, RunStatusBadge, SampleBadge, ScoreRing, SeverityBadge, StatusBadge } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, api, formatDateTime, formatDuration, formatRelative, formatScore, useApiData, useHashRoute, verdict } from "@/lib/client";
import { downloadRunReport } from "@/lib/local";
import { buildSampleRunDetail } from "@/lib/starter-suite";
import { CATEGORY_LABELS, CaseCategory, CaseResultDTO, CompareDTO, ResultStatus, RunDetailDTO, RunSummaryDTO } from "@/lib/types";
import { cn } from "@/lib/utils";



/* ========================================================================== */
/* from src/components/app/runs.tsx */
/* ========================================================================== */

type Filter = "ALL" | "REAL" | "SAMPLE";

export function RunsPage() {
  const { currentWorkspaceId } = useSession();
  const { navigate } = useHashRoute();
  const { data, loading } = useApiData<{ runs: RunSummaryDTO[] }>(
    currentWorkspaceId ? "/api/runs" : null
  );
  const [filter, setFilter] = React.useState<Filter>("ALL");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [runOpen, setRunOpen] = React.useState(false);

  if (loading)
    return (
      <div className="space-y-4">
        <div className="h-8 w-40 animate-pulse rounded-md bg-muted" />
        <div className="h-72 animate-pulse rounded-xl border bg-muted/50" />
      </div>
    );

  const all = data?.runs ?? [];
  const runs = all.filter((r) =>
    filter === "ALL" ? true : filter === "SAMPLE" ? r.isSample : !r.isSample
  );
  const selectedRuns = all.filter((r) => selected.has(r.id));
  const sameSuite =
    selectedRuns.length === 2 &&
    (selectedRuns[0].suiteId === selectedRuns[1].suiteId ||
      selectedRuns[0].suiteName === selectedRuns[1].suiteName);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 2) next.add(id);
      else toast.message("Select at most two runs to compare");
      return next;
    });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Test runs"
        description="Real execution history. Sample runs are simulated data and clearly labeled."
        actions={
          <Button onClick={() => setRunOpen(true)} className="gap-2">
            <PlayCircle className="size-4" /> New test run
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["ALL", `All (${all.length})`],
            ["REAL", `Real (${all.filter((r) => !r.isSample).length})`],
            ["SAMPLE", `Sample (${all.filter((r) => r.isSample).length})`],
          ] as [Filter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              filter === key
                ? "border-primary/40 bg-accent text-accent-foreground"
                : "border-border bg-background text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
        {selected.size === 2 && (
          <Button
            size="sm"
            className="ml-auto gap-2"
            variant={sameSuite ? "default" : "outline"}
            onClick={() => {
              const [a, b] = selectedRuns.map((r) => r.id);
              if (!sameSuite) {
                toast.error("Runs of different suites cannot be compared case-by-case.");
                return;
              }
              navigate(`/app/runs/compare?a=${a}&b=${b}`);
            }}
          >
            <GitCompareArrows className="size-4" />
            Compare selected
          </Button>
        )}
      </div>

      {runs.length === 0 ? (
        <EmptyState
          icon={<PlayCircle />}
          title={filter === "ALL" ? "No runs yet" : `No ${filter.toLowerCase()} runs`}
          description="Start a test run from a suite, or explore the seeded sample report first."
          action={
            <Button onClick={() => setRunOpen(true)} className="gap-2">
              <PlayCircle className="size-4" /> New test run
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="w-8 px-3 py-2.5" />
                <th className="px-3 py-2.5 font-medium">Run</th>
                <th className="px-3 py-2.5 font-medium">Agent / suite</th>
                <th className="px-3 py-2.5 font-medium">Score</th>
                <th className="px-3 py-2.5 font-medium">Breakdown</th>
                <th className="px-3 py-2.5 font-medium">Started</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {runs.map((r) => (
                <tr
                  key={r.id}
                  className={cn(
                    "cursor-pointer transition-colors hover:bg-muted/30",
                    selected.has(r.id) && "bg-accent/40"
                  )}
                >
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    {r.status === "COMPLETED" && (
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggle(r.id)}
                        className="size-4 accent-primary"
                        aria-label={`Select run ${r.id} for comparison`}
                      />
                    )}
                  </td>
                  <td className="px-3 py-3" onClick={() => navigate(`/app/runs/${r.id}`)}>
                    <div className="flex items-center gap-2">
                      <RunStatusBadge status={r.status} />
                      {r.isSample && <SampleBadge />}
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                      {r.id.slice(0, 14)}
                      {r.durationMs != null && ` · ${formatDuration(r.durationMs)}`}
                    </div>
                  </td>
                  <td
                    className="px-3 py-3"
                    onClick={() => navigate(`/app/runs/${r.id}`)}
                  >
                    <div className="max-w-52 truncate text-xs font-medium">
                      {r.agentName}
                    </div>
                    <div className="max-w-52 truncate text-[11px] text-muted-foreground">
                      {r.suiteName}
                    </div>
                  </td>
                  <td
                    className="px-3 py-3"
                    onClick={() => navigate(`/app/runs/${r.id}`)}
                  >
                    <span className="font-semibold tabular-nums">
                      {formatScore(r.score)}
                    </span>
                  </td>
                  <td
                    className="px-3 py-3"
                    onClick={() => navigate(`/app/runs/${r.id}`)}
                  >
                    <div className="flex items-center gap-3">
                      <CategoryBar
                        passed={r.passed}
                        failed={r.failed}
                        inconclusive={r.inconclusive}
                        errored={r.errored}
                        notExecuted={r.notExecuted}
                        className="w-32"
                      />
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {r.passed}/{r.total}
                      </span>
                    </div>
                  </td>
                  <td
                    className="px-3 py-3 text-xs text-muted-foreground"
                    onClick={() => navigate(`/app/runs/${r.id}`)}
                  >
                    {formatRelative(r.startedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NewRunDialog open={runOpen} onOpenChange={setRunOpen} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Reports list                                                        */
/* ------------------------------------------------------------------ */

export function ReportsPage() {
  const { currentWorkspaceId } = useSession();
  const { navigate } = useHashRoute();
  const { data, loading } = useApiData<{ runs: RunSummaryDTO[] }>(
    currentWorkspaceId ? "/api/runs" : null
  );

  if (loading)
    return (
      <div className="space-y-4">
        <div className="h-8 w-40 animate-pulse rounded-md bg-muted" />
        <div className="h-64 animate-pulse rounded-xl border bg-muted/50" />
      </div>
    );

  const reportable = (data?.runs ?? []).filter(
    (r) => r.status === "COMPLETED" || r.isSample
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Evidence-backed evaluation reports, exportable as JSON and CSV."
      />
      {reportable.length === 0 ? (
        <EmptyState
          icon={<TriangleAlert />}
          title="No completed runs to report yet"
          description="Finish a test run to generate its report. Reports can be reopened at any time."
          action={
            <Button onClick={() => navigate("/app/runs")} className="gap-2">
              <PlayCircle className="size-4" /> Go to test runs
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {reportable.map((r) => (
            <button
              key={r.id}
              onClick={() => navigate(`/app/reports/${r.id}`)}
              className="rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/30"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {r.isSample && <SampleBadge />}
                  <span className="text-sm font-semibold tabular-nums">
                    {formatScore(r.score)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    vs {r.threshold}% threshold
                  </span>
                </div>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {r.id.slice(0, 10)}
                </span>
              </div>
              <div className="mt-2 text-sm font-medium">{r.agentName}</div>
              <div className="text-xs text-muted-foreground">{r.suiteName}</div>
              <div className="mt-2.5">
                <CategoryBar
                  passed={r.passed}
                  failed={r.failed}
                  inconclusive={r.inconclusive}
                  errored={r.errored}
                  notExecuted={r.notExecuted}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
                <span>
                  {r.passed} pass · {r.failed} fail
                  {r.inconclusive > 0 && ` · ${r.inconclusive} inconclusive`}
                </span>
                <span>{formatRelative(r.completedAt ?? r.startedAt)}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Compare page                                                        */
/* ------------------------------------------------------------------ */

export function ComparePage({ runA, runB }: { runA: string; runB: string }) {
  const { navigate } = useHashRoute();
  const { data, loading, error } = useApiData<{ compare: CompareDTO }>(
    `/api/runs/compare?a=${runA}&b=${runB}`
  );

  if (loading)
    return (
      <div className="space-y-4">
        <div className="h-8 w-56 animate-pulse rounded-md bg-muted" />
        <div className="h-96 animate-pulse rounded-xl border bg-muted/50" />
      </div>
    );
  if (error || !data)
    return (
      <EmptyState
        icon={<TriangleAlert />}
        title="Comparison unavailable"
        description={error ?? "These runs cannot be compared."}
        action={
          <Button variant="outline" onClick={() => navigate("/app/runs")}>
            Back to runs
          </Button>
        }
      />
    );

  const { compare } = data;
  const delta =
    compare.runB.score != null && compare.runA.score != null
      ? Math.round((compare.runB.score - compare.runA.score) * 10) / 10
      : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/app/runs")}
          aria-label="Back to runs"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <PageHeader
          title="Run comparison"
          description={`${compare.runA.suiteName} — same suite, two runs side by side.`}
        />
      </div>

      {/* summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Earlier run", run: compare.runA },
          { label: "Later run", run: compare.runB },
        ].map(({ label, run }) => (
          <div key={label} className="rounded-xl border bg-card p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </div>
            <div className="mt-1.5 text-2xl font-semibold tabular-nums">
              {formatScore(run.score)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {run.agentName} · {formatRelative(run.startedAt)}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-muted-foreground">
              <span className="text-pass">{run.passed} pass</span>
              <span className="text-fail">{run.failed} fail</span>
              {run.inconclusive > 0 && <span>{run.inconclusive} inconclusive</span>}
            </div>
            <button
              onClick={() => navigate(`/app/runs/${run.id}`)}
              className="mt-2 text-xs font-medium text-primary hover:underline"
            >
              Open run →
            </button>
          </div>
        ))}
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Change
          </div>
          <div
            className={cn(
              "mt-1.5 text-2xl font-semibold tabular-nums",
              delta != null && delta > 0 && "text-pass",
              delta != null && delta < 0 && "text-fail"
            )}
          >
            {delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta}`}
          </div>
          <div className="mt-3 space-y-1 text-xs">
            <div className="flex items-center gap-1.5 text-fail">
              <span className="size-2 rounded-sm bg-fail" />
              {compare.regressions} regression{compare.regressions === 1 ? "" : "s"}
            </div>
            <div className="flex items-center gap-1.5 text-pass">
              <span className="size-2 rounded-sm bg-pass" />
              {compare.improvements} improvement{compare.improvements === 1 ? "" : "s"}
            </div>
          </div>
        </div>
      </div>

      {/* per-case matrix */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Case</th>
              <th className="px-3 py-2.5 font-medium">Earlier</th>
              <th className="px-3 py-2.5 font-medium">Later</th>
              <th className="px-3 py-2.5 font-medium">Change</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {compare.rows.map((row) => (
              <tr
                key={row.caseId}
                className={cn(
                  "transition-colors hover:bg-muted/30",
                  row.regression && "bg-fail-soft/25"
                )}
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {row.caseId}
                    </span>
                    <span className="text-xs font-medium">{row.title}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <StatusBadgeSmall status={row.statusA} />
                </td>
                <td className="px-3 py-2.5">
                  <StatusBadgeSmall status={row.statusB} />
                </td>
                <td className="px-3 py-2.5">
                  {row.regression && (
                    <span className="rounded-full border border-fail/25 bg-fail-soft px-2 py-0.5 text-[11px] font-medium text-fail">
                      Regression
                    </span>
                  )}
                  {row.improvement && (
                    <span className="rounded-full border border-pass/25 bg-pass-soft px-2 py-0.5 text-[11px] font-medium text-pass">
                      Improved
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadgeSmall({ status }: { status: ResultStatus }) {
  return <StatusBadge status={status} dot={false} />;
}


/* ========================================================================== */
/* from src/components/app/run-detail.tsx */
/* ========================================================================== */

export function RunDetailPage({
  runId,
  mode,
}: {
  runId: string;
  mode: "run" | "report";
}) {
  const { navigate, path } = useHashRoute();
  const focusCase = React.useMemo(() => {
    const q = path.split("?")[1];
    if (!q) return null;
    const m = q.match(/case=([A-Za-z0-9-]+)/);
    return m ? m[1] : null;
  }, [path]);

  const { data, error, loading, refetch } = useApiData<{ run: RunDetailDTO }>(
    `/api/runs/${runId}`,
    {
      pollWhile: (d) =>
        d.run.status === "RUNNING" || d.run.status === "QUEUED",
      pollMs: 1100,
    }
  );

  const [cancelling, setCancelling] = React.useState(false);

  if (loading)
    return (
      <div className="space-y-4">
        <div className="h-8 w-56 animate-pulse rounded-md bg-muted" />
        <div className="h-40 animate-pulse rounded-xl border bg-muted/50" />
        <div className="h-96 animate-pulse rounded-xl border bg-muted/50" />
      </div>
    );

  if (error || !data?.run)
    return (
      <EmptyState
        icon={<TriangleAlert />}
        title="Run not found"
        description={error ?? "This run does not exist in the current workspace."}
        action={
          <Button variant="outline" onClick={() => navigate("/app/runs")}>
            Back to runs
          </Button>
        }
      />
    );

  const run = data.run;
  const isRunning = run.status === "RUNNING" || run.status === "QUEUED";
  const executedSoFar =
    run.passed + run.failed + run.inconclusive + run.errored + run.notExecuted;

  const cancel = async () => {
    setCancelling(true);
    try {
      await api(`/api/runs/${runId}/cancel`, { method: "POST" });
      toast.success("Cancellation requested", {
        description: "In-flight cases will finish; the rest will be marked not executed.",
      });
      setTimeout(() => void refetch(), 800);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Cancel failed.");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(mode === "report" ? "/app/reports" : "/app/runs")}
          aria-label="Back"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <PageHeader
          title={mode === "report" ? "Evaluation report" : `Run ${run.id.slice(0, 12)}`}
          description={
            mode === "report"
              ? `${run.agentName} · ${run.suiteName}`
              : undefined
          }
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {run.status === "COMPLETED" && !run.isSample && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => navigate(`/app/reports/${run.id}`)}
                >
                  <FileText className="size-4" /> Open report
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => downloadRunReport(run.id, "json")}
              >
                <Download className="size-4" /> JSON
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => downloadRunReport(run.id, "csv")}
              >
                <Download className="size-4" /> CSV
              </Button>
              {isRunning && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-fail hover:text-fail"
                  onClick={cancel}
                  disabled={cancelling}
                >
                  <Ban className="size-4" />
                  {cancelling ? "Cancelling…" : "Cancel run"}
                </Button>
              )}
            </div>
          }
        />
      </div>

      {run.isSample && (
        <div className="flex items-start gap-2.5 rounded-xl border border-warn/35 bg-warn-soft/60 p-4">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
          <div className="text-sm">
            <div className="font-semibold text-warn uppercase tracking-wide text-xs">
              Simulated sample — not an actual execution
            </div>
            <p className="mt-1 text-muted-foreground">
              This report was seeded so you can explore the interface. No agent
              was run and no HTTP requests were sent. Start a real run against
              the demo sandbox agent to generate live evidence.
            </p>
          </div>
        </div>
      )}

      {/* live progress */}
      {isRunning && (
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 font-medium">
              <Clock className="size-4 text-primary" />
              Executing test cases…
            </span>
            <span className="tabular-nums text-muted-foreground">
              {executedSoFar}/{run.total} cases
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full bg-primary transition-all duration-500"
              )}
              style={{
                width: `${run.total > 0 ? (executedSoFar / run.total) * 100 : 0}%`,
              }}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums text-muted-foreground">
            <span className="text-pass">{run.passed} passed</span>
            {run.failed > 0 && <span className="text-fail">{run.failed} failed</span>}
            {run.inconclusive > 0 && (
              <span>{run.inconclusive} inconclusive</span>
            )}
            {run.errored > 0 && <span className="text-error">{run.errored} errors</span>}
          </div>
        </div>
      )}

      {run.status === "FAILED" && (
        <div className="flex items-start gap-2.5 rounded-xl border border-fail/30 bg-fail-soft/50 p-4 text-sm text-fail">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            This run failed due to an infrastructure error — it is not an
            evaluation result. Check the agent connection and try again.
          </span>
        </div>
      )}

      <RunSummaryPanel run={run} />

      {/* report limitations */}
      {mode === "report" && run.limitations.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <FileJson className="size-3.5" /> Methodology & limitations
          </div>
          <ul className="mt-2 space-y-1.5">
            {run.limitations.map((l, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
                {l}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ResultsExplorer results={run.results} focusCaseId={focusCase} />

      <p className="pb-4 text-center text-xs text-muted-foreground">
        Report generated from saved execution results · Run{" "}
        <span className="font-mono">{run.id}</span> · Current score{" "}
        {formatScore(run.score)} against a {run.threshold}% threshold
      </p>
    </div>
  );
}


/* ========================================================================== */
/* from src/components/app/report-view.tsx */
/* ========================================================================== */

/* ------------------------------------------------------------------ */
/* Run summary panel                                                   */
/* ------------------------------------------------------------------ */

export function RunSummaryPanel({
  run,
  compact = false,
}: {
  run: RunDetailDTO;
  compact?: boolean;
}) {
  const v = verdict(run);
  return (
    <div className="rounded-xl border bg-card p-5 sm:p-6">
      <div className="flex flex-col gap-6 md:flex-row md:items-center">
        <div className="flex items-center gap-6">
          <ScoreRing
            score={run.score}
            threshold={run.threshold}
            size={compact ? 104 : 124}
            label={
              run.score === null
                ? "no score"
                : `${run.passed} of ${run.passed + run.failed + run.inconclusive} evaluated`
            }
          />
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <RunStatusBadge status={run.status} />
              {run.isSample && <SampleBadge />}
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4",
                  v.tone === "pass" && "border-pass/25 bg-pass-soft text-pass",
                  v.tone === "warn" && "border-warn/30 bg-warn-soft text-warn",
                  v.tone === "fail" && "border-fail/25 bg-fail-soft text-fail",
                  v.tone === "neutral" &&
                    "border-border bg-muted text-muted-foreground"
                )}
              >
                {v.label}
              </span>
            </div>
            <div className="text-lg font-semibold tracking-tight">
              {run.agentName}
            </div>
            <div className="text-sm text-muted-foreground">
              {run.suiteName}
            </div>
            <div className="text-xs text-muted-foreground">
              Started {formatDateTime(run.startedAt)}
              {run.durationMs != null && ` · ${formatDuration(run.durationMs)}`}
              {run.completedAt && ` · completed ${formatDateTime(run.completedAt)}`}
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-3 md:max-w-md md:ml-auto">
          {(Object.keys(run.categories) as CaseCategory[]).map((cat) => {
            const b = run.categories[cat];
            if (!b || b.total === 0) return null;
            return (
              <div key={cat}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium">{CATEGORY_LABELS[cat]}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {b.passed}/{b.total} passed
                    {b.inconclusive > 0 && ` · ${b.inconclusive} inconclusive`}
                    {b.errored > 0 && ` · ${b.errored} errors`}
                  </span>
                </div>
                <CategoryBar
                  passed={b.passed}
                  failed={b.failed}
                  inconclusive={b.inconclusive}
                  errored={b.errored}
                  notExecuted={b.notExecuted}
                />
              </div>
            );
          })}
          <ResultLegend />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Results table with filters                                          */
/* ------------------------------------------------------------------ */

export type StatusFilter = "ALL" | ResultStatus;
export type CategoryFilter = "ALL" | CaseCategory;

export function ResultsExplorer({
  results,
  focusCaseId,
}: {
  results: CaseResultDTO[];
  focusCaseId?: string | null;
}) {
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("ALL");
  const [categoryFilter, setCategoryFilter] =
    React.useState<CategoryFilter>("ALL");
  const [query, setQuery] = React.useState("");
  const [expanded, setExpanded] = React.useState<Set<string>>(() => {
    if (focusCaseId) return new Set([focusCaseId]);
    const firstFail = results.find((r) => r.status === "FAIL");
    return new Set(firstFail ? [firstFail.caseId] : []);
  });

  const filtered = results.filter((r) => {
    if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
    if (categoryFilter !== "ALL" && r.category !== categoryFilter) return false;
    if (query) {
      const q = query.toLowerCase();
      if (
        !r.caseId.toLowerCase().includes(q) &&
        !r.title.toLowerCase().includes(q) &&
        !(r.observedReply ?? "").toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const statusOptions: { key: StatusFilter; label: string; count: number }[] = [
    { key: "ALL", label: "All", count: results.length },
    { key: "FAIL", label: "Failed", count: results.filter((r) => r.status === "FAIL").length },
    { key: "INCONCLUSIVE", label: "Inconclusive", count: results.filter((r) => r.status === "INCONCLUSIVE").length },
    { key: "PASS", label: "Passed", count: results.filter((r) => r.status === "PASS").length },
    { key: "ERROR", label: "Errors", count: results.filter((r) => r.status === "ERROR").length },
    { key: "NOT_EXECUTED", label: "Not executed", count: results.filter((r) => r.status === "NOT_EXECUTED").length },
  ];

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {statusOptions
            .filter((o) => o.count > 0 || o.key === "ALL")
            .map((o) => (
              <button
                key={o.key}
                onClick={() => setStatusFilter(o.key)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  statusFilter === o.key
                    ? "border-primary/40 bg-accent text-accent-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                )}
              >
                {o.label}
                <span className="ml-1.5 tabular-nums opacity-70">{o.count}</span>
              </button>
            ))}
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground"
          aria-label="Filter by category"
        >
          <option value="ALL">All categories</option>
          <option value="CORRECTNESS">Correctness</option>
          <option value="TOOL_USAGE">Tool usage</option>
          <option value="SAFETY">Safety</option>
        </select>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search cases or responses…"
          className="h-8 w-full max-w-56 text-xs"
          aria-label="Search test results"
        />
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {filtered.length} shown
        </span>
      </div>

      <div className="divide-y">
        {filtered.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            No test cases match these filters.
          </div>
        )}
        {filtered.map((r) => (
          <div key={r.caseId}>
            <button
              onClick={() => toggle(r.caseId)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
              aria-expanded={expanded.has(r.caseId)}
            >
              {expanded.has(r.caseId) ? (
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              )}
              <StatusBadge status={r.status} dot={false} />
              <span className="font-mono text-xs text-muted-foreground w-12 shrink-0">
                {r.caseId}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {r.title}
              </span>
              <span className="hidden sm:block">
                <CategoryBadge category={r.category} />
              </span>
              <SeverityBadge severity={r.severity} />
            </button>
            {expanded.has(r.caseId) && (
              <div className="px-4 pb-5 pt-1 sm:pl-11">
                <CaseResultCard result={r} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Case result card — the evidence view                                */
/* ------------------------------------------------------------------ */

export function CaseResultCard({ result }: { result: CaseResultDTO }) {
  return (
    <div className="space-y-4">
      {/* expected vs observed */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border bg-muted/30 p-3.5">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Expected behavior
          </div>
          <p className="text-sm leading-relaxed">{result.expectedBehavior}</p>
          {result.evidence && (
            <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">
              <span className="font-medium">Evidence required: </span>
              {result.evidence}
            </p>
          )}
        </div>
        <div className="rounded-lg border bg-muted/30 p-3.5">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Observed response
          </div>
          {result.observedReply ? (
            <p className="whitespace-pre-wrap rounded-md bg-card px-3 py-2.5 text-sm leading-relaxed">
              “{result.observedReply}”
            </p>
          ) : (
            <p className="text-sm italic text-muted-foreground">
              No reply could be extracted from the agent&apos;s response.
            </p>
          )}
          {result.durationMs != null && (
            <p className="mt-2 text-xs text-muted-foreground tabular-nums">
              Response time: {formatDuration(result.durationMs)}
            </p>
          )}
        </div>
      </div>

      {/* rule outcomes */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Check className="size-3.5" /> Evaluation criteria
          <span className="font-normal normal-case">({result.ruleOutcomes.length})</span>
        </div>
        {result.ruleOutcomes.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">
            No criteria were evaluated for this case (execution error or not
            executed).
          </p>
        ) : (
          <ul className="space-y-1.5">
            {result.ruleOutcomes.map((o, i) => (
              <li
                key={i}
                className={cn(
                  "flex items-start gap-2.5 rounded-lg border px-3 py-2.5",
                  o.outcome === "PASS" && "border-pass/20 bg-pass-soft/40",
                  o.outcome === "FAIL" && "border-fail/25 bg-fail-soft/40",
                  o.outcome === "NOT_EVIDENCED" && "border-border bg-muted/40"
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-4.5 h-5 w-5 shrink-0 items-center justify-center rounded-full",
                    o.outcome === "PASS" && "bg-pass/15 text-pass",
                    o.outcome === "FAIL" && "bg-fail/15 text-fail",
                    o.outcome === "NOT_EVIDENCED" && "bg-muted text-muted-foreground"
                  )}
                >
                  {o.outcome === "PASS" ? (
                    <Check className="size-3" />
                  ) : o.outcome === "FAIL" ? (
                    <X className="size-3" />
                  ) : (
                    <HelpCircle className="size-3" />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium">{o.label}</div>
                  <div className="text-xs text-muted-foreground">{o.detail}</div>
                  {o.outcome === "NOT_EVIDENCED" && (
                    <div className="mt-1 text-[11px] font-medium text-warn">
                      Not evidenced — missing evidence is never treated as a
                      pass or a fail.
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* tool events */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <ArrowUpDown className="size-3.5" /> Tool-call evidence
          <span className="font-normal normal-case">
            ({result.toolEvents.length} event{result.toolEvents.length === 1 ? "" : "s"})
          </span>
        </div>
        {result.toolEvents.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-2.5 text-sm italic text-muted-foreground">
            No tool-call trace was returned for this case. Tool verification is
            inconclusive — not failed.
          </p>
        ) : (
          <ToolEventTimeline events={result.toolEvents} />
        )}
      </div>

      {/* turns evidence */}
      {result.turns.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <FileJson className="size-3.5" /> Execution evidence
            <span className="font-normal normal-case">
              ({result.turns.length} turn{result.turns.length === 1 ? "" : "s"})
            </span>
          </div>
          <div className="space-y-2">
            {result.turns.map((t) => (
              <TurnEvidenceBlock key={t.turnIndex} turn={t} />
            ))}
          </div>
        </div>
      )}

      {/* explanation + recommendation */}
      <div className="rounded-lg border bg-muted/30 p-3.5">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Explanation
        </div>
        <p className="text-sm leading-relaxed">{result.explanation}</p>
      </div>
      {result.recommendation && (
        <div className="rounded-lg border border-warn/30 bg-warn-soft/50 p-3.5">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-warn">
            <Lightbulb className="size-3.5" /> Recommendation
          </div>
          <p className="text-sm leading-relaxed">{result.recommendation}</p>
        </div>
      )}
      {result.failureHint && result.status === "FAIL" && !result.recommendation && (
        <div className="rounded-lg border border-warn/30 bg-warn-soft/50 p-3.5">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-warn">
            <Wrench className="size-3.5" /> Fix suggestion
          </div>
          <p className="text-sm leading-relaxed">{result.failureHint}</p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tool event timeline                                                 */
/* ------------------------------------------------------------------ */

export function ToolEventTimeline({
  events,
}: {
  events: CaseResultDTO["toolEvents"];
}) {
  return (
    <ol className="relative space-y-2 border-l pl-4 ml-2">
      {events.map((e, i) => (
        <li key={i} className="relative">
          <span
            className={cn(
              "absolute -left-[21px] top-2.5 size-2 rounded-full ring-2 ring-card",
              e.phase === "CONFIRMED" && "bg-pass",
              e.phase === "OBSERVED" && "bg-primary",
              e.phase === "REQUESTED" && "bg-neutral"
            )}
          />
          <div className="rounded-lg border bg-card px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <PhaseBadge phase={e.phase} />
              <span className="font-mono text-xs font-medium">{e.name}</span>
              <span
                className={cn(
                  "text-[11px] font-medium",
                  e.status === "SUCCESS" && "text-pass",
                  e.status === "FAILURE" && "text-fail",
                  e.status === "UNKNOWN" && "text-muted-foreground"
                )}
              >
                {e.status.toLowerCase()}
              </span>
              {e.turn !== undefined && (
                <span className="ml-auto text-[11px] text-muted-foreground">
                  turn {e.turn + 1}
                </span>
              )}
            </div>
            {e.arguments && Object.keys(e.arguments).length > 0 && (
              <div className="mt-1.5 overflow-x-auto rounded-md bg-ink-950 px-2.5 py-1.5 font-mono text-[11px] text-ink-fg scrollbar-thin-dark">
                {Object.entries(e.arguments)
                  .map(
                    ([k, v]) =>
                      `${k}: ${typeof v === "string" ? `"${v}"` : JSON.stringify(v)}`
                  )
                  .join(", ")}
              </div>
            )}
            {e.result !== undefined && e.result !== null && (
              <JsonCollapse label="result" value={e.result} />
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function JsonCollapse({ label, value }: { label: string; value: unknown }) {
  const [open, setOpen] = React.useState(false);
  const text = React.useMemo(() => {
    try {
      return typeof value === "string" ? value : JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }, [value]);
  return (
    <div className="mt-1.5">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground"
      >
        {open ? (
          <ChevronDown className="size-3" />
        ) : (
          <ChevronRight className="size-3" />
        )}
        {label}
      </button>
      {open && (
        <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-ink-950 px-2.5 py-1.5 font-mono text-[11px] leading-relaxed text-ink-fg scrollbar-thin-dark">
          {text}
        </pre>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Turn evidence block                                                 */
/* ------------------------------------------------------------------ */

export function TurnEvidenceBlock({
  turn,
}: {
  turn: CaseResultDTO["turns"][number];
}) {
  const [showRaw, setShowRaw] = React.useState(false);
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-start gap-3 px-3.5 py-2.5">
        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground">
          {turn.turnIndex + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-relaxed">{turn.userMessage}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground tabular-nums">
            <span
              className={cn(
                "inline-flex items-center rounded border px-1.5 py-0.5 font-mono font-medium",
                (turn.statusCode ?? 0) >= 200 && (turn.statusCode ?? 0) < 300
                  ? "border-pass/25 bg-pass-soft text-pass"
                  : "border-fail/25 bg-fail-soft text-fail"
              )}
            >
              HTTP {turn.statusCode ?? "—"}
            </span>
            <span>{formatDuration(turn.durationMs)}</span>
            <button
              onClick={() => setShowRaw(!showRaw)}
              className="ml-auto inline-flex items-center gap-1 font-medium hover:text-foreground"
            >
              {showRaw ? (
                <ChevronDown className="size-3" />
              ) : (
                <ChevronRight className="size-3" />
              )}
              {showRaw ? "Hide" : "Show"} request / response
            </button>
          </div>
        </div>
      </div>
      {showRaw && (
        <div className="space-y-2 border-t px-3.5 py-3">
          {turn.requestPreview && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Request sent
              </div>
              <pre className="max-h-40 overflow-auto rounded-md bg-ink-950 px-2.5 py-1.5 font-mono text-[11px] leading-relaxed text-ink-fg scrollbar-thin-dark">
                {turn.requestPreview}
              </pre>
            </div>
          )}
          {turn.responsePreview && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Raw response
              </div>
              <pre className="max-h-56 overflow-auto rounded-md bg-ink-950 px-2.5 py-1.5 font-mono text-[11px] leading-relaxed text-ink-fg scrollbar-thin-dark">
                {turn.responsePreview}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


/* ========================================================================== */
/* from src/components/app/sample-report.tsx */
/* ========================================================================== */

/**
 * Public sample report — SIMULATED data, no execution occurred.
 * Reuses the exact report components that render real runs so visitors
 * see the genuine product experience.
 */
export function SampleReportPage() {
  const { navigate } = useHashRoute();
  const run = React.useMemo(() => buildSampleRunDetail(), []);

  return (
    <div className="bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:py-14">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                Sample report
              </span>
              <SampleBadge />
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
              Customer-support agent evaluation
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              25 test cases · Correctness, tool usage and safety · Simulated
              data for exploration
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/signup")} className="gap-2">
              Run this on your agent <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>

        <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-warn/35 bg-warn-soft/60 p-4">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
          <div className="text-sm">
            <div className="font-semibold uppercase tracking-wide text-xs text-warn">
              Simulated sample — not an actual execution
            </div>
            <p className="mt-1 text-muted-foreground">
              This report illustrates what AgentClear produces. The data below
              was never produced by a live run: no agent was executed and no
              HTTP requests were sent. Sign up to run the same suite against
              the sandbox demo agent and generate real evidence.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <RunSummaryPanel run={run} />
          <div className="rounded-xl border bg-card p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Methodology
            </div>
            <ul className="mt-2 space-y-1.5">
              {run.limitations.map((l, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-muted-foreground"
                >
                  <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
                  {l}
                </li>
              ))}
            </ul>
          </div>
          <ResultsExplorer results={run.results} />
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Illustrative pass threshold: {run.threshold}%. Passing a threshold
          does not certify production safety.
        </p>
      </div>
    </div>
  );
}
