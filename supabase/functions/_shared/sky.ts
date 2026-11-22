// Sitaro engine: today's sky (transits) for the daily horoscope.
//
// The 9 planets at 06:00 India time on a date (close to sunrise, when the Vedic day starts; one fixed time
// for all of India – planet signs do not depend on the place), plus every planet that moves into another
// sign before 06:00 the next day, found to the minute. Same settings as the birth chart (engine.ts).

import * as swe from "./swisseph/swe.ts";
import { FLAGS, julianDayUt, NAKSHATRAS, SIGNS } from "./engine.ts";

export const SKY_PLANETS = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"] as const;
const IDS: Record<string, number> = {
  Sun: swe.SE_SUN, Moon: swe.SE_MOON, Mars: swe.SE_MARS, Mercury: swe.SE_MERCURY,
  Jupiter: swe.SE_JUPITER, Venus: swe.SE_VENUS, Saturn: swe.SE_SATURN,
};
const NAK_SPAN = 360 / 27;
const IST_MIN = 330;
const DAY_START_MIN = 6 * 60;

export interface SkyPlanet {
  planet: string;
  /** Sidereal longitude 0..360 */
  longitude: number;
  sign: string;
  signIndex: number;
  nakshatra: string;
  /** true = retrograde; null for Rahu and Ketu (they always move backwards) */
  retrograde: boolean | null;
}

export interface SignChange {
  planet: string;
  toSign: string;
  toSignIndex: number;
  /** India time "HH:MM" */
  at: string;
  /** ISO 8601 UTC */
  atUtc: string;
  /** true if it happens after midnight (still before 06:00 the next day) */
  afterMidnight: boolean;
}

export interface SkyResult {
  /** India date "YYYY-MM-DD" */
  date: string;
  /** "06:00" India time */
  time: string;
  planets: SkyPlanet[];
  signChanges: SignChange[];
}

const norm = (x: number) => ((x % 360) + 360) % 360;

/** Sidereal longitude and speed of one of the 9 planets at a Julian day (UT). */
function planetAt(name: string, jd: number): { longitude: number; speed: number } {
  if (name === "Rahu" || name === "Ketu") {
    const r = swe.swe_calc_ut(jd, swe.SE_MEAN_NODE, FLAGS);
    return { longitude: norm(r.longitude + (name === "Ketu" ? 180 : 0)), speed: r.speed_long };
  }
  const r = swe.swe_calc_ut(jd, IDS[name], FLAGS);
  return { longitude: norm(r.longitude), speed: r.speed_long };
}

const signOf = (longitude: number) => Math.floor(norm(longitude) / 30);

/** UTC milliseconds of 06:00 India time on [date] plus [minutes]. */
function utcMsAt(date: string, minutes: number): number {
  return Date.parse(`${date}T00:00:00Z`) + (DAY_START_MIN - IST_MIN + minutes) * 60_000;
}

function istClock(utcMs: number): { date: string; time: string } {
  const iso = new Date(utcMs + IST_MIN * 60_000).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/** The sky at 06:00 India time on [date] ("YYYY-MM-DD"), with sign changes until 06:00 the next day. */
export function calculateSky(date: string): SkyResult {
  const jdAt = (minutes: number) => julianDayUt(utcMsAt(date, minutes));
  const jdStart = jdAt(0);
  const jdEnd = jdAt(1440);

  const planets: SkyPlanet[] = SKY_PLANETS.map((name) => {
    const p = planetAt(name, jdStart);
    const signIndex = signOf(p.longitude);
    return {
      planet: name,
      longitude: p.longitude,
      sign: SIGNS[signIndex],
      signIndex,
      nakshatra: NAKSHATRAS[Math.floor(p.longitude / NAK_SPAN)],
      retrograde: name === "Rahu" || name === "Ketu" ? null : p.speed < 0,
    };
  });

  // The Moon moves 12–15° a day, so it changes sign at most once in 24 hours; the others are much slower.
  const signChanges: SignChange[] = [];
  for (const p of planets) {
    const endSign = signOf(planetAt(p.planet, jdEnd).longitude);
    if (endSign === p.signIndex) continue;
    let lo = 0, hi = 1440; // minutes after 06:00: old sign at lo, new sign at hi
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (signOf(planetAt(p.planet, jdAt(mid)).longitude) === p.signIndex) lo = mid;
      else hi = mid;
    }
    const utcMs = utcMsAt(date, hi);
    const clock = istClock(utcMs);
    signChanges.push({
      planet: p.planet,
      toSign: SIGNS[endSign],
      toSignIndex: endSign,
      at: clock.time,
      atUtc: new Date(utcMs).toISOString(),
      afterMidnight: clock.date !== date,
    });
  }

  return { date, time: "06:00", planets, signChanges };
}
