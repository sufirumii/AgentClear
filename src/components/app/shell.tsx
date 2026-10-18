"use client";
import { AlertCircle, ArrowRight, Bot, Check, ChevronsUpDown, CircleDashed, FileText, LayoutDashboard, ListChecks, LogOut, Menu, Moon, Play, PlayCircle, Plug, Settings as SettingsIcon, Sun, TriangleAlert } from "lucide-react";
import { useTheme } from "next-themes";
import * as React from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app/views";
import { Logo } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, api, getCurrentWorkspaceId, setCurrentWorkspaceId, useApiData, useHashRoute } from "@/lib/client";
import { AgentDTO, AuthSessionDTO, OverviewDTO, RunSummaryDTO, SuiteSummary, WorkspaceDTO } from "@/lib/types";
import { cn } from "@/lib/utils";



/* ========================================================================== */
/* from src/components/app/session-context.tsx */
/* ========================================================================== */

interface SessionState {
  loading: boolean;
  user: AuthSessionDTO["user"] | null;
  workspaces: WorkspaceDTO[];
  currentWorkspaceId: string | null;
  refresh: () => Promise<void>;
  switchWorkspace: (id: string) => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = React.createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<{
    loading: boolean;
    session: AuthSessionDTO | null;
  }>({ loading: true, session: null });

