"use client";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import * as React from "react";

import { CATEGORY_LABELS, CaseSeverity, RESULT_STATUS_LABELS, RUN_STATUS_LABELS, ResultStatus, RunStatus, SEVERITY_LABELS, TOOL_PHASE_LABELS, ToolPhase } from "@/lib/types";
import { cn } from "@/lib/utils";



/* ========================================================================== */
/* from /tmp/zipagentclear/components/brand/logo.tsx */
/* ========================================================================== */

/**
 * AgentClear mark — a rounded square containing an execution trace:
 * a request node (filled dot) that flows along a rising path into a
 * bold check (verified result). Reads clearly at 16px.
 */
export function LogoMark({
  className,
  size = 24,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect
        x="1.5"
        y="1.5"
        width="21"
        height="21"
        rx="5.5"
        stroke="currentColor"
        strokeWidth="1.8"
        opacity="0.45"
      />
      <path
        d="M7.25 12.6 L10.6 16.1 L16.9 7.4"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="7.25" cy="12.6" r="2.1" fill="currentColor" />
    </svg>
  );
}

export function Logo({
  className,
  size = 22,
  wordmarkClassName,
  variant = "auto",
}: {
  className?: string;
  size?: number;
  wordmarkClassName?: string;
  /** auto = current foreground color; on-ink = light text for dark navy surfaces */
  variant?: "auto" | "on-ink";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 select-none",
        variant === "on-ink" ? "text-ink-fg" : "text-foreground",
        className
      )}
    >
      <LogoMark size={size} className="shrink-0 text-primary" />
      <span
        className={cn(
          "font-semibold tracking-tight leading-none",
          wordmarkClassName
        )}
        style={{ fontSize: size * 0.82 }}
      >
        Agent<span className="text-primary">Clear</span>
      </span>
    </span>
  );
}


/* ========================================================================== */
/* from /tmp/zipagentclear/components/shared/primitives.tsx */
/* ========================================================================== */

/* ------------------------------------------------------------------ */
/* Status badges                                                       */
/* ------------------------------------------------------------------ */

const resultStatusStyles: Record<ResultStatus, string> = {
  PASS: "bg-pass-soft text-pass border-pass/25",
  FAIL: "bg-fail-soft text-fail border-fail/25",
  INCONCLUSIVE: "bg-neutral-soft text-neutral border-neutral/25",
  ERROR: "bg-error-soft text-error border-error/25",
  NOT_EXECUTED: "bg-muted text-muted-foreground border-border",
};

export function StatusBadge({
  status,
  className,
  dot = true,
}: {
  status: ResultStatus;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap",
        resultStatusStyles[status],
        className
      )}
    >
      {dot && (
        <span
          className={cn("size-1.5 rounded-full", {
            "bg-pass": status === "PASS",
            "bg-fail": status === "FAIL",
            "bg-neutral": status === "INCONCLUSIVE",
            "bg-error": status === "ERROR",
            "bg-muted-foreground": status === "NOT_EXECUTED",
          })}
        />
      )}
      {RESULT_STATUS_LABELS[status]}
    </span>
  );
}

const runStatusStyles: Record<RunStatus, string> = {
  QUEUED: "bg-neutral-soft text-neutral border-neutral/25",
  RUNNING: "bg-accent text-accent-foreground border-primary/30",
  COMPLETED: "bg-pass-soft text-pass border-pass/25",
  FAILED: "bg-fail-soft text-fail border-fail/25",
  CANCELLED: "bg-muted text-muted-foreground border-border",
};

export function RunStatusBadge({
  status,
  className,
}: {
  status: RunStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap",
        runStatusStyles[status],
        className
      )}
    >
      {status === "RUNNING" && (
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
        </span>
      )}
      {status === "COMPLETED" && <span className="size-1.5 rounded-full bg-pass" />}
      {status === "FAILED" && <span className="size-1.5 rounded-full bg-fail" />}
      {RUN_STATUS_LABELS[status]}
    </span>
  );
}

const severityStyles: Record<CaseSeverity, string> = {
  CRITICAL: "bg-fail-soft text-fail border-fail/25",
  HIGH: "bg-error-soft text-error border-error/25",
  MEDIUM: "bg-warn-soft text-warn border-warn/30",
  LOW: "bg-neutral-soft text-neutral border-neutral/25",
};

export function SeverityBadge({
  severity,
  className,
}: {
  severity: CaseSeverity;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap",
        severityStyles[severity],
        className
      )}
    >
      {SEVERITY_LABELS[severity]}
    </span>
  );
}

