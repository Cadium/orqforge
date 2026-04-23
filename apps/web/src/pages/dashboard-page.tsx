import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Deployment } from "@orqforge/shared";

import {
  createDeployment,
  fetchDeployment,
  fetchDeployments,
  uploadArchive,
} from "../lib/api";
import { useDeploymentLogs } from "../lib/use-deployment-logs";

type SourceKind = "sample" | "git" | "archive";

export function DashboardPage() {
  const queryClient = useQueryClient();
  const [sourceKind, setSourceKind] = useState<SourceKind>("sample");
  const [gitUrl, setGitUrl] = useState("");
  const [sampleName, setSampleName] = useState("hello-node");
  const [archiveFile, setArchiveFile] = useState<File | null>(null);
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const deploymentsQuery = useQuery({
    queryKey: ["deployments"],
    queryFn: fetchDeployments,
    refetchInterval: 2000,
  });

  const deployments = deploymentsQuery.data?.deployments ?? [];
  const selectedDeployment = useMemo(
    () =>
      deployments.find((deployment) => deployment.id === selectedDeploymentId) ??
      deployments[0] ??
      null,
    [deployments, selectedDeploymentId],
  );

  useEffect(() => {
    if (!selectedDeploymentId && deployments[0]) {
      setSelectedDeploymentId(deployments[0].id);
    }
  }, [deployments, selectedDeploymentId]);

  const deploymentDetailQuery = useQuery({
    queryKey: ["deployment", selectedDeploymentId],
    queryFn: () => fetchDeployment(selectedDeploymentId!),
    enabled: Boolean(selectedDeploymentId),
    refetchInterval: 2000,
  });

  const logs = useDeploymentLogs(deploymentDetailQuery.data?.deployment ?? selectedDeployment);

  const createDeploymentMutation = useMutation({
    mutationFn: async () => {
      if (sourceKind === "sample") {
        return createDeployment({
          sourceKind,
          sourceRef: sampleName,
        });
      }

      if (sourceKind === "git") {
        return createDeployment({
          sourceKind,
          sourceRef: gitUrl.trim(),
        });
      }

      if (!archiveFile) {
        throw new Error("Select an archive file before submitting");
      }

      const upload = await uploadArchive(archiveFile);

      return createDeployment({
        sourceKind,
        sourceRef: upload.upload.path,
      });
    },
    onSuccess: async (payload) => {
      setSubmitError(null);
      setSelectedDeploymentId(payload.deployment.id);
      await queryClient.invalidateQueries({ queryKey: ["deployments"] });
      await queryClient.invalidateQueries({
        queryKey: ["deployment", payload.deployment.id],
      });
    },
    onError: (error) => {
      setSubmitError(error instanceof Error ? error.message : "Failed to create deployment");
    },
  });

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await createDeploymentMutation.mutateAsync();
  }

  const selected = deploymentDetailQuery.data?.deployment ?? selectedDeployment;

  return (
    <main className="dashboard-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Orqforge control plane</p>
          <h1>Ship a repo, watch the pipeline, inspect the route.</h1>
          <p className="hero-copy">
            Orqforge is a lightweight local-first deployment orchestrator that
            materializes source, builds an image, starts a container, and exposes it
            behind Caddy through one operator dashboard.
          </p>
        </div>
        <div className="hero-stats">
          <div>
            <strong>{deployments.length}</strong>
            <span>deployments tracked</span>
          </div>
          <div>
            <strong>{deployments.filter((item) => item.status === "running").length}</strong>
            <span>live routes</span>
          </div>
        </div>
      </section>

      <section className="dashboard-grid">
        <form className="panel form-panel" onSubmit={handleSubmit}>
          <div className="panel-header">
            <h2>Create deployment</h2>
            <p>Choose a source, then let Orqforge handle the pipeline.</p>
          </div>

          <label className="field">
            <span>Source type</span>
            <select
              value={sourceKind}
              onChange={(event) => setSourceKind(event.target.value as SourceKind)}
            >
              <option value="sample">Sample app</option>
              <option value="git">Git URL</option>
              <option value="archive">Uploaded archive</option>
            </select>
          </label>

          {sourceKind === "sample" ? (
            <label className="field">
              <span>Sample app</span>
              <select value={sampleName} onChange={(event) => setSampleName(event.target.value)}>
                <option value="hello-node">hello-node</option>
              </select>
            </label>
          ) : null}

          {sourceKind === "git" ? (
            <label className="field">
              <span>Git repository URL</span>
              <input
                type="url"
                placeholder="https://github.com/example/repo.git"
                value={gitUrl}
                onChange={(event) => setGitUrl(event.target.value)}
              />
            </label>
          ) : null}

          {sourceKind === "archive" ? (
            <label className="field">
              <span>Archive file</span>
              <input
                type="file"
                accept=".zip,.tar,.tgz,.tar.gz"
                onChange={(event) => setArchiveFile(event.target.files?.[0] ?? null)}
              />
            </label>
          ) : null}

          {submitError ? <p className="error-text">{submitError}</p> : null}

          <button className="primary-button" type="submit" disabled={createDeploymentMutation.isPending}>
            {createDeploymentMutation.isPending ? "Submitting..." : "Create deployment"}
          </button>
        </form>

        <section className="panel list-panel">
          <div className="panel-header">
            <h2>Deployments</h2>
            <p>Statuses refresh automatically while the pipeline runs.</p>
          </div>

          <div className="deployment-list">
            {deployments.map((deployment: Deployment) => {
              const isSelected = deployment.id === selected?.id;

              return (
                <button
                  key={deployment.id}
                  className={`deployment-card ${isSelected ? "selected" : ""}`}
                  type="button"
                  onClick={() => setSelectedDeploymentId(deployment.id)}
                >
                  <div className="deployment-card-top">
                    <strong>{deployment.slug}</strong>
                    <span className={`status-pill status-${deployment.status}`}>
                      {deployment.status}
                    </span>
                  </div>
                  <p>{deployment.imageTag ?? "Image tag pending"}</p>
                  <small>{deployment.routePath ? `http://localhost:8080${deployment.routePath}` : "Route pending"}</small>
                </button>
              );
            })}

            {deployments.length === 0 ? (
              <div className="empty-state">
                <strong>No deployments yet</strong>
                <p>Create a sample deployment to exercise the Orqforge pipeline.</p>
              </div>
            ) : null}
          </div>
        </section>
      </section>

      <section className="dashboard-grid lower-grid">
        <section className="panel detail-panel">
          <div className="panel-header">
            <h2>Selected deployment</h2>
            <p>Current runtime, route, and source metadata.</p>
          </div>

          {selected ? (
            <dl className="detail-grid">
              <Detail label="Deployment ID" value={selected.id} />
              <Detail label="Source kind" value={selected.sourceKind} />
              <Detail label="Source ref" value={selected.sourceRef} />
              <Detail label="Status" value={selected.status} />
              <Detail label="Stage" value={selected.stage} />
              <Detail label="Image tag" value={selected.imageTag ?? "Pending"} />
              <Detail
                label="Live URL"
                value={
                  selected.routePath ? `http://localhost:8080${selected.routePath}` : "Pending"
                }
              />
              <Detail
                label="Container"
                value={selected.runtimeContainerName ?? "Pending"}
              />
            </dl>
          ) : (
            <div className="empty-state">
              <strong>No deployment selected</strong>
              <p>Choose one from the list to inspect the pipeline state.</p>
            </div>
          )}
        </section>

        <section className="panel log-panel">
          <div className="panel-header">
            <h2>Live logs</h2>
            <p>Backlog is replayed first, then new events stream over SSE.</p>
          </div>

          <div className="log-console">
            {logs.map((entry) => (
              <div key={`${entry.seq}-${entry.createdAt}`} className="log-line">
                <span className={`log-stream log-${entry.stream}`}>{entry.stream}</span>
                <code>{entry.message}</code>
              </div>
            ))}

            {logs.length === 0 ? (
              <div className="empty-state inline-empty">
                <strong>No logs yet</strong>
                <p>Run a deployment to see Orqforge stream pipeline output here.</p>
              </div>
            ) : null}
          </div>
        </section>
      </section>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-item">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