  const refresh = React.useCallback(async () => {
    try {
      const session = await api<AuthSessionDTO>("/api/auth/session");
      let current = getCurrentWorkspaceId();
      const valid =
        current && session.workspaces.some((w) => w.id === current);
      if (!valid) current = session.currentWorkspaceId;
      if (current) setCurrentWorkspaceId(current);
      setState({
        loading: false,
        session: current
          ? { ...session, currentWorkspaceId: current }
          : session,
      });
    } catch {
      setState({ loading: false, session: null });
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const switchWorkspace = React.useCallback(
    async (id: string) => {
      setCurrentWorkspaceId(id);
      setState((s) =>
        s.session
          ? { ...s, session: { ...s.session, currentWorkspaceId: id } }
          : s
      );
      // data reload happens naturally via remounting views; trigger a
      // window event for views that listen
      window.dispatchEvent(new CustomEvent("agentclear:workspace-changed"));
    },
    []
  );

  const logout = React.useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    setCurrentWorkspaceId(null);
    setState({ loading: false, session: null });
  }, []);

  const value: SessionState = React.useMemo(
    () => ({
      loading: state.loading,
      user: state.session?.user ?? null,
      workspaces: state.session?.workspaces ?? [],
      currentWorkspaceId: state.session?.currentWorkspaceId ?? null,
      refresh,
      switchWorkspace,
      logout,
    }),
    [state, refresh, switchWorkspace, logout]
  );

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const ctx = React.useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}


/* ========================================================================== */
/* from src/components/app/app-shell.tsx */
/* ========================================================================== */

const NAV_ITEMS = [
  { path: "/app", label: "Overview", icon: LayoutDashboard, match: (p: string) => p === "/app" },
  { path: "/app/agents", label: "Agents", icon: Bot, match: (p: string) => p.startsWith("/app/agents") },
  { path: "/app/suites", label: "Test suites", icon: ListChecks, match: (p: string) => p.startsWith("/app/suites") },
  { path: "/app/runs", label: "Test runs", icon: PlayCircle, match: (p: string) => p.startsWith("/app/runs") },
  { path: "/app/reports", label: "Reports", icon: FileText, match: (p: string) => p.startsWith("/app/reports") },
  { path: "/app/settings", label: "Settings", icon: SettingsIcon, match: (p: string) => p.startsWith("/app/settings") },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { path, navigate } = useHashRoute();
  const { workspaces, currentWorkspaceId, switchWorkspace, user, logout } =
    useSession();
  const { theme, setTheme } = useTheme();
  const [runOpen, setRunOpen] = React.useState(false);
  const current = workspaces.find((w) => w.id === currentWorkspaceId);

  const go = (p: string) => {
    navigate(p);
    onNavigate?.();
  };

  return (
    <div className="flex h-full flex-col bg-ink-950 text-ink-fg">
      <div className="px-4 pt-5 pb-4">
        <button onClick={() => go("/app")} className="block" aria-label="AgentClear home">
          <Logo size={24} variant="on-ink" />
        </button>
      </div>

      {/* workspace selector */}
      <div className="px-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex w-full items-center gap-2 rounded-lg border border-ink-border bg-ink-900 px-3 py-2 text-left hover:bg-ink-800 transition-colors"
              aria-label="Switch workspace"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                  Workspace
                </div>
                <div className="truncate text-sm font-medium">
                  {current?.name ?? "No workspace"}
                </div>
              </div>
              <ChevronsUpDown className="size-4 shrink-0 text-ink-muted" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
            {workspaces.map((w) => (
              <DropdownMenuItem
                key={w.id}
                onClick={() => {
                  void switchWorkspace(w.id);
                  toast.success(`Switched to ${w.name}`);
                }}
                className="gap-2"
              >
                <Check className={cn("size-4", w.id === currentWorkspaceId ? "opacity-100" : "opacity-0")} />
                <span className="truncate">{w.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* primary action */}
      <div className="px-3 pt-4">
        <Button
          onClick={() => setRunOpen(true)}
          className="w-full gap-2"
          size="default"
        >
          <Play className="size-4" />
          New test run
        </Button>
      </div>

      {/* nav */}
      <nav className="mt-4 flex-1 space-y-0.5 overflow-y-auto px-3 pb-4" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => {
          const active = item.match(path);
          return (
            <button
              key={item.path}
              onClick={() => go(item.path)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-ink-800 font-medium text-ink-fg"
                  : "text-ink-muted hover:bg-ink-900 hover:text-ink-fg"
              )}
              aria-current={active ? "page" : undefined}
            >
              <item.icon className="size-4 shrink-0" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* bottom: theme + user */}
      <div className="border-t border-ink-border p-3 space-y-1">
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-ink-900 hover:text-ink-fg"
          aria-label="Toggle color theme"
        >
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink-muted transition-colors hover:bg-ink-900 hover:text-ink-fg"
              aria-label="User menu"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/25 text-xs font-semibold text-primary">
                {(user?.name ?? "?").slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate">{user?.name}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuLabel className="truncate">
              {user?.email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => go("/app/settings")} className="gap-2">
              <SettingsIcon className="size-4" /> Settings
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={async () => {
                try {
                  await api("/api/auth/logout", { method: "POST" });
                } catch {
                  // ignore
                }
                await logout();
                toast.success("Signed out");
                navigate("/");
              }}
              className="gap-2 text-fail focus:text-fail"
            >
              <LogOut className="size-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <NewRunDialog open={runOpen} onOpenChange={setRunOpen} />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const { path } = useHashRoute();

  React.useEffect(() => {
    setMobileOpen(false);
  }, [path]);

  return (
    <div className="flex min-h-screen bg-background">
      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 lg:block">
        <SidebarContent />
      </aside>

      {/* mobile top bar + drawer */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-ink-border bg-ink-950 px-4 lg:hidden">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle navigation"
          aria-expanded={mobileOpen}
          className="flex size-10 items-center justify-center rounded-lg text-ink-fg hover:bg-ink-800"
        >
          <Menu className="size-5" />
        </button>
        <Logo size={22} variant="on-ink" />
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-xl">
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1 pt-14 lg:pt-0 lg:pl-60">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}


/* ========================================================================== */
/* from src/components/app/new-run-dialog.tsx */
/* ========================================================================== */

export function NewRunDialog({
  open,
  onOpenChange,
  presetAgentId,
  presetSuiteId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presetAgentId?: string;
  presetSuiteId?: string;
}) {
  const { navigate } = useHashRoute();
  const [agents, setAgents] = React.useState<AgentDTO[]>([]);
  const [suites, setSuites] = React.useState<SuiteSummary[]>([]);
  const [agentId, setAgentId] = React.useState<string>("");
  const [suiteId, setSuiteId] = React.useState<string>("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    if (!open || loaded) return;
    setLoaded(true);
    void (async () => {
      try {
        const [a, s] = await Promise.all([
          api<{ agents: AgentDTO[] }>("/api/agents"),
          api<{ suites: SuiteSummary[] }>("/api/suites"),
        ]);
        setAgents(a.agents);
        setSuites(s.suites);
        setAgentId(
          presetAgentId ??
            a.agents.find((ag) => ag.status === "ACTIVE")?.id ??
            a.agents[0]?.id ??
            ""
        );
        setSuiteId(presetSuiteId ?? s.suites[0]?.id ?? "");
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Could not load agents and suites.");
      }
    })();
  }, [open, loaded, presetAgentId, presetSuiteId]);

  React.useEffect(() => {
    if (!open) {
      setLoaded(false);
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  const agent = agents.find((a) => a.id === agentId);
  const suite = suites.find((s) => s.id === suiteId);
  const unverified = agent && agent.connectionStatus !== "CONNECTED";

  const start = async () => {
    if (!agentId || !suiteId) {
      setError("Select an agent and a test suite.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await api<{ run: RunSummaryDTO }>("/api/runs", {
        json: { agentId, suiteId },
      });
      toast.success("Test run started", {
        description: `${suite?.name ?? "Suite"} · ${agent?.name ?? "Agent"}`,
      });
      onOpenChange(false);
      navigate(`/app/runs/${res.run.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not start the run.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Start a test run</DialogTitle>
          <DialogDescription>
            Every case in the suite will be executed against the selected agent,
            server-side. Progress and evidence are recorded per case.
          </DialogDescription>
        </DialogHeader>

        {agents.length === 0 && loaded && (
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            No agents configured yet.{" "}
            <button
              className="font-medium text-primary hover:underline"
              onClick={() => {
                onOpenChange(false);
                navigate("/app/agents/new");
              }}
            >
              Connect an agent first
            </button>
            .
          </p>
        )}

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="run-agent">Agent</Label>
            <select
              id="run-agent"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id} disabled={a.status === "DISABLED"}>
                  {a.name}
                  {a.type === "DEMO_SANDBOX" ? " (sandbox)" : ""}
                  {a.status === "DISABLED" ? " — disabled" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="run-suite">Test suite</Label>
            <select
              id="run-suite"
              value={suiteId}
              onChange={(e) => setSuiteId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {suites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.caseCount} cases)
                </option>
              ))}
            </select>
          </div>

          {unverified && (
            <div className="flex gap-2 rounded-lg border border-warn/30 bg-warn-soft/50 p-3 text-sm text-warn">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                This agent&apos;s connection is{" "}
                {agent?.connectionStatus === "FAILED" ? "failing" : "not verified"}. You
                can still run, but execution errors are likely — test the
                connection on the agent page first.
              </span>
            </div>
          )}

          {error && (
            <p className="rounded-lg border border-fail/30 bg-fail-soft/50 p-3 text-sm text-fail">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={start}
            disabled={submitting || !agentId || !suiteId || agents.length === 0}
            className="gap-2"
          >
            {submitting ? (
              <>
                <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />
                Starting…
              </>
            ) : (
              <>
                <Play className="size-4" />
                Run {suite ? `${suite.caseCount} cases` : "tests"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


/* ========================================================================== */
/* from src/components/app/auth-pages.tsx */
/* ========================================================================== */

function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[80vh] flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo size={30} />
        </div>
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
        <div className="mt-5 text-center text-sm text-muted-foreground">
          {footer}
        </div>
      </div>
    </div>
  );
}

function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-xs text-fail flex items-center gap-1">
      <AlertCircle className="size-3" />
      {message}
    </p>
  );
}

export function LoginPage() {
  const { navigate } = useHashRoute();
  const { refresh } = useSession();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await api<AuthSessionDTO>("/api/auth/login", {
        json: { email, password },
      });
      if (res.currentWorkspaceId)
        setCurrentWorkspaceId(res.currentWorkspaceId);
      await refresh();
      toast.success(`Welcome back, ${res.user.name.split(" ")[0]}`);
      navigate("/app");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign-in failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Sign in to AgentClear"
      subtitle="Continue testing your AI agents."
      footer={
        <>
          No account yet?{" "}
          <button
            onClick={() => navigate("/signup")}
            className="font-medium text-primary hover:underline"
          >
            Create one
          </button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="login-email">Email</Label>
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="login-password">Password</Label>
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </div>
        {error && (
          <p className="rounded-lg border border-fail/30 bg-fail-soft/50 p-2.5 text-sm text-fail">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthShell>
  );
}

export function SignupPage() {
  const { navigate } = useHashRoute();
  const { refresh } = useSession();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const validate = () => {
    const fe: Record<string, string> = {};
    if (!name.trim()) fe.name = "Name is required.";
    if (!/^\S+@\S+\.\S+$/.test(email)) fe.email = "Enter a valid email address.";
    if (password.length < 8) fe.password = "At least 8 characters.";
    setFieldErrors(fe);
    return Object.keys(fe).length === 0;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api<AuthSessionDTO>("/api/auth/signup", {
        json: { name, email, password },
      });
      if (res.currentWorkspaceId)
        setCurrentWorkspaceId(res.currentWorkspaceId);
      await refresh();
      toast.success("Workspace ready", {
        description:
          "We seeded the 25-case starter suite and the demo sandbox agent for you.",
      });
      navigate("/app/onboarding");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign-up failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Create your workspace"
      subtitle="Start testing agents in minutes — no credentials needed for the sandbox."
      footer={
        <>
          Already have an account?{" "}
          <button
            onClick={() => navigate("/login")}
            className="font-medium text-primary hover:underline"
          >
            Sign in
          </button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="su-name">Name</Label>
          <Input
            id="su-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alex Chen"
            autoComplete="name"
          />
          <FieldError message={fieldErrors.name} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="su-email">Work email</Label>
          <Input
            id="su-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            autoComplete="email"
          />
          <FieldError message={fieldErrors.email} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="su-password">Password</Label>
          <Input
            id="su-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
          />
          <FieldError message={fieldErrors.password} />
        </div>
        <ul className="space-y-1 text-xs text-muted-foreground">
          {[
            "A workspace is created automatically",
            "25-case starter suite included",
            "Demo sandbox agent — zero credentials needed",
          ].map((t) => (
            <li key={t} className="flex items-center gap-1.5">
              <Check className="size-3 text-pass" /> {t}
            </li>
          ))}
        </ul>
        {error && (
          <p className="rounded-lg border border-fail/30 bg-fail-soft/50 p-2.5 text-sm text-fail">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Creating workspace…" : "Start testing"}
        </Button>
      </form>
    </AuthShell>
  );
}


/* ========================================================================== */
/* from src/components/app/onboarding.tsx */
/* ========================================================================== */

export function OnboardingPage() {
  const { currentWorkspaceId } = useSession();
  const { navigate } = useHashRoute();
  const { data, refetch } = useApiData<OverviewDTO>(
    currentWorkspaceId ? "/api/overview" : null
  );
  const { data: agentsData, refetch: refetchAgents } = useApiData<{
    agents: AgentDTO[];
  }>(currentWorkspaceId ? "/api/agents" : null);
  const { data: suitesData } = useApiData<{ suites: SuiteSummary[] }>(
    currentWorkspaceId ? "/api/suites" : null
  );
  const [starting, setStarting] = React.useState(false);

  if (!data) {
    return <div className="h-96 animate-pulse rounded-xl border bg-muted/50" />;
  }

  const agents = agentsData?.agents ?? [];
  const sandbox = agents.find((a) => a.type === "DEMO_SANDBOX");
  const starterSuite = suitesData?.suites.find((s) => s.isStarter);
  const verifiedAgent = agents.find((a) => a.connectionStatus === "CONNECTED");

  const steps = [
    {
      title: "Connect an agent",
      done: data.onboarding.hasAgent,
      icon: Bot,
      body: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Your workspace already includes the{" "}
            <strong className="text-foreground">
              demo sandbox agent
            </strong>{" "}
            — a scripted support bot that runs inside the server with no
            outbound calls. You can run real tests against it immediately.
          </p>
          <div className="flex flex-wrap gap-2">
            {sandbox && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-pass/25 bg-pass-soft px-2.5 py-1 text-xs font-medium text-pass">
                <Check className="size-3" /> Sandbox agent connected
              </span>
            )}
            <Button variant="outline" size="sm" onClick={() => navigate("/app/agents/new")}>
              Connect your own agent instead
            </Button>
          </div>
        </div>
      ),
    },
    {
      title: "Validate the endpoint",
      done: Boolean(verifiedAgent),
      icon: Plug,
      body: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {verifiedAgent
              ? `Connection verified for “${verifiedAgent.name}”. ${verifiedAgent.type === "DEMO_SANDBOX" ? "No network request was needed — the sandbox is internal." : ""}`
              : "Send one harmless greeting through the agent's configured template to confirm the integration works before running a suite."}
          </p>
          {sandbox && !verifiedAgent && (
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={async () => {
                try {
                  const res = await api<{ result: { ok: boolean } }>(
                    `/api/agents/${sandbox.id}/test`,
                    { method: "POST" }
                  );
                  if (res.result.ok) toast.success("Connection verified");
                  else toast.error("Connection test failed");
                  refetchAgents();
                  refetch();
                } catch (e) {
                  toast.error(e instanceof ApiError ? e.message : "Test failed.");
                }
              }}
            >
              <Plug className="size-4" /> Test sandbox connection
            </Button>
          )}
        </div>
      ),
    },
    {
      title: "Select the starter suite",
      done: Boolean(starterSuite),
      icon: ListChecks,
      body: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {starterSuite
              ? `“${starterSuite.name}” is ready with ${starterSuite.caseCount} editable cases: 10 correctness, 8 tool usage, 7 safety.`
              : "Create or pick a test suite."}
          </p>
          {starterSuite && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate(`/app/suites/${starterSuite.id}`)}
              className="gap-2"
            >
              Review the 25 cases <ArrowRight className="size-3.5" />
            </Button>
          )}
        </div>
      ),
    },
    {
      title: "Run the suite",
      done: data.onboarding.hasRun,
      icon: Play,
      body: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {data.onboarding.hasRun
              ? "You've executed a real run. Re-run any time to check for regressions."
              : "Execute all 25 cases against the sandbox agent. Watch progress live — each case records requests, responses, tool events and rule outcomes."}
          </p>
          {sandbox && starterSuite && !data.onboarding.hasRun && (
            <Button
              className="gap-2"
              onClick={async () => {
                setStarting(true);
                try {
                  const res = await api<{ run: RunSummaryDTO }>("/api/runs", {
                    json: { agentId: sandbox.id, suiteId: starterSuite.id },
                  });
                  toast.success("Test run started");
                  navigate(`/app/runs/${res.run.id}`);
                } catch (e) {
                  toast.error(e instanceof ApiError ? e.message : "Could not start run.");
                } finally {
                  setStarting(false);
                }
              }}
              disabled={starting}
            >
              <Play className="size-4" />
              {starting ? "Starting…" : "Run the starter suite"}
            </Button>
          )}
        </div>
      ),
    },
    {
      title: "Review the results",
      done: false,
      icon: FileText,
      body: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Open the report to inspect every pass and failure with its
            evidence: expected vs observed behavior, tool-call traces, and the
            exact rule that failed.
          </p>
          <div className="flex flex-wrap gap-2">
            {data.recentRuns[0] && (
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={() => navigate(`/app/reports/${data.recentRuns[0].id}`)}
              >
                <FileText className="size-4" />
                Open latest report
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => navigate("/sample-report")}>
              Explore the sample report
            </Button>
          </div>
        </div>
      ),
    },
  ];

  const completed = steps.filter((s) => s.done).length;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Welcome to AgentClear"
        description="Six steps from zero to your first evidence-backed agent evaluation."
      />

      <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${(completed / steps.length) * 100}%` }}
          />
        </div>
        <span className="text-xs font-medium tabular-nums text-muted-foreground">
          {completed}/{steps.length} complete
        </span>
        <Button variant="ghost" size="sm" onClick={() => navigate("/app")}>
          Skip
        </Button>
      </div>

      <ol className="space-y-3">
        {steps.map((step, i) => (
          <li
            key={step.title}
            className={cn(
              "rounded-xl border bg-card p-5",
              step.done && "border-pass/25"
            )}
          >
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full",
                  step.done
                    ? "bg-pass-soft text-pass"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {step.done ? (
                  <Check className="size-4" />
                ) : (
                  <step.icon className="size-4" />
                )}
              </span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                    Step {i + 1}
                  </span>
                  <h2 className="text-sm font-semibold">{step.title}</h2>
                  {!step.done && (
                    <CircleDashed className="size-3.5 text-muted-foreground/60" />
                  )}
                </div>
              </div>
            </div>
            <div className="mt-3 sm:pl-11">{step.body}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}
