// Tests for the daily functions "sky" and "panchang". Run: deno task test
//
// Panchang reference: Drik Panchang day pages (fetched 2026-11-22) for New Delhi, Guwahati and Mumbai.
// Our times must be within 2 minutes (sunrise/sunset, Rahu Kaal, Abhijit, nakshatra and yoga are mostly
// within 1 minute; tithi and karana come out about 1.5 minutes later than Drik).

import { assert, assertEquals } from "jsr:@std/assert@1";
import { calculatePanchang } from "../supabase/functions/_shared/panchang.ts";
import { calculateSky } from "../supabase/functions/_shared/sky.ts";
import { calculateChart } from "../supabase/functions/_shared/engine.ts";
import { validatePanchangInput, validateSkyInput } from "../supabase/functions/_shared/validate_daily.ts";

const PLACES = {
  Delhi: { latitude: 28.6139, longitude: 77.209 },
  Guwahati: { latitude: 26.1445, longitude: 91.7362 },
  Mumbai: { latitude: 19.076, longitude: 72.8777 },
};
const panchang = (date: string, city: keyof typeof PLACES) =>
  calculatePanchang({ date, ...PLACES[city], timezone: "Asia/Kolkata" });

/** Minutes between our moment (UTC ISO) and a Drik "HH:MM" India time on the same India date. */
function minutesOff(utc: string, drikHHMM: string): number {
  const ours = (Date.parse(utc) / 60_000 + 330) % 1440;
  const [h, m] = drikHHMM.split(":").map(Number);
  let diff = ours - (h * 60 + m);
  if (diff > 720) diff -= 1440;
  if (diff < -720) diff += 1440;
  return Math.abs(diff);
}
function near(utc: string, drik: string, label: string, max = 2) {
  const off = minutesOff(utc, drik);
  assert(off <= max, `${label}: ${off.toFixed(1)} min from Drik Panchang (${drik})`);
}

// ---------- Panchang vs Drik Panchang ----------
Deno.test("Panchang Delhi 25 Nov 2026 matches Drik Panchang", () => {
  const p = panchang("2026-11-25", "Delhi");
  assertEquals(p.weekday.name, "Wednesday");
  near(p.sunrise.utc, "06:52", "sunrise");
  near(p.sunset.utc, "17:24", "sunset");
  assertEquals([p.tithi[0].paksha, p.tithi[0].name, p.tithi[1].name], ["Krishna", "Pratipada", "Dwitiya"]);
  near(p.tithi[0].ends.utc, "16:50", "tithi");
  assertEquals([p.nakshatra[0].name, p.nakshatra[1].name], ["Rohini", "Mrigashira"]);
  near(p.nakshatra[0].ends.utc, "20:36", "nakshatra");
  assertEquals([p.yoga[0].name, p.yoga[1].name], ["Shiva", "Siddha"]);
  near(p.yoga[0].ends.utc, "12:00", "yoga");
  assertEquals(p.karana.map((k) => k.name), ["Kaulava", "Taitila", "Garaja"]);
  near(p.karana[0].ends.utc, "16:50", "karana 1");
  near(p.karana[1].ends.utc, "03:02", "karana 2");
  near(p.rahuKaal.start.utc, "12:08", "Rahu Kaal start");
  near(p.rahuKaal.end.utc, "13:27", "Rahu Kaal end");
  assertEquals(p.abhijit, null); // Wednesday
});

Deno.test("Panchang Delhi 2 Dec 2026 matches Drik Panchang", () => {
  const p = panchang("2026-12-02", "Delhi");
  near(p.sunrise.utc, "06:57", "sunrise");
  near(p.sunset.utc, "17:24", "sunset");
  assertEquals([p.tithi[0].name, p.tithi[1].name], ["Navami", "Dashami"]);
  near(p.tithi[0].ends.utc, "22:51", "tithi");
  assertEquals(p.nakshatra[0].name, "Purva Phalguni");
  near(p.nakshatra[0].ends.utc, "08:55", "nakshatra");
  assertEquals(p.yoga[0].name, "Vishkambha");
  near(p.yoga[0].ends.utc, "10:32", "yoga");
  assertEquals(p.karana.map((k) => k.name), ["Taitila", "Garaja", "Vanija"]);
  near(p.karana[0].ends.utc, "10:58", "karana 1");
  near(p.karana[1].ends.utc, "22:51", "karana 2");
  near(p.rahuKaal.start.utc, "12:10", "Rahu Kaal start");
  near(p.rahuKaal.end.utc, "13:29", "Rahu Kaal end");
});

