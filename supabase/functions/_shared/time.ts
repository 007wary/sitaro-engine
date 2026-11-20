// Turns a local birth date and clock time into UTC, using the IANA time zone database
// (which includes India's war time, +6:30, from 1941 to 1945).
// If the app sends its own offset (for old births where local times differed, see DECISIONS.md D6),
// that offset is used instead.

export interface UtcResult {
  /** UTC time in milliseconds since 1970 */
  utcMs: number;
  /** Offset used, in minutes east of UTC (IST = 330) */
  offsetMinutes: number;
  offsetSource: "timezone-database" | "user-override";
}

/** Offset (minutes east of UTC) that the time zone database gives for one moment. */
export function offsetMinutesAt(timeZone: string, utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(new Date(utcMs));
  const text = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = text.match(/GMT([+-])(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return 0; // "GMT" alone means +0:00
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3]) + Number(m[4] ?? 0) / 60);
}

/** True if the name is a time zone the database knows (for example "Asia/Kolkata"). */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Local date "YYYY-MM-DD" and time "HH:MM" or "HH:MM:SS" -> UTC.
 * Assumes the inputs were already checked by the caller.
 */
export function localToUtc(
  date: string,
  time: string,
  timeZone: string,
  overrideOffsetMinutes?: number,
): UtcResult {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi, s = 0] = time.split(":").map(Number);
  const asIfUtc = Date.UTC(y, mo - 1, d, h, mi, s);

  if (overrideOffsetMinutes !== undefined) {
    return {
      utcMs: asIfUtc - overrideOffsetMinutes * 60_000,
      offsetMinutes: overrideOffsetMinutes,
      offsetSource: "user-override",
    };
  }

  // Guess with today's offset, then refine twice (handles offset changes such as war time)
  let offset = offsetMinutesAt(timeZone, asIfUtc);
  offset = offsetMinutesAt(timeZone, asIfUtc - offset * 60_000);
  offset = offsetMinutesAt(timeZone, asIfUtc - offset * 60_000);
  return { utcMs: asIfUtc - offset * 60_000, offsetMinutes: offset, offsetSource: "timezone-database" };
}
