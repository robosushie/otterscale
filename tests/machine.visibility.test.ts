import { describe, expect, it } from "vitest";
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
