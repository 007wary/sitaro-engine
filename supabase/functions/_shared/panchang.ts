// Sitaro engine: daily Panchang for a date and a place.
//
//   Sunrise / sunset  – our own calculation (this Swiss Ephemeris build has no rise/set function):
//                       the moment the Sun's centre is 0.8333° below the horizon (34' refraction + 16' radius),
//                       from the Sun's apparent right ascension/declination and local sidereal time.
//   Tithi             – Moon minus Sun in steps of 12° (30 tithis; Shukla = waxing, Krishna = waning)
//   Nakshatra         – the Moon's nakshatra (27 × 13°20')
//   Yoga              – Sun plus Moon in steps of 13°20' (27 yogas)
//   Karana            – half a tithi (6°): Kimstughna, then Bava…Vishti seven times over, then Shakuni,
//                       Chatushpada, Naga
//   Vara              – the weekday of the date (the Vedic day runs from sunrise to sunrise)
//   Rahu Kaal         – sunrise→sunset split into 8 parts; part by weekday (Sun 8, Mon 2, Tue 7, Wed 5,
//                       Thu 6, Fri 4, Sat 3)
//   Abhijit muhurat   – the 8th of 15 equal parts of the day (around local noon); by tradition none on Wednesday
//
// Tithi, nakshatra, yoga and karana are listed from sunrise until the next sunrise, each with its end time.
// Positions: standard Lahiri (SE_SIDM_LAHIRI) with apparent positions, as used by India's Rashtriya Panchang
// and Drik Panchang. Checked against Drik Panchang (DECISIONS.md): yoga and nakshatra within 1 minute, tithi
// within 1–2 minutes. (The birth chart keeps LAHIRI_1940 with true positions to match Jagannatha Hora; the
// difference is under 1 arc-minute.) Swiss Ephemeris keeps the ayanamsa as global state, so
// calculatePanchang switches it and always switches it back.

import * as swe from "./swisseph/swe.ts";
import { julianDayUt, NAKSHATRAS } from "./engine.ts";
import { localToUtc, offsetMinutesAt } from "./time.ts";

export const TITHIS = [
  "Pratipada", "Dwitiya", "Tritiya", "Chaturthi", "Panchami", "Shashthi", "Saptami", "Ashtami",
  "Navami", "Dashami", "Ekadashi", "Dwadashi", "Trayodashi", "Chaturdashi", "Purnima",
];
export const YOGAS = [
  "Vishkambha", "Priti", "Ayushman", "Saubhagya", "Shobhana", "Atiganda", "Sukarma", "Dhriti", "Shula",
  "Ganda", "Vriddhi", "Dhruva", "Vyaghata", "Harshana", "Vajra", "Siddhi", "Vyatipata", "Variyana",
  "Parigha", "Shiva", "Siddha", "Sadhya", "Shubha", "Shukla", "Brahma", "Indra", "Vaidhriti",
];
const MOVABLE_KARANAS = ["Bava", "Balava", "Kaulava", "Taitila", "Garaja", "Vanija", "Vishti"];
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const RAHU_KAAL_PART = [8, 2, 7, 5, 6, 4, 3]; // Sunday..Saturday, 1-based part of the day

const SUNRISE_ALTITUDE = -0.8333;
const NAK_SPAN = 360 / 27;
const SECOND = 1 / 86400; // in Julian days
const HOUR = 1 / 24;

export interface PanchangInput {
  /** Local date "YYYY-MM-DD" */
  date: string;
  latitude: number;
  longitude: number;
  /** IANA time zone, for example "Asia/Kolkata" */
  timezone: string;
}

export interface Moment {
  /** Local clock time "HH:MM" (rounded to the minute) */
  local: string;
  /** Local date "YYYY-MM-DD" (can be one or two days after the requested date for end times) */
  date: string;
  /** ISO 8601 UTC */
  utc: string;
}

export interface Segment {
  /** Index in the full list (tithi 0–29, nakshatra 0–26, yoga 0–26, karana 0–59) */
  index: number;
  name: string;
  /** When it ends */
  ends: Moment;
}

export interface TithiSegment extends Segment {
  paksha: "Shukla" | "Krishna";
  /** 1–15 within the paksha (15 = Purnima or Amavasya) */
  number: number;
}

