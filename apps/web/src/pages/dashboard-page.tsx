import { FormEvent, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Deployment, DeploymentLogEntry } from "@orqforge/shared";

import { createDeployment, fetchDeployment, fetchDeployments, uploadArchive } from "../lib/api";
import { useDeploymentLogs } from "../lib/use-deployment-logs";

type SourceKind = "sample" | "git" | "archive";

export function DashboardPage() {
  const queryClient = useQueryClient();
  const [sourceKind, setSourceKind] = useState<SourceKind>("sample");
  const [gitUrl, setGitUrl] = useState("");
  const [archiveFile, setArchiveFile] = useState<File | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const deploymentsQuery = useQuery({
    queryKey: ["deployments"],
    queryFn: fetchDeployments,
    refetchInterval: 2000,
  });

  const deployments = deploymentsQuery.data?.deployments ?? [];
  const isApiHealthy = deploymentsQuery.isSuccess;
  const runningCount = deployments.filter((d) => d.status === "running").length;

  useEffect(() => {
    if (!selectedId && deployments[0]) setSelectedId(deployments[0].id);
  }, [deployments, selectedId]);

  const detailQuery = useQuery({
    queryKey: ["deployment", selectedId],
    queryFn: () => fetchDeployment(selectedId!),
    enabled: Boolean(selectedId),
    refetchInterval: 2000,
  });

  const selected =
    detailQuery.data?.deployment ??
    deployments.find((d) => d.id === selectedId) ??
    null;

  const logs = useDeploymentLogs(selected);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (sourceKind === "sample") {
        return createDeployment({ sourceKind, sourceRef: "hello-node" });
      }
      if (sourceKind === "git") {
        if (!gitUrl.trim()) throw new Error("Enter a repository URL");
        return createDeployment({ sourceKind, sourceRef: gitUrl.trim() });
      }
      if (!archiveFile) throw new Error("Select an archive file first");
      const upload = await uploadArchive(archiveFile);
      return createDeployment({ sourceKind, sourceRef: upload.upload.path });
    },
    onSuccess: async (payload) => {
      setSubmitError(null);
      setSelectedId(payload.deployment.id);
      await queryClient.invalidateQueries({ queryKey: ["deployments"] });
      await queryClient.invalidateQueries({
        queryKey: ["deployment", payload.deployment.id],
      });
    },
    onError: (err) =>
      setSubmitError(err instanceof Error ? err.message : "Deployment failed"),
  });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await createMutation.mutateAsync();
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <span className="topbar-icon">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="12 2 2 7 12 12 22 7 12 2"/>
              <polyline points="2 17 12 22 22 17"/>
              <polyline points="2 12 12 17 22 12"/>
            </svg>
          </span>
          <span className="topbar-wordmark">Orqforge</span>
        </div>
        <span
          className={`topbar-api-dot${isApiHealthy ? "" : " unhealthy"}`}
          title={isApiHealthy ? "API online" : "API unreachable"}
        />
        <span className="topbar-sep" />
        <div className="topbar-meta">
          <strong>{deployments.length}</strong>
          <span>{deployments.length === 1 ? "deployment" : "deployments"}</span>
          <span>·</span>
          <strong>{runningCount}</strong>
          <span>running</span>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div className="new-deploy-panel">
            <p className="panel-label">New Deployment</p>
            <form onSubmit={handleSubmit}>
              <div className="source-tabs" role="group" aria-label="Source type">
                {(["sample", "git", "archive"] as SourceKind[]).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    className={`source-tab${sourceKind === kind ? " active" : ""}`}
                    onClick={() => setSourceKind(kind)}
                  >
                    {kind === "sample" ? "Sample" : kind === "git" ? "Git" : "Archive"}
                  </button>
                ))}
              </div>

              {sourceKind === "sample" && (
                <div className="form-field">
                  <label htmlFor="sample-select">Sample app</label>
                  <select id="sample-select" disabled defaultValue="hello-node">
                    <option value="hello-node">hello-node</option>
                  </select>
                </div>
              )}

              {sourceKind === "git" && (
                <div className="form-field">
                  <label htmlFor="git-url">Repository URL</label>
                  <input
                    id="git-url"
                    type="url"
                    placeholder="https://github.com/org/repo.git"
                    value={gitUrl}
                    onChange={(e) => setGitUrl(e.target.value)}
                    required
                  />
                </div>
              )}

              {sourceKind === "archive" && (
                <div className="form-field">
                  <label htmlFor="archive-input">Archive file</label>
                  <input
                    id="archive-input"
                    type="file"
                    accept=".zip,.tar,.tgz,.tar.gz"
                    onChange={(e) => setArchiveFile(e.target.files?.[0] ?? null)}
                    required
                  />
                </div>
              )}

              {submitError && <p className="form-error">{submitError}</p>}

              <button
                className="deploy-btn"
                type="submit"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "Deploying…" : "Deploy →"}
              </button>
            </form>
          </div>

          <div className="deploy-list-panel">
            <div className="deploy-list-header">
              <p className="panel-label">Deployments</p>
              <span className="count-badge">{deployments.length}</span>
            </div>
            <div className="deploy-list">
              {deployments.map((dep) => (
                <button
                  key={dep.id}
                  type="button"
                  className={`deploy-card${dep.id === selected?.id ? " selected" : ""}`}
                  onClick={() => setSelectedId(dep.id)}
                >
                  <div className="deploy-card-row">
                    <div className="deploy-card-name">
                      <StatusDot status={dep.status} />
                      <span>{dep.slug}</span>
                    </div>
                    <StatusBadge status={dep.status} />
                  </div>
                  <div className="deploy-card-meta">
                    {dep.sourceKind}:{truncate(dep.sourceRef, 30)}
                  </div>
                </button>
              ))}

              {deployments.length === 0 && (
                <div className="list-empty">
                  <strong>No deployments yet</strong>
                  Create one using the form above.
                </div>
              )}
            </div>
          </div>
        </aside>

        <main className="main-panel">
          {selected ? (
            <DeploymentView deployment={selected} logs={logs} />
          ) : (
            <div className="main-empty">
              <div className="main-empty-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polygon points="12 2 2 7 12 12 22 7 12 2"/>
                  <polyline points="2 17 12 22 22 17"/>
                  <polyline points="2 12 12 17 22 12"/>
                </svg>
              </div>
              <strong>No deployment selected</strong>
              <span>Create one or pick from the list.</span>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

/* ── Deployment view ─────────────────────────────────────────── */

function DeploymentView({
  deployment,
  logs,
}: {
  deployment: Deployment;
  logs: DeploymentLogEntry[];
}) {
  const logRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  function onLogScroll() {
    const el = logRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
    setAutoScroll(atBottom);
  }

  const liveUrl =
    deployment.routePath ? `http://localhost:8080${deployment.routePath}` : null;

  return (
    <>
      <div className="deploy-header">
        <div className="deploy-title-group">
          <StatusDot status={deployment.status} />
          <span className="deploy-slug">{deployment.slug}</span>
          <StatusBadge status={deployment.status} />
          <span className="deploy-id">{deployment.id.slice(0, 8)}</span>
        </div>
        <div className="deploy-actions">
          {liveUrl && deployment.status === "running" && (
            <a href={liveUrl} target="_blank" rel="noreferrer" className="visit-btn">
              Open app ↗
            </a>
          )}
        </div>
      </div>

      {deployment.failureReason && (
        <div className="failure-banner">{deployment.failureReason}</div>
      )}

      <dl className="meta-grid">
        <MetaCell label="Stage"     value={deployment.stage} />
        <MetaCell label="Image"     value={deployment.imageTag} />
        <MetaCell label="Container" value={deployment.runtimeContainerName} />
        <MetaCell
          label="Source"
          value={`${deployment.sourceKind} · ${truncate(deployment.sourceRef, 38)}`}
        />
        <MetaCell label="Route"   value={deployment.routePath} link={liveUrl ?? undefined} />
        <MetaCell label="Updated" value={relativeTime(deployment.updatedAt)} />
      </dl>

      <div className="log-section">
        <div className="log-toolbar">
          <div className="log-toolbar-left">
            <span className="log-toolbar-label">Logs</span>
            <span className="log-line-count">{logs.length} lines</span>
          </div>
          <button
            type="button"
            className={`autoscroll-toggle${autoScroll ? " active" : ""}`}
            onClick={() => setAutoScroll((v) => !v)}
          >
            <span className="toggle-pill" />
            Auto-scroll
          </button>
        </div>

        <div className="log-output" ref={logRef} onScroll={onLogScroll}>
          {logs.length === 0 ? (
            <div className="log-waiting">Waiting for pipeline output…</div>
          ) : (
            logs.map((entry) => <LogLine key={entry.seq} entry={entry} />)
          )}
        </div>
      </div>
    </>
  );
}

/* ── Log line ────────────────────────────────────────────────── */

function LogLine({ entry }: { entry: DeploymentLogEntry }) {
  return (
    <div className={`log-line ${entry.stream}`}>
      <span className="log-time">{fmtTime(entry.createdAt)}</span>
      <span className="log-stream">{entry.stream}</span>
      <span className="log-msg">{entry.message}</span>
    </div>
  );
}

/* ── Meta cell ───────────────────────────────────────────────── */

function MetaCell({
  label,
  value,
  link,
}: {
  label: string;
  value: string | null;
  link?: string;
}) {
  const display = value ?? "—";
  const isEmpty = !value;
  return (
    <div className="meta-cell">
      <dt>{label}</dt>
      <dd className={isEmpty ? "dim" : ""}>
        {link && !isEmpty ? (
          <a href={link} target="_blank" rel="noreferrer">
            {display} ↗
          </a>
        ) : (
          display
        )}
      </dd>
    </div>
  );
}

/* ── Status atoms ────────────────────────────────────────────── */

function StatusDot({ status }: { status: Deployment["status"] }) {
  return <span className={`status-dot ${status}`} aria-hidden="true" />;
}

function StatusBadge({ status }: { status: Deployment["status"] }) {
  const label: Record<Deployment["status"], string> = {
    pending:   "Pending",
    building:  "Building",
    deploying: "Deploying",
    running:   "Running",
    failed:    "Failed",
  };
  return <span className={`status-badge ${status}`}>{label[status]}</span>;
}

/* ── Helpers ─────────────────────────────────────────────────── */

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "--:--:--";
  }
}

function relativeTime(iso: string) {
  try {
    const delta = Date.now() - new Date(iso).getTime();
    if (delta < 60_000)   return `${Math.floor(delta / 1_000)}s ago`;
    if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
    return `${Math.floor(delta / 3_600_000)}h ago`;
  } catch {
    return iso;
  }
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
