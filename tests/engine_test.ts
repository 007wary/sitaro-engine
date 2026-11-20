// Tests for the Sitaro engine. Run: deno task test
//
// T4 is compared with Jagannatha Hora 2026.x (Lahiri, mean nodes) for the same input:
// 5 Nov 1975, 22:15:19, +5:30, 91°E44'10", 26°N08'40" (made-up test person).
// T1, T2, T3 and T5 are regression checks against the Phase 0 engine-test output.

import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import { calculateChart } from "../supabase/functions/_shared/engine.ts";
import { localToUtc } from "../supabase/functions/_shared/time.ts";
import { validateBirthInput } from "../supabase/functions/_shared/validate.ts";

/** Arc-seconds from sign index, degrees, minutes, seconds */
const arcsec = (sign: number, d: number, m: number, s: number) => ((sign * 30 + d) * 3600) + m * 60 + s;
const toArcsec = (longitude: number) => longitude * 3600;

const T4 = calculateChart({
  date: "1975-11-05",
  time: "22:15:19",
  latitude: 26 + 8 / 60 + 40 / 3600,
  longitude: 91 + 44 / 60 + 10 / 3600,
  timezone: "Asia/Kolkata",
  today: "2026-11-20",
});

Deno.test("T4 matches Jagannatha Hora within 5 arc-seconds", () => {
  const jh: Record<string, number> = {
    Sun: arcsec(6, 19, 8, 39.80),
    Moon: arcsec(7, 18, 6, 31.63),
    Mars: arcsec(2, 9, 9, 9.00),
    Mercury: arcsec(6, 5, 25, 44.52),
    Jupiter: arcsec(11, 23, 14, 30.16),
    Venus: arcsec(5, 2, 35, 15.02),
    Saturn: arcsec(3, 9, 23, 27.96),
    Rahu: arcsec(6, 28, 44, 27.59),
    Ketu: arcsec(0, 28, 44, 27.59),
  };
  for (const p of T4.planets) {
    assertAlmostEquals(toArcsec(p.longitude), jh[p.planet], 5, `${p.planet} differs from Jagannatha Hora`);
  }
  assertAlmostEquals(toArcsec(T4.lagna.longitude), arcsec(3, 11, 16, 41.78), 5, "Lagna differs");
});

Deno.test("T4 signs, nakshatras, padas, houses and retrograde flags", () => {
  assertEquals([T4.lagna.sign, T4.lagna.nakshatra, T4.lagna.pada], ["Cancer", "Pushya", 3]);
  const expected: Record<string, [string, string, number, number, boolean | null]> = {
    Sun: ["Libra", "Swati", 4, 4, false],
    Moon: ["Scorpio", "Jyeshtha", 1, 5, false],
    Mars: ["Gemini", "Ardra", 1, 12, false],
    Mercury: ["Libra", "Chitra", 4, 4, false],
    Jupiter: ["Pisces", "Revati", 2, 9, true],
    Venus: ["Virgo", "Uttara Phalguni", 2, 3, false],
    Saturn: ["Cancer", "Pushya", 2, 1, false],
    Rahu: ["Libra", "Vishakha", 3, 4, null],
    Ketu: ["Aries", "Krittika", 1, 10, null],
  };
  for (const p of T4.planets) {
    assertEquals([p.sign, p.nakshatra, p.pada, p.house, p.retrograde], expected[p.planet], p.planet);
  }
});

Deno.test("T4 house lords and aspects", () => {
  assertEquals(T4.houses[0], { house: 1, sign: "Cancer", signIndex: 3, lord: "Moon", planets: ["Saturn"] });
  assertEquals(T4.houses[6].lord, "Saturn"); // 7th house Capricorn
  assertEquals(T4.houses[9].lord, "Mars"); // 10th house Aries
  const jupiter = T4.aspects.find((a) => a.planet === "Jupiter")!;
  assertEquals(jupiter.aspectsHouses, [1, 3, 5]); // from the 9th house: 5th, 7th, 9th
  assertEquals(jupiter.aspectsPlanets.sort(), ["Moon", "Saturn", "Venus"]);
  const saturn = T4.aspects.find((a) => a.planet === "Saturn")!;
  assertEquals(saturn.aspectsHouses, [3, 7, 10]);
  assert(!T4.aspects.some((a) => a.planet === "Rahu" || a.planet === "Ketu"));
});

