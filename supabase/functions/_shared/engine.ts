// Sitaro astrology engine: calculates a Vedic birth chart.
//
// Settings (chosen to match Jagannatha Hora's defaults, see the README):
//   - Swiss Ephemeris, built-in Moshier ephemeris (no data files)
//   - Lahiri ayanamsa, SE_SIDM_LAHIRI_1940 variant
//   - true geometric planet positions (SEFLG_TRUEPOS)
//   - mean Rahu/Ketu
//   - whole-sign houses, Lagna from the standard ascendant formula
//   - Parashari aspects (graha drishti); Rahu/Ketu aspects not included
//   - Vimshottari dasha with "true sidereal solar years" (a year = the Sun returning to the same sidereal longitude)

import * as swe from "./swisseph/swe.ts";
import { localToUtc } from "./time.ts";

export const ENGINE_VERSION = "1.0.0";

// ---------- Input and output types ----------

export interface BirthInput {
  /** Local date of birth, "YYYY-MM-DD" */
  date: string;
  /** Local clock time of birth, "HH:MM" or "HH:MM:SS" (24-hour) */
  time: string;
  /** North positive, -90..90 */
  latitude: number;
  /** East positive, -180..180 */
  longitude: number;
  /** IANA time zone, for example "Asia/Kolkata" */
  timezone: string;
  /** Optional: offset in minutes east of UTC chosen by the user (old births, DECISIONS.md D6) */
  utcOffsetMinutes?: number;
  /** Optional: the date used for "current dasha", "YYYY-MM-DD". Default: today (UTC). */
  today?: string;
}

export interface Position {
  /** Sidereal longitude 0..360 */
  longitude: number;
  sign: string;
  /** 0 = Aries ... 11 = Pisces */
  signIndex: number;
  /** 0..30 within the sign */
  degreeInSign: number;
  /** For display, for example "11°16'39\"" */
  dms: string;
  nakshatra: string;
  /** 0 = Ashwini ... 26 = Revati */
  nakshatraIndex: number;
  nakshatraLord: string;
  pada: number;
}

export interface PlanetPosition extends Position {
  planet: string;
  /** House 1..12 counted from the Lagna sign (whole-sign houses) */
  house: number;
  /** true if moving backwards; null for Rahu and Ketu (always retrograde by nature) */
  retrograde: boolean | null;
  /** Degrees per day */
  speed: number;
}

export interface House {
  house: number;
  sign: string;
  signIndex: number;
  lord: string;
  planets: string[];
}

export interface Aspect {
  planet: string;
  fromHouse: number;
  aspectsHouses: number[];
  aspectsPlanets: string[];
}

export interface Period {
  lord: string;
  /** ISO 8601 UTC */
  start: string;
  /** ISO 8601 UTC */
  end: string;
}

export interface Mahadasha extends Period {
  antardashas: Period[];
}

export interface ChartResult {
  engine: {
    name: string;
    version: string;
    ephemeris: string;
    ayanamsa: string;
    positions: string;
    nodes: string;
    houses: string;
    aspects: string;
    dasha: string;
  };
  birth: {
    localDate: string;
    localTime: string;
    timezone: string;
    utcOffsetMinutes: number;
    offsetSource: "timezone-database" | "user-override";
    utc: string;
    latitude: number;
    longitude: number;
    /** true for births in India before 1956 when no offset was given: local times differed (D6) */
    needsTimeConfirmation: boolean;
  };
  julianDayUt: number;
  ayanamsaDegrees: number;
  lagna: Position;
  planets: PlanetPosition[];
  houses: House[];
  aspects: Aspect[];
  vimshottari: {
    birthLord: string;
    /** Years of the first mahadasha left at birth */
    balanceYears: number;
    mahadashas: Mahadasha[];
    current: {
      asOf: string;
      mahadasha: Period | null;
      antardasha: Period | null;
      nextAntardasha: Period | null;
    };
  };
}

// ---------- Names ----------

