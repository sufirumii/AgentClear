"use client";

import * as React from "react";
import { useHashRoute } from "@/lib/client";
import { SessionProvider, useSession } from "@/components/app/shell";
import { LogoMark } from "@/components/shared";

import { MarketingHeader } from "@/components/marketing";
import { MarketingFooter } from "@/components/marketing";
import { HomePage } from "@/components/marketing";
import { HowItWorksPage } from "@/components/marketing";
import { CapabilitiesPage } from "@/components/marketing";
import { SecurityPage } from "@/components/marketing";
import { DocsPage } from "@/components/marketing";
import { PrivacyPage } from "@/components/marketing";
import { TermsPage } from "@/components/marketing";
import { ContactPage } from "@/components/marketing";
import { BrandPage } from "@/components/marketing";

import { LoginPage, SignupPage } from "@/components/app/shell";
import { AppShell } from "@/components/app/shell";
import { OverviewPage } from "@/components/app/views";
import { AgentsPage, AgentFormPage } from "@/components/app/views";
import { SuitesPage, SuiteDetailPage } from "@/components/app/views";
import { RunsPage, ReportsPage, ComparePage } from "@/components/app/runs";
import { RunDetailPage } from "@/components/app/runs";
import { SettingsPage } from "@/components/app/settings";
import { OnboardingPage } from "@/components/app/shell";
import { SampleReportPage } from "@/components/app/runs";

function SplashScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <LogoMark size={40} className="animate-pulse text-primary" />
        <span className="text-sm text-muted-foreground">AgentClear</span>
      </div>
    </div>
  );
}

function NotFoundPage() {
  const { navigate } = useHashRoute();
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <div className="text-5xl font-semibold tracking-tight text-muted-foreground/40">
        404
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        This page doesn&apos;t exist.
      </p>
      <button
        onClick={() => navigate("/")}
        className="mt-4 text-sm font-medium text-primary hover:underline"
      >
        Back to home
      </button>
    </div>
  );
}

function Router() {
  const { path, navigate } = useHashRoute();
  const session = useSession();
  // route without query string
  const route = React.useMemo(() => path.split("?")[0], [path]);

  // scroll to top on route change
  React.useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [route]);

  // protect /app routes
  React.useEffect(() => {
    if (!session.loading && !session.user && route.startsWith("/app")) {
      navigate("/login");
    }
  }, [session.loading, session.user, route, navigate]);

  // redirect logged-in users away from auth pages
  React.useEffect(() => {
    if (!session.loading && session.user && (route === "/login" || route === "/signup")) {
      navigate("/app");
    }
  }, [session.loading, session.user, route, navigate]);

  if (session.loading) return <SplashScreen />;

  /* ---------------- authenticated app ---------------- */
  if (route.startsWith("/app")) {
    if (!session.user || !session.currentWorkspaceId) {
      return <SplashScreen />;
    }
    let content: React.ReactNode;
    if (route === "/app" || route === "/app/") content = <OverviewPage />;
    else if (route === "/app/onboarding") content = <OnboardingPage />;
    else if (route === "/app/agents" || route === "/app/agents/")
      content = <AgentsPage />;
    else if (route.startsWith("/app/agents/"))
      content = <AgentFormPage agentId={route.split("/")[3]} />;
    else if (route === "/app/suites" || route === "/app/suites/")
      content = <SuitesPage />;
    else if (route.startsWith("/app/suites/"))
      content = <SuiteDetailPage suiteId={route.split("/")[3]} />;
    else if (route === "/app/runs/compare") {
      const q = path.split("?")[1] ?? "";
      const a = q.match(/a=([a-z0-9]+)/i)?.[1];
      const b = q.match(/b=([a-z0-9]+)/i)?.[1];
      content = a && b ? <ComparePage runA={a} runB={b} /> : <NotFoundPage />;
    } else if (route === "/app/runs" || route === "/app/runs/")
      content = <RunsPage />;
    else if (route.startsWith("/app/runs/"))
      content = <RunDetailPage runId={route.split("/")[3]} mode="run" />;
    else if (route === "/app/reports" || route === "/app/reports/")
      content = <ReportsPage />;
    else if (route.startsWith("/app/reports/"))
      content = <RunDetailPage runId={route.split("/")[3]} mode="report" />;
    else if (route === "/app/settings") content = <SettingsPage />;
    else content = <NotFoundPage />;

    return <AppShell>{content}</AppShell>;
  }

  /* ---------------- public pages ---------------- */
  let page: React.ReactNode;
  if (route === "/" || route === "") page = <HomePage />;
  else if (route === "/product") page = <CapabilitiesPage />;
  else if (route === "/how-it-works") page = <HowItWorksPage />;
  else if (route === "/sample-report") page = <SampleReportPage />;
  else if (route === "/security") page = <SecurityPage />;
  else if (route === "/docs") page = <DocsPage />;
  else if (route === "/privacy") page = <PrivacyPage />;
  else if (route === "/terms") page = <TermsPage />;
  else if (route === "/contact") page = <ContactPage />;
  else if (route === "/brand") page = <BrandPage />;
  else if (route === "/login") page = <LoginPage />;
  else if (route === "/signup") page = <SignupPage />;
  else page = <NotFoundPage />;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MarketingHeader />
      <main className="flex flex-1 flex-col">{page}</main>
      <MarketingFooter />
    </div>
  );
}

export function AgentClearApp() {
  return (
    <SessionProvider>
      <Router />
    </SessionProvider>
  );
}