Deno.test("Panchang 10 Dec 2026 (Thursday) matches Drik Panchang in Delhi, Guwahati and Mumbai", () => {
  const drik = {
    Delhi: { rise: "07:03", set: "17:25", rahu: ["13:32", "14:49"], abhijit: ["11:53", "12:35"] },
    Guwahati: { rise: "06:00", set: "16:32", rahu: ["12:35", "13:54"], abhijit: ["10:55", "11:37"] },
    Mumbai: { rise: "07:01", set: "18:02", rahu: ["13:54", "15:16"], abhijit: ["12:09", "12:53"] },
  };
  for (const city of ["Delhi", "Guwahati", "Mumbai"] as const) {
    const p = panchang("2026-12-10", city);
    const d = drik[city];
    assertEquals(p.weekday.name, "Thursday");
    near(p.sunrise.utc, d.rise, `${city} sunrise`);
    near(p.sunset.utc, d.set, `${city} sunset`);
    near(p.rahuKaal.start.utc, d.rahu[0], `${city} Rahu Kaal start`);
    near(p.rahuKaal.end.utc, d.rahu[1], `${city} Rahu Kaal end`);
    near(p.abhijit!.start.utc, d.abhijit[0], `${city} Abhijit start`);
    near(p.abhijit!.end.utc, d.abhijit[1], `${city} Abhijit end`);
    // These do not depend on the place
    assertEquals([p.tithi[0].paksha, p.tithi[0].name], ["Shukla", "Pratipada"]);
    near(p.tithi[0].ends.utc, "08:45", `${city} tithi`);
    assertEquals(p.nakshatra[0].name, "Mula");
    near(p.nakshatra[0].ends.utc, "23:58", `${city} nakshatra`);
    assertEquals(p.yoga[0].name, "Shula");
    near(p.yoga[0].ends.utc, "09:24", `${city} yoga`);
    assertEquals(p.karana.map((k) => k.name), ["Bava", "Balava", "Kaulava"]);
    near(p.karana[1].ends.utc, "22:03", `${city} karana 2`);
  }
});

Deno.test("Panchang: end times carry their own date; segments run in order up to the next sunrise", () => {
  const p = panchang("2026-12-10", "Delhi");
  assertEquals(p.nakshatra[1].name, "Purva Ashadha");
  assertEquals(p.nakshatra[1].ends.date, "2026-12-12"); // ends two days later
  for (const list of [p.tithi, p.nakshatra, p.yoga, p.karana]) {
    for (let i = 1; i < list.length; i++) assert(list[i].ends.utc > list[i - 1].ends.utc);
    assert(list[list.length - 1].ends.utc >= p.nextSunrise.utc);
    if (list.length > 1) assert(list[list.length - 2].ends.utc < p.nextSunrise.utc);
  }
  assert(p.sunrise.utc < p.sunset.utc && p.sunset.utc < p.nextSunrise.utc);
});

Deno.test("Panchang leaves the birth-chart ayanamsa unchanged (T4 still matches Jagannatha Hora)", () => {
  panchang("2026-12-10", "Delhi");
  const t4 = calculateChart({
    date: "1975-11-05", time: "22:15:19", latitude: 26 + 8 / 60 + 40 / 3600, longitude: 91 + 44 / 60 + 10 / 3600,
    timezone: "Asia/Kolkata", today: "2026-11-20",
  });
  const moon = t4.planets.find((p) => p.planet === "Moon")!;
  const jhMoon = (7 * 30 + 18) * 3600 + 6 * 60 + 31.63;
  assert(Math.abs(moon.longitude * 3600 - jhMoon) < 5, "Moon moved: the ayanamsa was not switched back");
});

// ---------- Sky ----------
Deno.test("Sky 2 Dec 2026: Moon into Virgo at 14:58, Mercury into Scorpio at 17:03, Saturn retrograde", () => {
  const s = calculateSky("2026-12-02");
  assertEquals(s.planets.map((p) => p.planet), ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"]);
  assertEquals(s.planets.find((p) => p.planet === "Moon")!.sign, "Leo");
  assertEquals(s.planets.find((p) => p.planet === "Saturn")!.retrograde, true);
  assertEquals(s.planets.find((p) => p.planet === "Rahu")!.retrograde, null);
  assertEquals(s.signChanges.map((c) => `${c.planet}>${c.toSign}@${c.at}`), ["Moon>Virgo@14:58", "Mercury>Scorpio@17:03"]);
});

Deno.test("Sky 5 Dec 2026: Rahu and Ketu change sign after midnight", () => {
  const s = calculateSky("2026-12-05");
  const rahu = s.signChanges.find((c) => c.planet === "Rahu")!;
  assertEquals([rahu.toSign, rahu.afterMidnight], ["Capricorn", true]);
  const sky = calculateSky("2026-11-25");
  assertEquals(sky.signChanges.length, 0);
});

// ---------- Input checks ----------
Deno.test("Daily input checks", () => {
  assert(validateSkyInput({ date: "2026-12-02" }).ok);
  assert(!validateSkyInput({ date: "2026-02-30" }).ok);
  assert(!validateSkyInput({}).ok);
  const ok = { date: "2026-12-10", latitude: 28.6, longitude: 77.2, timezone: "Asia/Kolkata" };
  assert(validatePanchangInput(ok).ok);
  assert(!validatePanchangInput({ ...ok, latitude: 70 }).ok);
  assert(!validatePanchangInput({ ...ok, longitude: "77" }).ok);
  assert(!validatePanchangInput({ ...ok, timezone: "India/Delhi" }).ok);
});