export const SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];
const SIGN_LORDS = [
  "Mars", "Venus", "Mercury", "Moon", "Sun", "Mercury",
  "Venus", "Mars", "Jupiter", "Saturn", "Saturn", "Jupiter",
];
export const NAKSHATRAS = [
  "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra", "Punarvasu", "Pushya", "Ashlesha",
  "Magha", "Purva Phalguni", "Uttara Phalguni", "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha", "Jyeshtha",
  "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana", "Dhanishta", "Shatabhisha", "Purva Bhadrapada",
  "Uttara Bhadrapada", "Revati",
];
/** Vimshottari order, starting from Ashwini's lord. Years add up to 120. */
const DASHA = [
  { lord: "Ketu", years: 7 }, { lord: "Venus", years: 20 }, { lord: "Sun", years: 6 },
  { lord: "Moon", years: 10 }, { lord: "Mars", years: 7 }, { lord: "Rahu", years: 18 },
  { lord: "Jupiter", years: 16 }, { lord: "Saturn", years: 19 }, { lord: "Mercury", years: 17 },
];
const PLANETS = [
  { name: "Sun", id: swe.SE_SUN }, { name: "Moon", id: swe.SE_MOON }, { name: "Mars", id: swe.SE_MARS },
  { name: "Mercury", id: swe.SE_MERCURY }, { name: "Jupiter", id: swe.SE_JUPITER },
  { name: "Venus", id: swe.SE_VENUS }, { name: "Saturn", id: swe.SE_SATURN },
];
/** Extra Parashari aspects besides the 7th, counted from the planet's own house */
const SPECIAL_ASPECTS: Record<string, number[]> = { Mars: [4, 8], Jupiter: [5, 9], Saturn: [3, 10] };

const NAK_SPAN = 360 / 27; // 13°20'
const SIDEREAL_YEAR_DAYS = 365.256363; // only a first guess; the Sun's real position decides
const DAY_MS = 86_400_000;
const JD_UNIX_EPOCH = 2440587.5;

// ---------- Swiss Ephemeris setup ----------

swe.swe_set_sid_mode(swe.SE_SIDM_LAHIRI_1940, 0, 0);
const FLAGS = swe.SEFLG_SIDEREAL | swe.SEFLG_MOSEPH | swe.SEFLG_SPEED | swe.SEFLG_TRUEPOS;

// ---------- Helpers ----------

const norm = (x: number) => ((x % 360) + 360) % 360;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const jdToIso = (jd: number) => new Date(Math.round((jd - JD_UNIX_EPOCH) * DAY_MS)).toISOString();

function dms(longitude: number): string {
  const totalSec = Math.round((norm(longitude) % 30) * 3600);
  const d = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${d}°${String(m).padStart(2, "0")}'${String(s).padStart(2, "0")}"`;
}

function position(longitude: number): Position {
  const lon = norm(longitude);
  const signIndex = Math.floor(lon / 30);
  const nakshatraIndex = Math.floor(lon / NAK_SPAN);
  return {
    longitude: lon,
    sign: SIGNS[signIndex],
    signIndex,
    degreeInSign: lon - signIndex * 30,
    dms: dms(lon),
    nakshatra: NAKSHATRAS[nakshatraIndex],
    nakshatraIndex,
    nakshatraLord: DASHA[nakshatraIndex % 9].lord,
    pada: Math.floor((lon % NAK_SPAN) / (NAK_SPAN / 4)) + 1,
  };
}

function julianDayUt(utcMs: number): number {
  const d = new Date(utcMs);
  const hours = d.getUTCHours() + d.getUTCMinutes() / 60 + (d.getUTCSeconds() + d.getUTCMilliseconds() / 1000) / 3600;
  return swe.swe_julday(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), hours, swe.SE_GREG_CAL);
}

/** True obliquity of the ecliptic (falls back to the mean formula). */
function obliquity(jd: number): number {
  try {
    const r = swe.swe_calc_ut(jd, swe.SE_ECL_NUT, 0);
    if (r && typeof r.longitude === "number" && r.longitude > 20) return r.longitude;
  } catch { /* use fallback */ }
  const T = (jd - 2451545.0) / 36525;
  return 23.4392911 - 0.0130042 * T;
}