Deno.test("T4 Vimshottari matches Jagannatha Hora dates (same day)", () => {
  // Jagannatha Hora mahadasha starts (local IST dates)
  const jhStarts = [
    ["Mercury", "1974-01-01"], ["Ketu", "1991-01-02"], ["Venus", "1998-01-01"], ["Sun", "2018-01-02"],
    ["Moon", "2024-01-02"], ["Mars", "2034-01-02"], ["Rahu", "2041-01-01"], ["Jupiter", "2059-01-02"],
    ["Saturn", "2075-01-02"],
  ];
  T4.vimshottari.mahadashas.forEach((md, i) => {
    assertEquals(md.lord, jhStarts[i][0]);
    const startMs = Date.parse(md.start);
    const jhMs = Date.parse(`${jhStarts[i][1]}T12:00:00+05:30`);
    assert(Math.abs(startMs - jhMs) < 1.5 * 86_400_000, `${md.lord} start ${md.start} vs ${jhStarts[i][1]}`);
    assertEquals(md.antardashas.length, 9);
    assertEquals(md.antardashas[0].lord, md.lord);
    assertEquals(md.antardashas[0].start, md.start);
    assertEquals(md.antardashas[8].end, md.end);
  });
  assertEquals(T4.vimshottari.birthLord, "Mercury");
  assertEquals(T4.vimshottari.current.mahadasha?.lord, "Moon");
  assertEquals(T4.vimshottari.current.antardasha?.lord, "Rahu");
  assertEquals(T4.vimshottari.current.nextAntardasha?.lord, "Jupiter");
});

Deno.test("Regression: T1, T2, T3, T5 (Phase 0 output, within 3 arc-seconds)", () => {
  const cases = [
    { date: "1880-03-15", time: "06:30", lat: 22.5726, lon: 88.3639, lagna: arcsec(11, 19, 13, 12), moon: arcsec(0, 19, 21, 23) },
    { date: "1925-07-20", time: "14:00", lat: 19.0760, lon: 72.8777, lagna: arcsec(6, 21, 51, 45), moon: arcsec(2, 28, 20, 51) },
    { date: "1943-01-10", time: "09:00", lat: 28.6139, lon: 77.2090, lagna: arcsec(9, 6, 38, 55), moon: arcsec(10, 15, 37, 10) },
    { date: "2003-05-25", time: "04:45", lat: 13.0827, lon: 80.2707, lagna: arcsec(0, 23, 50, 3), moon: arcsec(11, 1, 43, 6) },
  ];
  for (const c of cases) {
    const r = calculateChart({ date: c.date, time: c.time, latitude: c.lat, longitude: c.lon, timezone: "Asia/Kolkata", today: "2026-11-20" });
    assertAlmostEquals(toArcsec(r.lagna.longitude), c.lagna, 3, `${c.date} Lagna`);
    assertAlmostEquals(toArcsec(r.planets[1].longitude), c.moon, 3, `${c.date} Moon`);
  }
});

Deno.test("Time zones: war time, old births and user override", () => {
  assertEquals(localToUtc("1943-01-10", "09:00", "Asia/Kolkata").offsetMinutes, 390); // war time +6:30
  assertEquals(localToUtc("1975-11-05", "22:15", "Asia/Kolkata").offsetMinutes, 330);
  const override = localToUtc("1925-07-20", "14:00", "Asia/Kolkata", 291); // Bombay Time about +4:51
  assertEquals(override.offsetSource, "user-override");
  assertEquals(new Date(override.utcMs).toISOString(), "1925-07-20T09:09:00.000Z");

  const old = calculateChart({ date: "1925-07-20", time: "14:00", latitude: 19.076, longitude: 72.8777, timezone: "Asia/Kolkata" });
  assertEquals(old.birth.needsTimeConfirmation, true);
  assertEquals(T4.birth.needsTimeConfirmation, false);
});

Deno.test("Input validation rejects bad requests", () => {
  const good = { date: "1975-11-05", time: "22:15", latitude: 26.1, longitude: 91.7, timezone: "Asia/Kolkata" };
  assert(validateBirthInput(good).ok);
  assert(!validateBirthInput({ ...good, date: "1975-02-30" }).ok);
  assert(!validateBirthInput({ ...good, time: "25:00" }).ok);
  assert(!validateBirthInput({ ...good, latitude: 95 }).ok);
  assert(!validateBirthInput({ ...good, timezone: "Mars/Olympus" }).ok);
  assert(!validateBirthInput({ ...good, date: "1700-01-01" }).ok);
  assert(!validateBirthInput("hello").ok);
});
