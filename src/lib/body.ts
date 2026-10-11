import { HttpError } from "./auth";

export async function json(req: Request): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new HttpError(400, "error.invalidData");
    }
    return parsed as Record<string, unknown>;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, "error.invalidData");
  }
}

export function str(
  body: Record<string, unknown>,
  key: string,
  { max = 8000, fallback = "" }: { max?: number; fallback?: string } = {},
): string {
  const v = body[key];
  if (v === undefined || v === null) return fallback;
  if (typeof v !== "string") throw new HttpError(400, "error.fieldText", { key });
  return v.slice(0, max);
}

export function requiredStr(body: Record<string, unknown>, key: string, max = 200): string {
  const v = str(body, key, { max }).trim();
  if (!v) throw new HttpError(400, "error.fieldRequired", { key });
  return v;
}