export interface PanchangResult {
  date: string;
  place: { latitude: number; longitude: number; timezone: string };
  weekday: { index: number; name: string };
  sunrise: Moment;
  sunset: Moment;
  nextSunrise: Moment;
  tithi: TithiSegment[];
  nakshatra: Segment[];
  yoga: Segment[];
  karana: Segment[];
  rahuKaal: { start: Moment; end: Moment };
  /** null on Wednesday (by tradition) */
  abhijit: { start: Moment; end: Moment } | null;
}

const norm = (x: number) => ((x % 360) + 360) % 360;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const JD_UNIX_EPOCH = 2440587.5;
const jdToMs = (jd: number) => (jd - JD_UNIX_EPOCH) * 86_400_000;

/** Apparent sidereal positions (no SEFLG_TRUEPOS), used while the Panchang ayanamsa is set. */
const PANCHANG_FLAGS = swe.SEFLG_SIDEREAL | swe.SEFLG_MOSEPH;
const sunLon = (jd: number) => swe.swe_calc_ut(jd, swe.SE_SUN, PANCHANG_FLAGS).longitude;
const moonLon = (jd: number) => swe.swe_calc_ut(jd, swe.SE_MOON, PANCHANG_FLAGS).longitude;

/** The Sun's altitude above the horizon in degrees (apparent position, no refraction). */
function sunAltitude(jd: number, latitude: number, longitude: number): number {
  const eq = swe.swe_calc_ut(jd, swe.SE_SUN, swe.SEFLG_MOSEPH | swe.SEFLG_EQUATORIAL);
  const ra = eq.longitude; // right ascension, degrees
  const dec = eq.latitude; // declination, degrees
  const hourAngle = norm(swe.swe_sidtime(jd) * 15 + longitude - ra);
  const sinAlt = Math.sin(rad(latitude)) * Math.sin(rad(dec)) +
    Math.cos(rad(latitude)) * Math.cos(rad(dec)) * Math.cos(rad(hourAngle));
  return deg(Math.asin(sinAlt));
}

/** First time after [fromJd] (within [hours]) when the Sun crosses the rise/set altitude going up or down. */
function findSunCrossing(fromJd: number, latitude: number, longitude: number, rising: boolean, hours = 26): number {
  const f = (jd: number) => sunAltitude(jd, latitude, longitude) - SUNRISE_ALTITUDE;
  const step = 10 / 1440; // 10 minutes
  let a = fromJd;
  let fa = f(a);
  for (let i = 0; i < (hours * 60) / 10; i++) {
    const b = a + step;
    const fb = f(b);
    if (rising ? fa < 0 && fb >= 0 : fa > 0 && fb <= 0) {
      let lo = a, hi = b;
      while (hi - lo > SECOND / 2) {
        const mid = (lo + hi) / 2;
        const fm = f(mid);
        if (rising ? fm < 0 : fm > 0) lo = mid;
        else hi = mid;
      }
      return (lo + hi) / 2;
    }
    a = b;
    fa = fb;
  }
  throw new Error(rising ? "No sunrise found" : "No sunset found");
}

/**
 * Time when an always-increasing angle (like Moon − Sun) has moved on by [delta] degrees after [fromJd].
 * Walks in 1-hour steps (each step moves well under 1°), then halves the last hour down to half a second.
 */
function whenAdvanced(angle: (jd: number) => number, fromJd: number, delta: number): number {
  let moved = 0;
  let a = fromJd;
  let prev = angle(a);
  for (let i = 0; i < 24 * 40; i++) {
    const b = a + HOUR;
    const now = angle(b);
    const stepMove = norm(now - prev);
    if (moved + stepMove >= delta) {
      let lo = a, hi = b;
      const base = angle(a);
      while (hi - lo > SECOND / 2) {
        const mid = (lo + hi) / 2;
        if (moved + norm(angle(mid) - base) < delta) lo = mid;
        else hi = mid;
      }
      return (lo + hi) / 2;
    }
    moved += stepMove;
    a = b;
    prev = now;
  }
  throw new Error("Angle did not advance");
}

