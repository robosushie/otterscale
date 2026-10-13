export const PASSWORD_MIN_LENGTH = 8;

export type ActionResult<T = void> =
  | { ok: true; data: T; totpRequired?: false }
  | { ok: false; error: string; totpRequired?: boolean };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(error: string, totpRequired = false): ActionResult<never> {
  return { ok: false, error, totpRequired };
}

export async function asResult<T>(run: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return ok(await run());
  } catch (error) {
    const failed = error as Error & { totpRequired?: boolean };
    return fail(failed.message || "Request failed", Boolean(failed.totpRequired));
  }
}
