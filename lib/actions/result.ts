export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; totpRequired?: boolean };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function okVoid(): ActionResult<void> {
  return { ok: true, data: undefined };
}

export function fail(error: string, extras?: { totpRequired?: boolean }): ActionResult<never> {
  return { ok: false, error, ...extras };
}

export function decideCredentialsStep(input: {
  username: string;
  password: string;
  totpCode: string;
  needsTotp: boolean;
}): { totpRequired: true } | { proceed: true } | { error: string } {
  if (!input.username || !input.password) {
    return { error: "Username and password required." };
  }
  if (!input.totpCode && input.needsTotp) {
    return { totpRequired: true };
  }
  return { proceed: true };
}
