import { describe, expect, it } from "vitest";
import { formatHeadscaleError, HeadscaleError, preauthKeyExpiration } from "@/lib/headscale/client";
import { parseAuthKeyExpiry } from "@/lib/headscale/expiry";

describe("formatHeadscaleError", () => {
  it("includes status and body", () => {
    expect(formatHeadscaleError(new HeadscaleError("Failed to list nodes", 401, "Unauthorized"))).toBe(
      "Failed to list nodes (401: Unauthorized)",
    );
  });

  it("surfaces Headscale 0.23 unknown-key responses (HTTP 500 + Unauthorized)", () => {
    expect(formatHeadscaleError(new HeadscaleError("Failed to list nodes", 500, "Unauthorized"))).toBe(
      "Failed to list nodes (500: Unauthorized)",
    );
  });

  it("omits empty body", () => {
    expect(formatHeadscaleError(new HeadscaleError("Failed to create preauth key", 500))).toBe(
      "Failed to create preauth key (500)",
    );
  });

  it("falls back for generic errors", () => {
    expect(formatHeadscaleError(new Error("offline"))).toBe("offline");
    expect(formatHeadscaleError("x")).toBe("Failed to reach Headscale");
  });
});

describe("preauthKeyExpiration", () => {
  it("is exactly 24 hours after the given instant", () => {
    expect(preauthKeyExpiration(new Date("2026-10-08T17:00:00.000Z"))).toBe("2026-10-09T17:00:00.000Z");
  });
});

describe("parseAuthKeyExpiry", () => {
  const from = new Date("2026-10-08T17:00:00.000Z");

  it("maps 24 hours and 7d from a fixed instant", () => {
    expect(parseAuthKeyExpiry("24 hours", from)?.toISOString()).toBe("2026-10-09T17:00:00.000Z");
    expect(parseAuthKeyExpiry("7d", from)?.toISOString()).toBe("2026-10-15T17:00:00.000Z");
  });

  it("defaults empty input to 24 hours", () => {
    expect(parseAuthKeyExpiry("", from)?.toISOString()).toBe("2026-10-09T17:00:00.000Z");
  });

  it("rejects invalid values", () => {
    expect(parseAuthKeyExpiry("nope", from)).toBeNull();
  });
});
