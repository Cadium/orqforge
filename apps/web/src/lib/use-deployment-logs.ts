import { useEffect, useMemo, useState } from "react";

import type { Deployment, DeploymentLogEntry } from "@orqforge/shared";

import { fetchDeploymentLogs } from "./api";

export function useDeploymentLogs(selectedDeployment: Deployment | null) {
  const [logs, setLogs] = useState<DeploymentLogEntry[]>([]);

  const deploymentId = selectedDeployment?.id ?? null;

  useEffect(() => {
    if (!deploymentId) {
      setLogs([]);
      return;
    }

    let disposed = false;
    const seen = new Set<number>();

    fetchDeploymentLogs(deploymentId)
      .then((payload) => {
        if (disposed) {
          return;
        }

        setLogs(payload.logs);
        for (const entry of payload.logs) {
          seen.add(entry.seq);
        }
      })
      .catch(() => {
        if (!disposed) {
          setLogs([]);
        }
      });

    const eventSource = new EventSource(`/api/deployments/${deploymentId}/logs/stream`);

    eventSource.addEventListener("log", (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as DeploymentLogEntry;

      if (seen.has(payload.seq)) {
        return;
      }

      seen.add(payload.seq);
      setLogs((current) => [...current, payload]);
    });

    eventSource.addEventListener("status", () => {
      // deployment status refresh is handled by TanStack Query polling
    });

    return () => {
      disposed = true;
      eventSource.close();
    };
  }, [deploymentId]);

  return useMemo(() => logs, [logs]);
}

