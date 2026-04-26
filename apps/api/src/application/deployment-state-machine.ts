import {
  DEPLOYMENT_STAGE_TO_STATUS,
  type DeploymentStage,
  type DeploymentStatus,
} from "@orqforge/shared";

const ALLOWED_STAGE_TRANSITIONS: Record<DeploymentStage, DeploymentStage[]> = {
  accepted: ["materializing_source", "failed"],
  materializing_source: ["building_image", "failed"],
  building_image: ["starting_container", "failed"],
  starting_container: ["configuring_ingress", "failed"],
  configuring_ingress: ["verifying_route", "failed"],
  verifying_route: ["completed", "failed"],
  completed: ["stopped"],
  stopped: [],
  failed: [],
};

export function isStageTransitionAllowed(
  currentStage: DeploymentStage,
  nextStage: DeploymentStage,
) {
  return ALLOWED_STAGE_TRANSITIONS[currentStage].includes(nextStage);
}

export function transitionStage(
  currentStage: DeploymentStage,
  nextStage: DeploymentStage,
): DeploymentStage {
  if (!isStageTransitionAllowed(currentStage, nextStage)) {
    throw new Error(
      `Invalid Orqforge deployment stage transition: ${currentStage} -> ${nextStage}`,
    );
  }

  return nextStage;
}

export function deriveStatusFromStage(stage: DeploymentStage): DeploymentStatus {
  return DEPLOYMENT_STAGE_TO_STATUS[stage];
}
