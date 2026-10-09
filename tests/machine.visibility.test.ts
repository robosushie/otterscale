import { describe, expect, it } from "vitest";
import { isEdgeMachine } from "@/lib/machines/edge";
import { machineVisibleToViewer } from "@/lib/machines/visibility";

describe("machineVisibleToViewer", () => {
  it("lets Owner and super admin see every machine", () => {
    expect(
      machineVisibleToViewer(["ws-other"], { isPlatformAdmin: true, workspaceIds: ["ws-mine"] }),
    ).toBe(true);
    expect(machineVisibleToViewer([], { isPlatformAdmin: true, workspaceIds: [] })).toBe(true);
  });

  it("hides other-workspace machines from members", () => {
    expect(
      machineVisibleToViewer(["ws-eng"], { isPlatformAdmin: false, workspaceIds: ["ws-sales"] }),
    ).toBe(false);
  });

  it("shows machines that share a workspace with the member", () => {
    expect(
      machineVisibleToViewer(["ws-eng", "ws-shared"], {
        isPlatformAdmin: false,
        workspaceIds: ["ws-shared"],
      }),
    ).toBe(true);
  });

  it("hides unassigned machines from members", () => {
    expect(machineVisibleToViewer([], { isPlatformAdmin: false, workspaceIds: ["ws-eng"] })).toBe(false);
  });
});

describe("isEdgeMachine", () => {
  it("hides the edge node by name or hostname", () => {
    expect(isEdgeMachine({ name: "edge" })).toBe(true);
    expect(isEdgeMachine({ name: "Edge", hostname: "laptop" })).toBe(true);
    expect(isEdgeMachine({ name: "robosushie", hostname: "edge" })).toBe(true);
  });

  it("hides nodes tagged tag:edge", () => {
    expect(isEdgeMachine({ name: "proxy", tags: ["tag:edge"] })).toBe(true);
    expect(isEdgeMachine({ name: "proxy", tags: ["tag:prod"] })).toBe(false);
  });

  it("keeps ordinary machines visible", () => {
    expect(isEdgeMachine({ name: "robosushie", hostname: "robosushie", tags: ["tag:prod"] })).toBe(false);
  });
});