/** Segments of a divided circle (span degrees each) from [startJd] until the one running at [endJd]. */
function segments(angle: (jd: number) => number, span: number, startJd: number, endJd: number) {
  const out: { index: number; endJd: number }[] = [];
  let jd = startJd;
  let index = Math.floor(norm(angle(jd)) / span);
  for (let guard = 0; guard < 10; guard++) {
    const toBoundary = norm((index + 1) * span - norm(angle(jd))) || span;
    const end = whenAdvanced(angle, jd, toBoundary);
    out.push({ index, endJd: end });
    if (end > endJd) break;
    jd = end + SECOND;
    index = Math.floor(norm(angle(jd)) / span);
  }
  return out;
}

function karanaName(index: number): string {
  if (index === 0) return "Kimstughna";
  if (index >= 57) return ["Shakuni", "Chatushpada", "Naga"][index - 57];
  return MOVABLE_KARANAS[(index - 1) % 7];
}

export function calculatePanchang(input: PanchangInput): PanchangResult {
  swe.swe_set_sid_mode(swe.SE_SIDM_LAHIRI, 0, 0);
  try {
    return panchangWithStandardLahiri(input);
  } finally {
    swe.swe_set_sid_mode(swe.SE_SIDM_LAHIRI_1940, 0, 0); // back to the birth-chart setting (engine.ts)
  }
}

function panchangWithStandardLahiri(input: PanchangInput): PanchangResult {
  const { date, latitude, longitude, timezone } = input;

  const moment = (jd: number): Moment => {
    const ms = Math.round(jdToMs(jd) / 60_000) * 60_000; // nearest minute
    const offset = offsetMinutesAt(timezone, ms);
    const localIso = new Date(ms + offset * 60_000).toISOString();
    return {
      local: localIso.slice(11, 16),
      date: localIso.slice(0, 10),
      utc: new Date(Math.round(jdToMs(jd) / 1000) * 1000).toISOString(),
    };
  };

  // Sunrise and sunset of the local date, and the next sunrise (the Vedic day ends there)
  const midnightJd = julianDayUt(localToUtc(date, "00:00", timezone).utcMs);
  const sunriseJd = findSunCrossing(midnightJd, latitude, longitude, true, 24);
  const sunsetJd = findSunCrossing(sunriseJd, latitude, longitude, false);
  const nextSunriseJd = findSunCrossing(sunsetJd, latitude, longitude, true);

  const elongation = (jd: number) => norm(moonLon(jd) - sunLon(jd));
  const sum = (jd: number) => norm(moonLon(jd) + sunLon(jd));

  const tithi: TithiSegment[] = segments(elongation, 12, sunriseJd, nextSunriseJd).map((s) => {
    const waxing = s.index < 15;
    const number = (s.index % 15) + 1;
    return {
      index: s.index,
      name: s.index === 29 ? "Amavasya" : TITHIS[s.index % 15],
      paksha: waxing ? "Shukla" : "Krishna",
      number,
      ends: moment(s.endJd),
    };
  });
  const nakshatra: Segment[] = segments(moonLon, NAK_SPAN, sunriseJd, nextSunriseJd)
    .map((s) => ({ index: s.index, name: NAKSHATRAS[s.index], ends: moment(s.endJd) }));
  const yoga: Segment[] = segments(sum, NAK_SPAN, sunriseJd, nextSunriseJd)
    .map((s) => ({ index: s.index, name: YOGAS[s.index], ends: moment(s.endJd) }));
  const karana: Segment[] = segments(elongation, 6, sunriseJd, nextSunriseJd)
    .map((s) => ({ index: s.index, name: karanaName(s.index), ends: moment(s.endJd) }));

  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const dayLength = sunsetJd - sunriseJd;
  const rahuStart = sunriseJd + (RAHU_KAAL_PART[weekday] - 1) * dayLength / 8;
  const muhurta = dayLength / 15;

  return {
    date,
    place: { latitude, longitude, timezone },
    weekday: { index: weekday, name: WEEKDAYS[weekday] },
    sunrise: moment(sunriseJd),
    sunset: moment(sunsetJd),
    nextSunrise: moment(nextSunriseJd),
    tithi,
    nakshatra,
    yoga,
    karana,
    rahuKaal: { start: moment(rahuStart), end: moment(rahuStart + dayLength / 8) },
    abhijit: weekday === 3 ? null : { start: moment(sunriseJd + 7 * muhurta), end: moment(sunriseJd + 8 * muhurta) },
  };
}
