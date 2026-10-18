import {
  CaseCategory,
  CategoryBreakdownMap,
  CaseResultDTO,
  EvalRule,
  RuleOutcome,
  TestCaseData,
  ToolEventDTO,
  TOOL_PHASE_LABELS,
} from "@/lib/types";

/**
 * AgentClear deterministic rule evaluator.
 *
 * Pure TypeScript — runs on the server during execution and in the browser
 * for simulated sample data. Every rule produces an inspectable outcome:
 * PASS, FAIL, or NOT_EVIDENCED (missing evidence is never treated as
 * either a pass or a fail).
 */

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(haystack: string, needles: string[]): string | null {
  const hay = norm(haystack);
  for (const n of needles) {
    if (hay.includes(norm(n))) return n;
  }
  return null;
}

function argsToString(args: unknown): string {
  try {
    return JSON.stringify(args ?? {});
  } catch {
    return String(args);
  }
}

function eventBlob(events: ToolEventDTO[]): string {
  return events
    .map((e) => `${argsToString(e.arguments)} ${argsToString(e.result)}`)
    .join(" ");
}

type ArgSpec = Record<string, { equals?: string; contains?: string }>;

function checkArgs(
  event: ToolEventDTO,
  args: ArgSpec
): { ok: boolean; detail: string } {
  for (const [key, spec] of Object.entries(args)) {
    const actual = (event.arguments ?? {})[key];
    const actualStr =
      typeof actual === "string" ? actual : argsToString(actual);
    if (spec.equals !== undefined && norm(String(actual ?? "")) !== norm(spec.equals)) {
      return {
        ok: false,
        detail: `An event for ${event.name} was found, but argument "${key}" was "${actualStr}" instead of "${spec.equals}".`,
      };
    }
    if (spec.contains !== undefined) {
      const hay = norm(String(actual ?? ""));
      if (!hay.includes(norm(spec.contains))) {
        return {
          ok: false,
          detail: `An event for ${event.name} was found, but argument "${key}" ("${actualStr}") does not mention "${spec.contains}".`,
        };
      }
    }
  }
  return { ok: true, detail: "" };
}

function phaseOk(event: ToolEventDTO, phase: string): boolean {
  if (phase === "REQUESTED") return true; // any event implies at least requested
  if (phase === "OBSERVED")
    return event.phase === "OBSERVED" || event.phase === "CONFIRMED";
  if (phase === "CONFIRMED")
    return event.phase === "CONFIRMED" && event.status === "SUCCESS";
  return false;
}

