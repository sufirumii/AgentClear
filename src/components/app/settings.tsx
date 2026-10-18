"use client";

import * as React from "react";
import { useApiData } from "@/lib/client";
import { useSession } from "@/components/app/shell";
import { useHashRoute } from "@/lib/client";
import { api, ApiError } from "@/lib/client";
import { SettingsDTO, ApiTokenDTO, SessionInfoDTO } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/app/views";
import { formatDateTime, formatRelative } from "@/lib/client";
import { toast } from "sonner";
import { Check, Copy, KeyRound, Laptop, Trash2, Plus, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Workspace, profile, API access, sessions, and data lifecycle."
      />
      <Tabs defaultValue="workspace">
        <TabsList className="h-auto w-full grid grid-cols-3 sm:w-auto sm:inline-grid sm:grid-cols-5">
          <TabsTrigger value="workspace" className="px-2 sm:px-3">Workspace</TabsTrigger>
          <TabsTrigger value="profile" className="px-2 sm:px-3">Profile</TabsTrigger>
          <TabsTrigger value="tokens" className="px-2 sm:px-3">API tokens</TabsTrigger>
          <TabsTrigger value="sessions" className="px-2 sm:px-3">Sessions</TabsTrigger>
          <TabsTrigger value="danger" className="px-2 sm:px-3">Danger zone</TabsTrigger>
        </TabsList>
        <TabsContent value="workspace" className="mt-4">
          <WorkspaceSettings />
        </TabsContent>
        <TabsContent value="profile" className="mt-4">
          <ProfileSettings />
        </TabsContent>
        <TabsContent value="tokens" className="mt-4">
          <TokenSettings />
        </TabsContent>
        <TabsContent value="sessions" className="mt-4">
          <SessionSettings />
        </TabsContent>
        <TabsContent value="danger" className="mt-4">
          <DangerSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function useSettings() {
  const { currentWorkspaceId, refresh } = useSession();
  const { data, refetch } = useApiData<{ settings: SettingsDTO }>(
    currentWorkspaceId ? "/api/settings" : null
  );
  return { data, refetch, refreshSession: refresh };
}

function WorkspaceSettings() {
  const { data, refetch } = useSettings();
  const [name, setName] = React.useState("");
  const [threshold, setThreshold] = React.useState(90);
  const [retention, setRetention] = React.useState(365);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (data?.settings) {
      setName(data.settings.workspace.name);
      setThreshold(data.settings.workspace.passThreshold);
      setRetention(data.settings.workspace.retentionDays);
    }
  }, [data]);

  if (!data) return <div className="h-48 animate-pulse rounded-xl border bg-muted/50" />;

  const save = async () => {
    setSaving(true);
    try {
      await api("/api/settings", {
        method: "PATCH",
        json: {
          workspace: {
            name: name.trim() || data.settings.workspace.name,
            passThreshold: threshold,
            retentionDays: retention,
          },
        },
      });
      toast.success("Workspace settings saved");
      refetch();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl space-y-5 rounded-xl border bg-card p-5">
      <div className="space-y-1.5">
        <Label htmlFor="ws-name">Workspace name</Label>
        <Input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ws-threshold">
          Pass threshold: <span className="font-semibold tabular-nums">{threshold}%</span>
        </Label>
        <input
          id="ws-threshold"
          type="range"
          min={50}
          max={100}
          step={5}
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
          className="w-full accent-primary"
        />
        <p className="text-xs text-muted-foreground">
          Runs at or above this score are flagged as above threshold. Passing a
          threshold does not certify production safety.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ws-retention">Data retention (days)</Label>
        <Input
          id="ws-retention"
          type="number"
          min={7}
          max={3650}
          value={retention}
          onChange={(e) => setRetention(Number(e.target.value))}
        />
        <p className="text-xs text-muted-foreground">
          Non-sample runs older than this are pruned when new runs complete.
          Sample records are never auto-deleted.
        </p>
      </div>
      <Button onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save workspace settings"}
      </Button>
    </div>
  );
}

