import { describe, expect, it } from "vitest";
import { decideCredentialsStep } from "@/lib/actions/result";

describe("decideCredentialsStep", () => {
  it("requires username and password", () => {
    expect(
      decideCredentialsStep({ username: "", password: "x", totpCode: "", needsTotp: false }),
    ).toEqual({ error: "Username and password required." });
  });

  it("returns totpRequired when enrolled and no code", () => {
    expect(
      decideCredentialsStep({
        username: "robosushie",
        password: "secret12",
        totpCode: "",
        needsTotp: true,
      }),
    ).toEqual({ totpRequired: true });
  });

  it("proceeds when TOTP is not needed or a code is present", () => {
    expect(
      decideCredentialsStep({
        username: "robosushie",
        password: "secret12",
        totpCode: "",
        needsTotp: false,
      }),
    ).toEqual({ proceed: true });
    expect(
      decideCredentialsStep({
        username: "robosushie",
        password: "secret12",
        totpCode: "123456",
        needsTotp: true,
      }),
    ).toEqual({ proceed: true });
  });
});
