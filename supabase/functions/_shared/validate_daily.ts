// Checks the request bodies of the "sky" and "panchang" functions before any calculation.

import type { PanchangInput } from "./panchang.ts";
import { isValidTimeZone } from "./time.ts";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function dateError(date: unknown): string | null {
  if (typeof date !== "string") return "date must be a real date in the form YYYY-MM-DD.";
  const m = date.match(DATE_RE);
  if (!m) return "date must be a real date in the form YYYY-MM-DD.";
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    return "date must be a real date in the form YYYY-MM-DD.";
  }
  if (y < 1900 || y > 2100) return "date must be between 1900 and 2100.";
  return null;
}

export type SkyValidation = { ok: true; date: string } | { ok: false; error: string };

export function validateSkyInput(body: unknown): SkyValidation {
  if (typeof body !== "object" || body === null) return { ok: false, error: "Body must be a JSON object." };
  const b = body as Record<string, unknown>;
  const err = dateError(b.date);
  return err ? { ok: false, error: err } : { ok: true, date: b.date as string };
}

export type PanchangValidation = { ok: true; input: PanchangInput } | { ok: false; error: string };

export function validatePanchangInput(body: unknown): PanchangValidation {
  if (typeof body !== "object" || body === null) return { ok: false, error: "Body must be a JSON object." };
  const b = body as Record<string, unknown>;
  const err = dateError(b.date);
  if (err) return { ok: false, error: err };
  if (typeof b.latitude !== "number" || !Number.isFinite(b.latitude) || b.latitude < -90 || b.latitude > 90) {
    return { ok: false, error: "latitude must be a number from -90 to 90." };
  }
  // Beyond about 66° the Sun may not rise or set on some days
  if (Math.abs(b.latitude) > 60) return { ok: false, error: "Places beyond 60° latitude are not supported." };
  if (typeof b.longitude !== "number" || !Number.isFinite(b.longitude) || b.longitude < -180 || b.longitude > 180) {
    return { ok: false, error: "longitude must be a number from -180 to 180." };
  }
  if (typeof b.timezone !== "string" || !isValidTimeZone(b.timezone)) {
    return { ok: false, error: "timezone must be an IANA time zone name, for example Asia/Kolkata." };
  }
  return {
    ok: true,
    input: { date: b.date as string, latitude: b.latitude, longitude: b.longitude, timezone: b.timezone },
  };
}
