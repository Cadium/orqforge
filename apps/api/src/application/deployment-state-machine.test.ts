import { describe, expect, it } from "vitest";

import {
  deriveStatusFromStage,
  isStageTransitionAllowed,
  transitionStage,
} from "./deployment-state-machine.js";

describe("Orqforge deployment state machine", () => {
  it("allows the expected happy-path stage transitions", () => {
    expect(isStageTransitionAllowed("accepted", "materializing_source")).toBe(true);
    expect(isStageTransitionAllowed("materializing_source", "building_image")).toBe(true);
    expect(isStageTransitionAllowed("building_image", "starting_container")).toBe(true);
    expect(isStageTransitionAllowed("starting_container", "configuring_ingress")).toBe(true);
    expect(isStageTransitionAllowed("configuring_ingress", "verifying_route")).toBe(true);
    expect(isStageTransitionAllowed("verifying_route", "completed")).toBe(true);
    expect(isStageTransitionAllowed("completed", "stopped")).toBe(true);
  });

  it("rejects invalid transitions", () => {
    expect(() => transitionStage("accepted", "completed")).toThrow(
      /Invalid Orqforge deployment stage transition/,
    );
  });

  it("maps internal stages to user-facing statuses", () => {
    expect(deriveStatusFromStage("accepted")).toBe("pending");
    expect(deriveStatusFromStage("building_image")).toBe("building");
    expect(deriveStatusFromStage("verifying_route")).toBe("deploying");
    expect(deriveStatusFromStage("completed")).toBe("running");
    expect(deriveStatusFromStage("stopped")).toBe("stopped");
    expect(deriveStatusFromStage("failed")).toBe("failed");
  });
});
