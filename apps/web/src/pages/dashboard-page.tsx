import { FormEvent, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Deployment, DeploymentLogEntry, DeploymentStage } from "@orqforge/shared";

import { createDeployment, fetchDeployment, fetchDeployments, uploadArchive } from "../lib/api";
import { useDeploymentLogs } from "../lib/use-deployment-logs";

type SourceKind = "sample" | "git" | "archive";

export function DashboardPage() {
  const queryClient = useQueryClient();
  const [sourceKind, setSourceKind] = useState<SourceKind>("sample");
  const [appName, setAppName] = useState("hello-node");
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
      const normalizedAppName = appName.trim();
      if (!normalizedAppName) throw new Error("Enter an app name");

      if (sourceKind === "sample") {
        return createDeployment({ appName: normalizedAppName, sourceKind, sourceRef: "hello-node" });
      }
      if (sourceKind === "git") {
        if (!gitUrl.trim()) throw new Error("Enter a repository URL");
        return createDeployment({ appName: normalizedAppName, sourceKind, sourceRef: gitUrl.trim() });
      }
      if (!archiveFile) throw new Error("Select an archive file first");
      const upload = await uploadArchive(archiveFile);
      return createDeployment({ appName: normalizedAppName, sourceKind, sourceRef: upload.upload.path });
    },
    onSuccess: async (payload) => {
      setSubmitError(null);
      setSelectedId(payload.deployment.id);
      await queryClient.invalidateQueries({ queryKey: ["deployments"] });
      await queryClient.invalidateQueries({ queryKey: ["deployment", payload.deployment.id] });
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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
            <p className="section-label">New Deployment</p>
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

              <div className="form-field">
                <label htmlFor="app-name">App name</label>
                <input
                  id="app-name"
                  type="text"
                  placeholder="marketing-site"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  required
                />
              </div>

              {sourceKind === "sample" && (
                <div className="form-field">
                  <label htmlFor="sample-select">App</label>
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

              <button className="deploy-btn" type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Deploying…" : "Deploy →"}
              </button>
            </form>
          </div>

          <div className="deploy-list-panel">
            <div className="deploy-list-header">
              <p className="section-label">Deployments</p>
              <span className="count-pill">{deployments.length}</span>
            </div>
            <div className="deploy-list">
              {deployments.map((dep) => (
                <button
                  key={dep.id}
                  type="button"
                  className={`deploy-card${dep.id === selected?.id ? " selected" : ""}`}
                  onClick={() => setSelectedId(dep.id)}
                >
                  <div className="deploy-card-top">
                    <div className="deploy-card-name">
                      <StatusDot status={dep.status} />
                      <span>{dep.appName}</span>
                    </div>
                    <StatusBadge status={dep.status} />
                  </div>
                  <div className="deploy-card-meta">
                    <span>{dep.slug}</span>
                    <span>·</span>
                    <span>{dep.sourceKind}:{truncate(dep.sourceRef, 18)}</span>
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
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

function DeploymentView({ deployment, logs }: { deployment: Deployment; logs: DeploymentLogEntry[] }) {
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

  const liveUrl = deployment.routePath ? `http://localhost:8080${deployment.routePath}` : null;
  const failureCount = logs.filter((entry) => entry.stream === "stderr").length;

  return (
    <>
      <div className="deploy-hero">
        <div className="deploy-hero-left">
          <div className="deploy-hero-name">
            <StatusDot status={deployment.status} />
            <div className="deploy-hero-copy">
              <h1 className="deploy-slug">{deployment.appName}</h1>
              <span className="deploy-route-slug">{deployment.slug}</span>
            </div>
          </div>
          <div className="deploy-hero-sub">
            <StatusBadge status={deployment.status} />
            <span className="deploy-id-chip">{deployment.id.slice(0, 8)}</span>
            <span className="deploy-time">{relativeTime(deployment.updatedAt)}</span>
          </div>
        </div>
        <div className="deploy-hero-actions">
          {liveUrl && deployment.status === "running" && (
            <a href={liveUrl} target="_blank" rel="noreferrer" className="visit-btn">
              Open app ↗
            </a>
          )}
        </div>
      </div>

      <div className="summary-ribbon">
        <SummaryStat label="Status" value={statusLabel(deployment.status)} tone={deployment.status} />
        <SummaryStat label="Stage" value={stageLabel(deployment.stage)} />
        <SummaryStat label="Logs" value={String(logs.length)} />
        <SummaryStat label="Errors" value={String(failureCount)} tone={failureCount > 0 ? "failed" : "running"} />
        <SummaryStat label="Updated" value={relativeTime(deployment.updatedAt)} />
      </div>

      {deployment.failureReason && (
        <div className="failure-banner">{deployment.failureReason}</div>
      )}

      <div className="pipeline-strip">
        {PIPELINE_STEPS.map((step, index) => {
          const state = getStepState(step.stage, deployment.stage, deployment.status);

          return (
            <div key={step.stage} className={`pipeline-step ${state}`}>
              <div className="pipeline-marker">
                <span>{index + 1}</span>
              </div>
              <div className="pipeline-copy">
                <span className="pipeline-title">{step.label}</span>
                <span className="pipeline-caption">{step.caption}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="meta-strip">
        <MetaItem label="App"       value={deployment.appName} />
        <MetaItem label="Stage"     value={deployment.stage} />
        <MetaItem label="Source"    value={`${deployment.sourceKind}:${truncate(deployment.sourceRef, 26)}`} />
        <MetaItem label="Image"     value={deployment.imageTag} />
        <MetaItem label="Container" value={deployment.runtimeContainerName} />
        <MetaItem label="Route"     value={deployment.routePath} link={liveUrl ?? undefined} />
      </div>

      <div className="log-section">
        <div className="log-bar">
          <div className="log-bar-left">
            <span className="log-bar-title">Process log</span>
            <span className="log-count">{logs.length}</span>
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

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "pending" | "building" | "deploying" | "running" | "failed";
}) {
  return (
    <div className={`summary-stat${tone ? ` ${tone}` : ""}`}>
      <span className="summary-label">{label}</span>
      <strong className="summary-value">{value}</strong>
    </div>
  );
}

/* ── Meta item ───────────────────────────────────────────────── */

function MetaItem({ label, value, link }: { label: string; value: string | null; link?: string }) {
  const display = value ?? "—";
  return (
    <div className="meta-item">
      <span className="meta-label">{label}</span>
      <span className={`meta-val${!value ? " dim" : ""}`}>
        {link && value ? (
          <a href={link} target="_blank" rel="noreferrer">{display} ↗</a>
        ) : (
          display
        )}
      </span>
    </div>
  );
}

/* ── Status atoms ────────────────────────────────────────────── */

function StatusDot({ status }: { status: Deployment["status"] }) {
  return <span className={`status-dot ${status}`} aria-hidden="true" />;
}

function StatusBadge({ status }: { status: Deployment["status"] }) {
  const label: Record<Deployment["status"], string> = {
    pending: "Pending", building: "Building", deploying: "Deploying",
    running: "Running", failed: "Failed",
  };
  return <span className={`status-badge ${status}`}>{label[status]}</span>;
}

/* ── Helpers ─────────────────────────────────────────────────── */

const PIPELINE_STEPS: {
  stage: DeploymentStage;
  label: string;
  caption: string;
}[] = [
  {
    stage: "materializing_source",
    label: "Source",
    caption: "Workspace prepared",
  },
  {
    stage: "building_image",
    label: "Build",
    caption: "Railpack image",
  },
  {
    stage: "starting_container",
    label: "Runtime",
    caption: "Container boot",
  },
  {
    stage: "configuring_ingress",
    label: "Ingress",
    caption: "Caddy route",
  },
  {
    stage: "verifying_route",
    label: "Verify",
    caption: "Route health",
  },
  {
    stage: "completed",
    label: "Running",
    caption: "Live traffic",
  },
];

const STAGE_ORDER = PIPELINE_STEPS.map((step) => step.stage);

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch { return "--:--:--"; }
}

function relativeTime(iso: string) {
  try {
    const d = Date.now() - new Date(iso).getTime();
    if (d < 60_000) return `${Math.floor(d / 1_000)}s ago`;
    if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
    return `${Math.floor(d / 3_600_000)}h ago`;
  } catch { return iso; }
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function statusLabel(status: Deployment["status"]) {
  switch (status) {
    case "pending":
      return "Pending";
    case "building":
      return "Building";
    case "deploying":
      return "Deploying";
    case "running":
      return "Running";
    case "failed":
      return "Failed";
  }
}

function stageLabel(stage: DeploymentStage) {
  return stage
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getStepState(
  step: DeploymentStage,
  currentStage: DeploymentStage,
  status: Deployment["status"],
) {
  if (status === "failed" && step === currentStage) {
    return "failed";
  }

  const stepIndex = STAGE_ORDER.indexOf(step);
  const currentIndex = STAGE_ORDER.indexOf(currentStage);

  if (stepIndex < currentIndex) {
    return "complete";
  }

  if (stepIndex === currentIndex) {
    return status === "running" && step === "completed" ? "complete" : "active";
  }

  return "pending";
}