function ProfileSettings() {
  const { data, refetch, refreshSession } = useSettings();
  const [name, setName] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (data?.settings) setName(data.settings.user.name);
  }, [data]);

  if (!data) return <div className="h-48 animate-pulse rounded-xl border bg-muted/50" />;

  return (
    <div className="max-w-xl space-y-5 rounded-xl border bg-card p-5">
      <div className="space-y-1.5">
        <Label htmlFor="pf-name">Display name</Label>
        <Input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Email</Label>
        <Input value={data.settings.user.email} disabled />
        <p className="text-xs text-muted-foreground">
          Email changes aren&apos;t supported in this release.
        </p>
      </div>
      <Button
        disabled={saving || name.trim() === data.settings.user.name}
        onClick={async () => {
          setSaving(true);
          try {
            await api("/api/settings", {
              method: "PATCH",
              json: { user: { name: name.trim() } },
            });
            toast.success("Profile updated");
            await refetch();
            await refreshSession();
          } catch (e) {
            toast.error(e instanceof ApiError ? e.message : "Save failed.");
          } finally {
            setSaving(false);
          }
        }}
      >
        {saving ? "Saving…" : "Save profile"}
      </Button>
    </div>
  );
}

function TokenSettings() {
  const { currentWorkspaceId } = useSession();
  const { data, refetch } = useApiData<{ tokens: ApiTokenDTO[] }>(
    currentWorkspaceId ? "/api/settings/tokens" : null
  );
  const [createOpen, setCreateOpen] = React.useState(false);
  const [tokenName, setTokenName] = React.useState("");
  const [created, setCreated] = React.useState<ApiTokenDTO | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const tokens = data?.tokens ?? [];

  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <KeyRound className="size-4 text-primary" /> Read-only API tokens
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Authenticate programmatic access:{" "}
              <code className="break-all rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                Authorization: Bearer &lt;token&gt;
              </code>{" "}
              on{" "}
              <code className="break-all rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                GET /api/runs
              </code>
              ,{" "}
              <code className="break-all rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                GET /api/runs/:id
              </code>{" "}
              and report exports.
            </p>
          </div>
          <Button size="sm" className="gap-2 shrink-0" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> New token
          </Button>
        </div>

        {tokens.length > 0 && (
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 font-medium">Name</th>
                <th className="py-2 font-medium">Prefix</th>
                <th className="py-2 font-medium">Last used</th>
                <th className="py-2 font-medium">Created</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {tokens.map((t) => (
                <tr key={t.id}>
                  <td className="py-2.5 font-medium">{t.name}</td>
                  <td className="py-2.5 font-mono text-xs text-muted-foreground">
                    {t.prefix}…
                  </td>
                  <td className="py-2.5 text-xs text-muted-foreground">
                    {t.lastUsedAt ? formatRelative(t.lastUsedAt) : "never"}
                  </td>
                  <td className="py-2.5 text-xs text-muted-foreground">
                    {formatRelative(t.createdAt)}
                  </td>
                  <td className="py-2.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:text-fail"
                      aria-label={`Revoke ${t.name}`}
                      onClick={async () => {
                        try {
                          await api(`/api/settings/tokens/${t.id}`, { method: "DELETE" });
                          toast.success("Token revoked");
                          refetch();
                        } catch (e) {
                          toast.error(e instanceof ApiError ? e.message : "Revoke failed.");
                        }
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={(v) => {
        setCreateOpen(v);
        if (!v) {
          setCreated(null);
          setTokenName("");
          setCopied(false);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{created ? "Token created" : "Create API token"}</DialogTitle>
            <DialogDescription>
              {created
                ? "Copy it now — for security, the token is shown only once and only its hash is stored."
                : "Give the token a recognizable name. It grants read-only access to this workspace's runs and reports."}
            </DialogDescription>
          </DialogHeader>
          {created ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3">
                <code className="min-w-0 flex-1 break-all font-mono text-xs">
                  {created.token}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 shrink-0"
                  onClick={async () => {
                    await navigator.clipboard.writeText(created.token ?? "");
                    setCopied(true);
                    toast.success("Copied to clipboard");
                  }}
                >
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <Button
                className="w-full"
                onClick={() => {
                  setCreateOpen(false);
                  setCreated(null);
                  setTokenName("");
                  refetch();
                }}
              >
                Done
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="tk-name">Token name</Label>
                <Input
                  id="tk-name"
                  value={tokenName}
                  onChange={(e) => setTokenName(e.target.value)}
                  placeholder="CI pipeline"
                />
              </div>
              <DialogFooter>
                <Button
                  disabled={!tokenName.trim() || creating}
                  onClick={async () => {
                    setCreating(true);
                    try {
                      const res = await api<{ token: ApiTokenDTO }>(
                        "/api/settings/tokens",
                        { json: { name: tokenName.trim() } }
                      );
                      setCreated(res.token);
                    } catch (e) {
                      toast.error(e instanceof ApiError ? e.message : "Creation failed.");
                    } finally {
                      setCreating(false);
                    }
                  }}
                >
                  {creating ? "Creating…" : "Create token"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SessionSettings() {
  const { currentWorkspaceId } = useSession();
  const { data, refetch } = useApiData<{ sessions: SessionInfoDTO[] }>(
    currentWorkspaceId ? "/api/settings/sessions" : null
  );
  const sessions = data?.sessions ?? [];

  return (
    <div className="max-w-2xl rounded-xl border bg-card p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Laptop className="size-4 text-primary" /> Active sessions
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Devices where you&apos;re signed in. Revoking a session signs it out
        immediately.
      </p>
      <div className="mt-4 divide-y">
        {sessions.map((s) => (
          <div key={s.id} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                {sessionLabel(s.userAgent)}
                {s.current && (
                  <span className="rounded-full border border-pass/25 bg-pass-soft px-2 py-0.5 text-[10px] font-medium text-pass">
                    This device
                  </span>
                )}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {s.userAgent ?? "Unknown device"} · last active{" "}
                {formatRelative(s.lastSeenAt)}
              </div>
            </div>
            {!s.current && (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    await api(`/api/settings/sessions/${s.id}`, { method: "DELETE" });
                    toast.success("Session revoked");
                    refetch();
                  } catch (e) {
                    toast.error(e instanceof ApiError ? e.message : "Revoke failed.");
                  }
                }}
              >
                Revoke
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function sessionLabel(ua: string | null): string {
  if (!ua) return "Unknown device";
  if (/mobile/i.test(ua)) return "Mobile browser";
  if (/chrome/i.test(ua)) return "Chrome";
  if (/firefox/i.test(ua)) return "Firefox";
  if (/safari/i.test(ua)) return "Safari";
  return "Browser session";
}

function DangerSettings() {
  const { navigate } = useHashRoute();
  const { refresh, logout, currentWorkspaceId, workspaces } = useSession();
  const [scope, setScope] = React.useState<"workspace" | "account" | null>(null);
  const [confirmText, setConfirmText] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);
  const workspaceName = workspaces.find((w) => w.id === currentWorkspaceId)?.name;

  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-xl border border-fail/25 bg-fail-soft/20 p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-fail">
          <ShieldAlert className="size-4" /> Danger zone
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          These actions are permanent and cannot be undone.
        </p>

        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3.5">
            <div>
              <div className="text-sm font-medium">Delete workspace</div>
              <p className="text-xs text-muted-foreground">
                Deletes “{workspaceName}” with all agents, suites, runs and
                reports. {workspaces.length > 1 ? "Other workspaces are unaffected." : "This is your only workspace — your account will be deleted with it."}
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setScope("workspace");
                setConfirmText("");
              }}
            >
              Delete workspace
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3.5">
            <div>
              <div className="text-sm font-medium">Delete account</div>
              <p className="text-xs text-muted-foreground">
                Deletes your user, every workspace you own, and all sessions.
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setScope("account");
                setConfirmText("");
              }}
            >
              Delete account
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={scope !== null} onOpenChange={(v) => !v && setScope(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {scope === "workspace" ? "Delete workspace" : "Delete account"}
            </DialogTitle>
            <DialogDescription>
              {scope === "workspace"
                ? `“${workspaceName}” and everything in it will be permanently removed.`
                : "Your account and all workspaces will be permanently removed."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="dz-confirm">
              Type <span className="font-mono font-semibold">DELETE</span> to confirm
            </Label>
            <Input
              id="dz-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScope(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={confirmText !== "DELETE" || deleting}
              onClick={async () => {
                setDeleting(true);
                try {
                  await api("/api/account", {
                    method: "DELETE",
                    json: { scope, confirm: "DELETE" },
                  });
                  toast.success(
                    scope === "workspace" ? "Workspace deleted" : "Account deleted"
                  );
                  await logout();
                  await refresh();
                  navigate("/");
                } catch (e) {
                  toast.error(e instanceof ApiError ? e.message : "Deletion failed.");
                } finally {
                  setDeleting(false);
                  setScope(null);
                }
              }}
            >
              {deleting ? "Deleting…" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