const phaseStyles: Record<ToolPhase, string> = {
  REQUESTED: "bg-neutral-soft text-neutral border-neutral/25",
  OBSERVED: "bg-accent text-accent-foreground border-primary/30",
  CONFIRMED: "bg-pass-soft text-pass border-pass/25",
};

export function PhaseBadge({
  phase,
  className,
}: {
  phase: ToolPhase;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap",
        phaseStyles[phase],
        className
      )}
    >
      {TOOL_PHASE_LABELS[phase]}
    </span>
  );
}

export function SampleBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-warn/40 bg-warn-soft px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide leading-4 text-warn whitespace-nowrap",
        className
      )}
    >
      Sample
    </span>
  );
}

export function CategoryBadge({
  category,
  className,
}: {
  category: keyof typeof CATEGORY_LABELS;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border bg-muted px-1.5 py-0.5 text-[11px] font-medium leading-4 text-muted-foreground whitespace-nowrap",
        className
      )}
    >
      {CATEGORY_LABELS[category]}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Score ring                                                          */
/* ------------------------------------------------------------------ */

export function ScoreRing({
  score,
  threshold,
  size = 120,
  strokeWidth = 9,
  label,
  sublabel,
  className,
}: {
  score: number | null;
  threshold?: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
  className?: string;
}) {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const pct = score === null ? 0 : Math.max(0, Math.min(100, score));
  const color =
    score === null
      ? "var(--status-neutral)"
      : score >= (threshold ?? 0)
        ? "var(--pass)"
        : "var(--warn)";
  const dash = (pct / 100) * c;
  // threshold tick angle
  const tickAngle =
    threshold !== undefined ? (threshold / 100) * 360 - 90 : null;

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      role="img"
      aria-label={
        score === null
          ? "No score available"
          : `Score ${score.toFixed(0)} out of 100${threshold !== undefined ? `, threshold ${threshold}` : ""}`
      }
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          style={{ transition: "stroke-dasharray 600ms ease" }}
        />
        {tickAngle !== null && (
          <line
            x1={size / 2 + Math.cos((tickAngle * Math.PI) / 180) * (r - strokeWidth / 2 - 2)}
            y1={size / 2 + Math.sin((tickAngle * Math.PI) / 180) * (r - strokeWidth / 2 - 2)}
            x2={size / 2 + Math.cos((tickAngle * Math.PI) / 180) * (r + strokeWidth / 2 + 2)}
            y2={size / 2 + Math.sin((tickAngle * Math.PI) / 180) * (r + strokeWidth / 2 + 2)}
            stroke="var(--foreground)"
            strokeWidth="2"
            opacity="0.65"
            className="rotate-90"
            style={{ transformOrigin: `${size / 2}px ${size / 2}px` }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold tabular-nums tracking-tight">
          {score === null ? "—" : `${Math.round(score)}%`}
        </span>
        {label && (
          <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
        )}
        {sublabel && (
          <span className="text-[10px] text-muted-foreground/80">{sublabel}</span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Category breakdown bar                                              */
/* ------------------------------------------------------------------ */

export function CategoryBar({
  passed,
  failed,
  inconclusive,
  errored,
  notExecuted,
  className,
}: {
  passed: number;
  failed: number;
  inconclusive: number;
  errored: number;
  notExecuted: number;
  className?: string;
}) {
  const total = Math.max(
    1,
    passed + failed + inconclusive + errored + notExecuted
  );
  const seg = [
    { n: passed, cls: "bg-pass", key: "pass" },
    { n: failed, cls: "bg-fail", key: "fail" },
    { n: inconclusive, cls: "bg-neutral/60", key: "inconclusive" },
    { n: errored, cls: "bg-error", key: "error" },
    { n: notExecuted, cls: "bg-muted-foreground/30", key: "notExecuted" },
  ] as const;

  return (
    <div className={cn("flex h-1.5 w-full overflow-hidden rounded-full", className)}>
      {seg.map(
        (s) =>
          s.n > 0 && (
            <div
              key={s.key}
              className={s.cls}
              style={{ width: `${(s.n / total) * 100}%` }}
              title={`${s.n} ${s.key}`}
            />
          )
      )}
    </div>
  );
}

export function ResultLegend({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground",
        className
      )}
    >
      {[
        ["bg-pass", "Pass"],
        ["bg-fail", "Fail"],
        ["bg-neutral/60", "Inconclusive"],
        ["bg-error", "Error"],
        ["bg-muted-foreground/30", "Not executed"],
      ].map(([cls, label]) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <span className={cn("size-2 rounded-[3px]", cls)} />
          {label}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sparkline                                                           */
/* ------------------------------------------------------------------ */

export function Sparkline({
  values,
  width = 160,
  height = 36,
  className,
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (values.length === 0) return null;
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 100);
  const range = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const pts = values.map((v, i) => {
    const x = values.length > 1 ? i * step : width / 2;
    const y = height - 4 - ((v - min) / range) * (height - 10);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = pts[pts.length - 1].split(",");

  return (
    <svg
      width={width}
      height={height}
      className={className}
      aria-hidden="true"
    >
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r="2.6" fill="var(--primary)" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Empty state                                                         */
/* ------------------------------------------------------------------ */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/50 px-6 py-12 text-center",
        className
      )}
    >
      {icon && (
        <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}


/* ========================================================================== */
/* from /tmp/zipagentclear/components/shared/diagrams.tsx */
/* ========================================================================== */

/**
 * Execution trace diagram — the canonical AgentClear mental model:
 * user request → agent → tool call → tool result → verified response.
 * Used on the public site and inside the product.
 */
export function TraceFlowDiagram({ className }: { className?: string }) {
  const nodes = [
    { label: "User request", sub: "turn 2 of 3" },
    { label: "Agent", sub: "orchestration" },
    { label: "Tool call", sub: "get_order" },
    { label: "Tool result", sub: "delivered · ORD-1001" },
    { label: "Response", sub: "verified answer" },
  ];
  return (
    <div className={cn("w-full", className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        {nodes.map((n, i) => (
          <React.Fragment key={n.label}>
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-ink-border bg-ink-900 px-3 py-2.5">
              <div
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold",
                  i === 4
                    ? "bg-pass/20 text-pass"
                    : i === 2
                      ? "bg-primary/25 text-primary"
                      : "bg-white/10 text-ink-fg"
                )}
              >
                {i === 4 ? "✓" : i + 1}
              </div>
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-ink-fg">
                  {n.label}
                </div>
                <div className="truncate font-mono text-[10px] text-ink-muted">
                  {n.sub}
                </div>
              </div>
            </div>
            {i < nodes.length - 1 && (
              <div className="flex items-center justify-center text-ink-muted sm:px-0.5">
                <svg width="18" height="10" viewBox="0 0 18 10" className="rotate-90 sm:rotate-0">
                  <path
                    d="M0 5 H13 M9 1.5 L13 5 L9 8.5"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

/**
 * Tool verification levels — AgentClear's core differentiator:
 * a tool being requested ≠ executed ≠ outcome confirmed.
 */
export function ToolVerificationDiagram({
  className,
}: {
  className?: string;
}) {
  const levels = [
    {
      phase: "REQUESTED",
      title: "Requested",
      desc: "The agent said it would call a tool",
      example: "\u201CI'll check that order for you…\u201D",
      cls: "border-neutral/30 bg-neutral-soft text-neutral",
      dot: "bg-neutral",
    },
    {
      phase: "OBSERVED",
      title: "Observed",
      desc: "Execution trace shows the call ran",
      example: "get_order(ORD-1002) → executed",
      cls: "border-primary/30 bg-accent text-accent-foreground",
      dot: "bg-primary",
    },
    {
      phase: "CONFIRMED",
      title: "Confirmed",
      desc: "Trusted tool result proves the outcome",
      example: "refund_ref: RF-88213 · status: settled",
      cls: "border-pass/30 bg-pass-soft text-pass",
      dot: "bg-pass",
    },
  ];
  return (
    <div className={cn("grid gap-3 sm:grid-cols-3", className)}>
      {levels.map((l, i) => (
        <div key={l.phase} className={cn("relative rounded-xl border p-4", l.cls)}>
          <div className="flex items-center gap-2">
            <span className={cn("size-2 rounded-full", l.dot)} />
            <span className="text-xs font-semibold tracking-wide uppercase">
              {l.title}
            </span>
            <span className="ml-auto font-mono text-[10px] opacity-60">
              {i + 1}/3
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed opacity-90">{l.desc}</p>
          <p className="mt-2 truncate rounded-md bg-card/70 px-2 py-1 font-mono text-[10px] text-foreground/70">
            {l.example}
          </p>
        </div>
      ))}
    </div>
  );
}


/* ========================================================================== */
/* from /tmp/zipagentclear/components/theme-provider.tsx */
/* ========================================================================== */

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
