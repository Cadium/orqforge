export const DEPLOYMENT_SOURCE_KINDS = ["git", "archive", "sample"] as const;

export type DeploymentSourceKind = (typeof DEPLOYMENT_SOURCE_KINDS)[number];

export const DEPLOYMENT_STATUSES = [
  "pending",
  "building",
  "deploying",
  "running",
  "failed",
] as const;

export type DeploymentStatus = (typeof DEPLOYMENT_STATUSES)[number];

export const DEPLOYMENT_STAGES = [
  "accepted",
  "materializing_source",
  "building_image",
  "starting_container",
  "configuring_ingress",
  "verifying_route",
  "completed",
  "failed",
] as const;

export type DeploymentStage = (typeof DEPLOYMENT_STAGES)[number];

export const DEPLOYMENT_STAGE_TO_STATUS: Record<
  DeploymentStage,
  DeploymentStatus
> = {
  accepted: "pending",
  materializing_source: "pending",
  building_image: "building",
  starting_container: "deploying",
  configuring_ingress: "deploying",
  verifying_route: "deploying",
  completed: "running",
  failed: "failed",
};

