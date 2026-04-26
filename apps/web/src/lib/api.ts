import type { Deployment, DeploymentLogEntry } from "@orqforge/shared";

export async function createDeployment(input: {
  appName?: string;
  sourceKind: "git" | "archive" | "sample";
  sourceRef: string;
}) {
  const response = await fetch("/api/deployments", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return (await response.json()) as { deployment: Deployment };
}

export async function fetchDeployment(id: string) {
  const response = await fetch(`/api/deployments/${id}`);

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return (await response.json()) as { deployment: Deployment };
}

export async function fetchDeployments() {
  const response = await fetch("/api/deployments");

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return (await response.json()) as { deployments: Deployment[] };
}

export async function fetchDeploymentLogs(id: string) {
  const response = await fetch(`/api/deployments/${id}/logs`);

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return (await response.json()) as { logs: DeploymentLogEntry[] };
}

export async function uploadArchive(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/uploads", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return (await response.json()) as {
    upload: {
      path: string;
      fileName: string;
    };
  };
}

async function readError(response: Response) {
  try {
    const payload = (await response.json()) as { message?: string };
    return payload.message ?? `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
  }
}
