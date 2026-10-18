"use client";
import { useCallback, useEffect, useRef, useState } from "react";

import { CaseResultDTO, EvalRule, RunSummaryDTO, ToolEventDTO } from "@/lib/types";
import { LocalApiError, localRequest } from "@/lib/local";



/* ========================================================================== */
/* from .zscripts/pristine/lib-backup/client/router.tsx */
/* ========================================================================== */

/**
 * Hash-based SPA router. The whole product lives on the single `/` route;
 * views switch via location.hash (e.g. #/app/agents). Supports back/forward.
 */

export function normalizePath(p: string): string {
  const route = p.replace(/^#/, "");
  return route === "" ? "/" : route;
}

export function useHashRoute() {
  const [hash, setHash] = useState<string>(() =>
    typeof window === "undefined" ? "#/" : window.location.hash || "#/"
  );

  useEffect(() => {
    const onChange = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const navigate = useCallback((path: string) => {
    const target = path.startsWith("#") ? path : `#${path.startsWith("/") ? path : `/${path}`}`;
    if (window.location.hash === target) return;
    window.location.hash = target;
  }, []);

  const path = normalizePath(hash);
  return { path, navigate };
}


/* ========================================================================== */
/* from .zscripts/pristine/lib-backup/client/api.ts */
/* ========================================================================== */

/**
 * Typed API wrapper for the AgentClear local demo backend (static build).
 * Instead of fetch(), every request is dispatched to the in-browser
 * backend in src/lib/local.ts, which implements the exact /api contract
 * of the full-stack server build:
 * - JSON bodies/responses
 * - Workspace scoping via the localStorage workspace key (same key the
 *   server build carried in the X-Workspace-Id header)
 * - Normalized ApiError with the same messages the server produces
 */

const WORKSPACE_KEY = "agentclear.workspace";

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function setCurrentWorkspaceId(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) window.localStorage.setItem(WORKSPACE_KEY, id);
  else window.localStorage.removeItem(WORKSPACE_KEY);
}

export function getCurrentWorkspaceId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(WORKSPACE_KEY);
}

export async function api<T>(
  path: string,
  options: {
    method?: string;
    json?: unknown;
    signal?: AbortSignal;
  } = {}
): Promise<T> {
  if (typeof window === "undefined") {
    // The static export prerenders on the server; requests only ever
    // happen in the browser.
    throw new ApiError("The local demo backend is only available in the browser.", 0);
  }

  try {
    return (await localRequest(path, {
      method: options.method,
      json: options.json,
    })) as T;
  } catch (e) {
    if (e instanceof LocalApiError) {
      throw new ApiError(e.message, e.status);
    }
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError("The local demo backend could not complete the request.", 0);
  }
}


/* ========================================================================== */
/* from .zscripts/pristine/lib-backup/client/hooks.ts */
/* ========================================================================== */

/** Simple fetch-and-hold hook with manual refresh. */
export function useApiData<T>(
  path: string | null,
  options?: { pollWhile?: (data: T) => boolean; pollMs?: number }
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(path !== null);
  const pollWhile = options?.pollWhile;
  const pollMs = options?.pollMs ?? 1200;
  const mounted = useRef(true);

  const load = useCallback(
    async (silent = false) => {
      if (path === null) return;
      if (!silent) setLoading(true);
      try {
        const result = await api<T>(path);
        if (!mounted.current) return;
        setData(result);
        setError(null);
      } catch (e) {
        if (!mounted.current) return;
        setError(e instanceof Error ? e.message : "Request failed.");
      } finally {
        if (mounted.current && !silent) setLoading(false);
      }
    },
    [path]
  );

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  // polling while a predicate holds (e.g. run is RUNNING)
  useEffect(() => {
    if (!pollWhile || !data || !pollWhile(data)) return;
    const t = setInterval(() => {
      void load(true);
    }, pollMs);
    return () => clearInterval(t);
  }, [pollWhile, data, load, pollMs]);

  return { data, error, loading, refetch: () => load(true), reload: () => load(false) };
}


/* ========================================================================== */
/* from .zscripts/pristine/lib-backup/client/format.ts */
/* ========================================================================== */

/* Formatting helpers */

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${String(Math.round(s % 60)).padStart(2, "0")}s`;
}

export function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined) return "—";
  return `${Math.round(score)}%`;
}

/* Display helpers */

export function verdict(run: RunSummaryDTO): {
  label: string;
  tone: "pass" | "warn" | "fail" | "neutral";
} {
  if (run.status === "FAILED")
    return { label: "Run failed", tone: "fail" };
  if (run.status === "CANCELLED")
    return { label: "Cancelled", tone: "neutral" };
  if (run.status === "RUNNING") return { label: "Running", tone: "neutral" };
  if (run.status === "QUEUED") return { label: "Queued", tone: "neutral" };
  if (run.score === null) return { label: "No evaluated cases", tone: "neutral" };
  if (run.score >= run.threshold)
    return { label: `Above ${run.threshold}% threshold`, tone: "pass" };
  return { label: `Below ${run.threshold}% threshold`, tone: "warn" };
}

export function toolEventSummary(e: ToolEventDTO): string {
  const args = e.arguments
    ? Object.entries(e.arguments)
        .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
        .join(", ")
    : "";
  return `${e.name}(${args})`;
}

export function ruleSummary(rule: EvalRule): string {
  switch (rule.type) {
    case "mustInclude":
      return `Reply must contain “${rule.value}”`;
    case "mustIncludeAny":
      return `Reply must contain one of: ${rule.anyOf.slice(0, 3).map((a) => `“${a}”`).join(", ")}${rule.anyOf.length > 3 ? " …" : ""}`;
    case "mustNotInclude":
      return `Reply must not contain “${rule.value}”`;
    case "mustNotIncludeAny":
      return `Reply must not contain: ${rule.anyOf.slice(0, 3).map((a) => `“${a}”`).join(", ")}${rule.anyOf.length > 3 ? " …" : ""}`;
    case "mustNotMatch":
      return `Reply must not match /${rule.pattern}/`;
    case "requiredTool":
      return `${rule.tool} must be ${rule.phase.toLowerCase()}${rule.args ? " with matching arguments" : ""}`;
    case "forbiddenTool":
      return `${rule.tool} must not be called`;
    case "maxToolCalls":
      return `At most ${rule.max} tool calls`;
    case "claimRequiresConfirmedTool":
      return `Claims matching /${rule.claimPattern}/ require a confirmed ${rule.tool} result`;
  }
}

export function failedRules(r: CaseResultDTO): string[] {
  return r.ruleOutcomes.filter((o) => o.outcome === "FAIL").map((o) => o.label);
}
