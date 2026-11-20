// Checks the request body before any calculation. Returns a clean BirthInput or an error message.

import type { BirthInput } from "./engine.ts";
import { isValidTimeZone } from "./time.ts";

export type ValidationResult = { ok: true; input: BirthInput } | { ok: false; error: string };

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

function isRealDate(date: string): boolean {
  const m = date.match(DATE_RE);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function validateBirthInput(body: unknown): ValidationResult {
  if (typeof body !== "object" || body === null) return { ok: false, error: "Body must be a JSON object." };
  const b = body as Record<string, unknown>;

  if (typeof b.date !== "string" || !isRealDate(b.date)) {
    return { ok: false, error: "date must be a real date in the form YYYY-MM-DD." };
  }
  const year = Number(b.date.slice(0, 4));
  if (year < 1800 || year > 2100) return { ok: false, error: "date must be between 1800 and 2100." };

  if (typeof b.time !== "string" || !TIME_RE.test(b.time)) {
    return { ok: false, error: "time must be HH:MM or HH:MM:SS (24-hour)." };
  }
  if (typeof b.latitude !== "number" || !Number.isFinite(b.latitude) || b.latitude < -90 || b.latitude > 90) {
    return { ok: false, error: "latitude must be a number from -90 to 90." };
  }
  if (Math.abs(b.latitude) > 66) {
    return { ok: false, error: "Births beyond 66° latitude are not supported yet." };
  }
  if (typeof b.longitude !== "number" || !Number.isFinite(b.longitude) || b.longitude < -180 || b.longitude > 180) {
    return { ok: false, error: "longitude must be a number from -180 to 180." };
  }
  if (typeof b.timezone !== "string" || !isValidTimeZone(b.timezone)) {
    return { ok: false, error: "timezone must be an IANA time zone name, for example Asia/Kolkata." };
  }

  let utcOffsetMinutes: number | undefined;
  if (b.utcOffsetMinutes !== undefined && b.utcOffsetMinutes !== null) {
    if (typeof b.utcOffsetMinutes !== "number" || !Number.isFinite(b.utcOffsetMinutes) ||
      b.utcOffsetMinutes < -720 || b.utcOffsetMinutes > 840) {
      return { ok: false, error: "utcOffsetMinutes must be a number from -720 to 840." };
    }
    utcOffsetMinutes = b.utcOffsetMinutes;
  }

  let today: string | undefined;
  if (b.today !== undefined && b.today !== null) {
    if (typeof b.today !== "string" || !isRealDate(b.today)) {
      return { ok: false, error: "today must be a real date in the form YYYY-MM-DD." };
    }
    today = b.today;
  }

  return {
    ok: true,
    input: {
      date: b.date,
      time: b.time,
      latitude: b.latitude,
      longitude: b.longitude,
      timezone: b.timezone,
      utcOffsetMinutes,
      today,
    },
  };
}