/** Sidereal ascendant: Asc = atan2(cos RAMC, -(sin RAMC·cos ε + tan φ·sin ε)), minus ayanamsa. */
function lagnaLongitude(jd: number, lat: number, lon: number): number {
  const ramc = norm(swe.swe_sidtime(jd) * 15 + lon);
  const eps = obliquity(jd);
  const tropical = deg(Math.atan2(
    Math.cos(rad(ramc)),
    -(Math.sin(rad(ramc)) * Math.cos(rad(eps)) + Math.tan(rad(lat)) * Math.sin(rad(eps))),
  ));
  return norm(tropical - swe.swe_get_ayanamsa_ut(jd));
}

const sunLongitude = (jd: number) => swe.swe_calc_ut(jd, swe.SE_SUN, FLAGS).longitude;

/** The moment when `years` dasha-years have passed since birth (negative = before birth). */
function jdAfterYears(birthJd: number, sunAtBirth: number, years: number): number {
  const target = norm(sunAtBirth + (years - Math.floor(years)) * 360);
  let jd = birthJd + years * SIDEREAL_YEAR_DAYS;
  for (let i = 0; i < 6; i++) {
    const diff = ((target - sunLongitude(jd) + 540) % 360) - 180; // shortest way round
    jd += diff / 0.9856; // the Sun moves about 0.9856° per day
  }
  return jd;
}

function vimshottari(moonLongitude: number, birthJd: number, todayJd: number, todayIso: string) {
  const nakIndex = Math.floor(norm(moonLongitude) / NAK_SPAN);
  const startIdx = nakIndex % 9;
  const elapsedFrac = (norm(moonLongitude) % NAK_SPAN) / NAK_SPAN;
  const first = DASHA[startIdx];
  const sunAtBirth = sunLongitude(birthJd);
  const at = (y: number) => jdAfterYears(birthJd, sunAtBirth, y);

  const mahadashas: Mahadasha[] = [];
  let current: { mahadasha: Period | null; antardasha: Period | null; nextAntardasha: Period | null } = {
    mahadasha: null,
    antardasha: null,
    nextAntardasha: null,
  };

  // The first mahadasha really started before birth; count from there. 9 mahadashas = 120 years.
  let y = -elapsedFrac * first.years;
  for (let k = 0; k < 9; k++) {
    const md = DASHA[(startIdx + k) % 9];
    const mdStartJd = at(y);
    const mdEndJd = at(y + md.years);
    const antardashas: Period[] = [];
    let a = y;
    for (let j = 0; j < 9; j++) {
      const ad = DASHA[(startIdx + k + j) % 9];
      const aEnd = a + (md.years * ad.years) / 120;
      antardashas.push({ lord: ad.lord, start: jdToIso(at(a)), end: jdToIso(at(aEnd)) });
      a = aEnd;
    }
    const mdPeriod: Mahadasha = { lord: md.lord, start: jdToIso(mdStartJd), end: jdToIso(mdEndJd), antardashas };
    mahadashas.push(mdPeriod);

    if (current.mahadasha === null && todayJd >= mdStartJd && todayJd < mdEndJd) {
      const idx = antardashas.findIndex((p) => todayIso >= p.start && todayIso < p.end);
      const { antardashas: _omit, ...mdOnly } = mdPeriod;
      current = {
        mahadasha: mdOnly,
        antardasha: idx >= 0 ? antardashas[idx] : null,
        nextAntardasha: idx >= 0 && idx < 8 ? antardashas[idx + 1] : null,
      };
    }
    y += md.years;
  }
  // If the current antardasha is the last one, the next one is the first of the next mahadasha
  if (current.mahadasha && current.antardasha && current.nextAntardasha === null) {
    const mdIdx = mahadashas.findIndex((m) => m.start === current.mahadasha!.start);
    if (mdIdx >= 0 && mdIdx < mahadashas.length - 1) {
      current.nextAntardasha = mahadashas[mdIdx + 1].antardashas[0];
    }
  }

  return {
    birthLord: first.lord,
    balanceYears: (1 - elapsedFrac) * first.years,
    mahadashas,
    current: { asOf: todayIso, ...current },
  };
}