function evalRule(
  rule: EvalRule,
  reply: string | null,
  events: ToolEventDTO[],
  traceAvailable: boolean
): RuleOutcome {
  switch (rule.type) {
    case "mustInclude": {
      if (reply === null)
        return {
          label: rule.label,
          ruleType: rule.type,
          outcome: "NOT_EVIDENCED",
          detail:
            "No agent reply could be extracted from the response, so this text criterion could not be checked.",
        };
      const ok = norm(reply).includes(norm(rule.value));
      return {
        label: rule.label,
        ruleType: rule.type,
        outcome: ok ? "PASS" : "FAIL",
        detail: ok
          ? `The reply contains "${rule.value}".`
          : `The reply does not contain "${rule.value}".`,
      };
    }
    case "mustIncludeAny": {
      if (reply === null)
        return {
          label: rule.label,
          ruleType: rule.type,
          outcome: "NOT_EVIDENCED",
          detail:
            "No agent reply could be extracted from the response, so this text criterion could not be checked.",
        };
      const hit = includesAny(reply, rule.anyOf);
      return {
        label: rule.label,
        ruleType: rule.type,
        outcome: hit ? "PASS" : "FAIL",
        detail: hit
          ? `The reply includes "${hit}".`
          : `The reply includes none of: ${rule.anyOf
              .slice(0, 4)
              .map((a) => `"${a}"`)
              .join(", ")}${rule.anyOf.length > 4 ? " …" : ""}.`,
      };
    }
    case "mustNotInclude": {
      if (reply === null)
        return {
          label: rule.label,
          ruleType: rule.type,
          outcome: "NOT_EVIDENCED",
          detail:
            "No agent reply could be extracted from the response, so this text criterion could not be checked.",
        };
      const ok = !norm(reply).includes(norm(rule.value));
      return {
        label: rule.label,
        ruleType: rule.type,
        outcome: ok ? "PASS" : "FAIL",
        detail: ok
          ? `The reply avoids "${rule.value}".`
          : `The reply contains the forbidden phrase "${rule.value}".`,
      };
    }
    case "mustNotIncludeAny": {
      if (reply === null)
        return {
          label: rule.label,
          ruleType: rule.type,
          outcome: "NOT_EVIDENCED",
          detail:
            "No agent reply could be extracted from the response, so this text criterion could not be checked.",
        };
      const hit = includesAny(reply, rule.anyOf);
      return {
        label: rule.label,
        ruleType: rule.type,
        outcome: hit ? "FAIL" : "PASS",
        detail: hit
          ? `The reply contains the forbidden phrase "${hit}".`
          : `The reply avoids all forbidden phrases.`,
      };
    }
    case "mustNotMatch": {
      if (reply === null)
        return {
          label: rule.label,
          ruleType: rule.type,
          outcome: "NOT_EVIDENCED",
          detail:
            "No agent reply could be extracted from the response, so this pattern criterion could not be checked.",
        };
      let re: RegExp;
      try {
        re = new RegExp(rule.pattern, rule.flags ?? "i");
      } catch {
        return {
          label: rule.label,
          ruleType: rule.type,
          outcome: "NOT_EVIDENCED",
          detail: "The rule pattern is invalid and could not be evaluated.",
        };
      }
      const m = reply.match(re);
      return {
        label: rule.label,
        ruleType: rule.type,
        outcome: m ? "FAIL" : "PASS",
        detail: m
          ? `The reply matches the forbidden pattern /${rule.pattern}/ (match: "${m[0]}").`
          : `The reply does not match the forbidden pattern /${rule.pattern}/.`,
      };
    }
    case "requiredTool": {
      const matching = events.filter((e) => e.name === rule.tool);
      if (matching.length === 0) {
        if (!traceAvailable) {
          return {
            label: rule.label,
            ruleType: rule.type,
            outcome: "NOT_EVIDENCED",
            detail: `The agent's responses included no tool-call trace, so usage of ${rule.tool} could not be verified.`,
          };
        }
        const names = [...new Set(events.map((e) => e.name))];
        return {
          label: rule.label,
          ruleType: rule.type,
          outcome: "FAIL",
          detail:
            names.length > 0
              ? `The tool-call trace contained only ${names.join(", ")}. No ${TOOL_PHASE_LABELS[rule.phase].toLowerCase()} event for ${rule.tool} exists.`
              : `The tool-call trace was empty — ${rule.tool} was never called.`,
        };
      }
      const phaseMatch = matching.filter((e) => phaseOk(e, rule.phase));
      if (phaseMatch.length === 0) {
        const best = matching[0];
        return {
          label: rule.label,
          ruleType: rule.type,
          outcome: "FAIL",
          detail: `${rule.tool} appears in the trace only as ${(
            TOOL_PHASE_LABELS[best.phase] ?? best.phase
          ).toLowerCase()} (status: ${best.status.toLowerCase()}) — the rule requires an ${TOOL_PHASE_LABELS[rule.phase].toLowerCase()} event.`,
        };
      }
      if (rule.args) {
        for (const ev of phaseMatch) {
          const check = checkArgs(ev, rule.args);
          if (!check.ok) {
            return {
              label: rule.label,
              ruleType: rule.type,
              outcome: "FAIL",
              detail: check.detail,
            };
          }
        }
      }
      if (rule.before) {
        const idx = events.indexOf(phaseMatch[0]);
        const beforeEvent = events
          .slice(0, idx)
          .find(
            (e) =>
              e.name === rule.before &&
              (e.phase === "OBSERVED" || e.phase === "CONFIRMED")
          );
        if (!beforeEvent) {
          return {
            label: rule.label,
            ruleType: rule.type,
            outcome: "FAIL",
            detail: `${rule.tool} was ${TOOL_PHASE_LABELS[phaseMatch[0].phase].toLowerCase()}, but ${rule.before} was not observed before it.`,
          };
        }
      }
      return {
        label: rule.label,
        ruleType: rule.type,
        outcome: "PASS",
        detail: `${rule.tool} was ${TOOL_PHASE_LABELS[phaseMatch[0].phase].toLowerCase()}${rule.args ? " with the expected arguments" : ""}${rule.before ? `, after ${rule.before}` : ""}.`,
      };
    }
    case "forbiddenTool": {
      const matching = events.filter((e) => e.name === rule.tool);
      if (matching.length > 0) {
        return {
          label: rule.label,
          ruleType: rule.type,
          outcome: "FAIL",
          detail: `${rule.tool} was called with ${argsToString(matching[0].arguments)} — this tool is forbidden in this scenario.`,
        };
      }
      if (!traceAvailable) {
        return {
          label: rule.label,
          ruleType: rule.type,
          outcome: "NOT_EVIDENCED",
          detail: `The agent's responses included no tool-call trace, so the absence of ${rule.tool} could not be verified.`,
        };
      }
      return {
        label: rule.label,
        ruleType: rule.type,
        outcome: "PASS",
        detail: `No ${rule.tool} call appears in the tool-call trace.`,
      };
    }
    case "maxToolCalls": {
      if (!traceAvailable) {
        return {
          label: rule.label,
          ruleType: rule.type,
          outcome: "NOT_EVIDENCED",
          detail:
            "The agent's responses included no tool-call trace, so the number of tool calls could not be counted.",
        };
      }
      const count = events.length;
      return {
        label: rule.label,
        ruleType: rule.type,
        outcome: count > rule.max ? "FAIL" : "PASS",
        detail:
          count > rule.max
            ? `The trace shows ${count} tool calls; the limit for this scenario is ${rule.max}.`
            : `The trace shows ${count} tool call${count === 1 ? "" : "s"} (limit: ${rule.max}).`,
      };
    }
    case "claimRequiresConfirmedTool": {
      if (reply === null)
        return {
          label: rule.label,
          ruleType: rule.type,
          outcome: "NOT_EVIDENCED",
          detail:
            "No agent reply could be extracted from the response, so no claims could be checked.",
        };
      let re: RegExp;
      try {
        re = new RegExp(rule.claimPattern, "gi");
      } catch {
        return {
          label: rule.label,
          ruleType: rule.type,
          outcome: "NOT_EVIDENCED",
          detail: "The claim pattern is invalid and could not be evaluated.",
        };
      }
      const claims = [...reply.matchAll(re)].map((m) => m[1]).filter(Boolean);
      if (claims.length === 0) {
        return {
          label: rule.label,
          ruleType: rule.type,
          outcome: "PASS",
          detail: `The reply makes no ${rule.tool} claims that would require confirmation.`,
        };
      }
      if (events.length === 0 && !traceAvailable) {
        return {
          label: rule.label,
          ruleType: rule.type,
          outcome: "NOT_EVIDENCED",
          detail: `The reply claims identifiers (${claims.join(", ")}), but no tool-call trace was available to verify them.`,
        };
      }
      const confirmed = events.filter(
        (e) => e.phase === "CONFIRMED" && e.name === rule.tool
      );
      const blob = eventBlob(confirmed);
      const unverified = claims.filter((c) => !blob.includes(c));
      if (unverified.length > 0) {
        return {
          label: rule.label,
          ruleType: rule.type,
          outcome: "FAIL",
          detail: `The reply claims ${unverified.map((c) => `"${c}"`).join(", ")}, but no confirmed ${rule.tool} result contains ${unverified.length > 1 ? "these identifiers" : "this identifier"}.`,
        };
      }
      return {
        label: rule.label,
        ruleType: rule.type,
        outcome: "PASS",
        detail: `Every identifier claimed in the reply (${claims.join(", ")}) appears in a confirmed ${rule.tool} result.`,
      };
    }
  }
}

