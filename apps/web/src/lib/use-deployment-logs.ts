import { useEffect, useState } from "react";

import type { Deployment, DeploymentLogEntry } from "@orqforge/shared";

import { fetchDeploymentLogs } from "./api";

export function useDeploymentLogs(selectedDeployment: Deployment | null) {
  const [logs, setLogs] = useState<DeploymentLogEntry[]>([]);

  const deploymentId = selectedDeployment?.id ?? null;

  useEffect(() => {
    // Clear immediately so no stale logs flash when switching deployments
    setLogs([]);

    if (!deploymentId) return;

    let disposed = false;
    const seen = new Set<number>();

    fetchDeploymentLogs(deploymentId)
      .then((payload) => {
        if (disposed) return;
        setLogs(payload.logs);
        for (const entry of payload.logs) seen.add(entry.seq);
      })
      .catch(() => {
        if (!disposed) setLogs([]);
      });

    const es = new EventSource(`/api/deployments/${deploymentId}/logs/stream`);

    es.addEventListener("log", (raw) => {
      const entry = JSON.parse((raw as MessageEvent).data) as DeploymentLogEntry;
      if (seen.has(entry.seq)) return;
      seen.add(entry.seq);
      setLogs((prev) => [...prev, entry]);
    });

    return () => {
      disposed = true;
      es.close();
    };
  }, [deploymentId]);

  return logs;
}