// ---------- Main calculation ----------

export function calculateChart(input: BirthInput): ChartResult {
  const utc = localToUtc(input.date, input.time, input.timezone, input.utcOffsetMinutes);
  const jd = julianDayUt(utc.utcMs);
  const ayanamsa = swe.swe_get_ayanamsa_ut(jd);

  const lagna = position(lagnaLongitude(jd, input.latitude, input.longitude));
  const houseOf = (signIndex: number) => ((signIndex - lagna.signIndex + 12) % 12) + 1;

  const planets: PlanetPosition[] = PLANETS.map((p) => {
    const r = swe.swe_calc_ut(jd, p.id, FLAGS);
    const pos = position(r.longitude);
    return { planet: p.name, ...pos, house: houseOf(pos.signIndex), retrograde: r.speed_long < 0, speed: r.speed_long };
  });
  const rahu = swe.swe_calc_ut(jd, swe.SE_MEAN_NODE, FLAGS);
  for (const [name, lon] of [["Rahu", rahu.longitude], ["Ketu", rahu.longitude + 180]] as const) {
    const pos = position(lon);
    planets.push({ planet: name, ...pos, house: houseOf(pos.signIndex), retrograde: null, speed: rahu.speed_long });
  }

  const houses: House[] = Array.from({ length: 12 }, (_, i) => {
    const signIndex = (lagna.signIndex + i) % 12;
    return {
      house: i + 1,
      sign: SIGNS[signIndex],
      signIndex,
      lord: SIGN_LORDS[signIndex],
      planets: planets.filter((p) => p.house === i + 1).map((p) => p.planet),
    };
  });

  const aspects: Aspect[] = planets
    .filter((p) => p.planet !== "Rahu" && p.planet !== "Ketu")
    .map((p) => {
      const offsets = [7, ...(SPECIAL_ASPECTS[p.planet] ?? [])].sort((a, b) => a - b);
      const aspectsHouses = offsets.map((o) => ((p.house - 1 + o - 1) % 12) + 1);
      const aspectsPlanets = planets
        .filter((q) => q.planet !== p.planet && aspectsHouses.includes(q.house))
        .map((q) => q.planet);
      return { planet: p.planet, fromHouse: p.house, aspectsHouses, aspectsPlanets };
    });

  const todayIso = input.today ? `${input.today}T00:00:00.000Z` : new Date().toISOString();
  const todayJd = julianDayUt(Date.parse(todayIso));
  const moon = planets.find((p) => p.planet === "Moon")!;

  const year = Number(input.date.slice(0, 4));
  const needsTimeConfirmation = input.timezone === "Asia/Kolkata" && year < 1956 &&
    input.utcOffsetMinutes === undefined;

  return {
    engine: {
      name: "sitaro-engine",
      version: ENGINE_VERSION,
      ephemeris: "Swiss Ephemeris (Moshier)",
      ayanamsa: "Lahiri (SE_SIDM_LAHIRI_1940)",
      positions: "true geometric (SEFLG_TRUEPOS)",
      nodes: "mean",
      houses: "whole sign",
      aspects: "Parashari graha drishti (Rahu/Ketu not included)",
      dasha: "Vimshottari, true sidereal solar years",
    },
    birth: {
      localDate: input.date,
      localTime: input.time,
      timezone: input.timezone,
      utcOffsetMinutes: utc.offsetMinutes,
      offsetSource: utc.offsetSource,
      utc: new Date(utc.utcMs).toISOString(),
      latitude: input.latitude,
      longitude: input.longitude,
      needsTimeConfirmation,
    },
    julianDayUt: jd,
    ayanamsaDegrees: ayanamsa,
    lagna,
    planets,
    houses,
    aspects,
    vimshottari: vimshottari(moon.longitude, jd, todayJd, todayIso),
  };
}