function ruleAdvice(rule: EvalRule): string {
  switch (rule.type) {
    case "mustInclude":
    case "mustIncludeAny":
      return `Adjust the agent's grounding (retrieval or instructions) so that its answer ${lower(rule.label)}.`;
    case "mustNotInclude":
    case "mustNotIncludeAny":
      return `Constrain the agent so that it ${lower(rule.label)}.`;
    case "mustNotMatch":
      return `Prevent the agent from producing content that ${lower(rule.label)}.`;
    case "requiredTool":
      return `Ensure ${rule.tool} is ${TOOL_PHASE_LABELS[rule.phase].toLowerCase()} in the tool-call trace${rule.before ? ` before ${rule.before} runs` : ""}.`;
    case "forbiddenTool":
      return `Ensure ${rule.tool} can never be invoked in this scenario — add a policy gate before destructive tools.`;
    case "maxToolCalls":
      return `Deduplicate tool calls — reuse earlier results instead of re-invoking the same tool.`;
    case "claimRequiresConfirmedTool":
      return `Only state identifiers like ticket or refund numbers after a confirmed tool result actually contains them.`;
  }
}

function lower(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

export interface EvaluationResult {
  status: "PASS" | "FAIL" | "INCONCLUSIVE";
  outcomes: RuleOutcome[];
  explanation: string;
  recommendation?: string;
}

export function evaluateCase(
  testCase: Pick<TestCaseData, "rules" | "failureHint">,
  observedReply: string | null,
  toolEvents: ToolEventDTO[],
  traceAvailable: boolean
): EvaluationResult {
  const outcomes = testCase.rules.map((r) =>
    evalRule(r, observedReply, toolEvents, traceAvailable)
  );
  const failed = outcomes.filter((o) => o.outcome === "FAIL");
  const notEvidenced = outcomes.filter((o) => o.outcome === "NOT_EVIDENCED");

  let status: EvaluationResult["status"];
  let explanation: string;
  let recommendation: string | undefined;

  if (failed.length > 0) {
    status = "FAIL";
    explanation = `Failed ${failed.length} of ${outcomes.length} criteria. ${failed
      .map((o) => o.detail)
      .join(" ")}`;
    const advice = failed
      .map((o) => {
        const rule = testCase.rules.find((r) => r.label === o.label);
        return rule ? ruleAdvice(rule) : "";
      })
      .filter(Boolean)
      .join(" ");
    recommendation = `${advice}${testCase.failureHint ? ` ${testCase.failureHint}` : ""}`.trim();
  } else if (notEvidenced.length > 0) {
    status = "INCONCLUSIVE";
    explanation = `Could not verify ${notEvidenced.length} of ${outcomes.length} criteria. ${notEvidenced
      .map((o) => o.detail)
      .join(" ")}`;
  } else {
    status = "PASS";
    explanation = `All ${outcomes.length} criteria passed.`;
  }

  return {
    status,
    outcomes,
    explanation,
    recommendation: recommendation || undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Run-level aggregation                                               */
/* ------------------------------------------------------------------ */

export function computeRunStats(results: CaseResultDTO[]): {
  passed: number;
  failed: number;
  inconclusive: number;
  errored: number;
  notExecuted: number;
  executed: number;
  score: number | null;
  categories: CategoryBreakdownMap;
} {
  const categories: CategoryBreakdownMap = {
    CORRECTNESS: { total: 0, passed: 0, failed: 0, inconclusive: 0, errored: 0, notExecuted: 0 },
    TOOL_USAGE: { total: 0, passed: 0, failed: 0, inconclusive: 0, errored: 0, notExecuted: 0 },
    SAFETY: { total: 0, passed: 0, failed: 0, inconclusive: 0, errored: 0, notExecuted: 0 },
  };
  const acc = { passed: 0, failed: 0, inconclusive: 0, errored: 0, notExecuted: 0 };
  const key = (s: string) =>
    s === "PASS" ? "passed" : s === "FAIL" ? "failed" : s === "INCONCLUSIVE" ? "inconclusive" : s === "ERROR" ? "errored" : "notExecuted";

  for (const r of results) {
    const cat = categories[(r.category as CaseCategory) ?? "CORRECTNESS"];
    cat.total += 1;
    cat[key(r.status)] += 1;
    acc[key(r.status)] += 1;
  }

  // Score = passed / evaluated. Evaluated = pass + fail + inconclusive.
  // Errors and not-executed cases are excluded from the denominator but
  // never count as passes — they are surfaced separately.
  const evaluated = acc.passed + acc.failed + acc.inconclusive;
  const score = evaluated > 0 ? (acc.passed / evaluated) * 100 : null;

  return {
    ...acc,
    executed: evaluated,
    score: score === null ? null : Math.round(score * 10) / 10,
    categories,
  };
}
