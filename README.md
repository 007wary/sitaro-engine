# sitaro-engine

[![Tests](https://github.com/007wary/sitaro-engine/actions/workflows/test.yml/badge.svg)](https://github.com/007wary/sitaro-engine/actions/workflows/test.yml)

The open-source astrology calculation engine behind **Sitaro: AI Kundli & Astrology** (Android, by Wary Dev).
It runs as Supabase Edge Functions: `chart` turns birth details into a Vedic (sidereal) birth chart, `sky` gives the day's planet positions for the daily horoscope, and `panchang` gives the day's Panchang for a place.

This repository is public because it uses the [Swiss Ephemeris](https://www.astro.com/swisseph/), which is licensed under the GNU Affero General Public License v3. The engine is published under the same licence (see `LICENSE`). The Sitaro app itself, its AI prompts and its other server functions are separate programs that only call this engine over the network.

## What it calculates

| Item | Method |
|---|---|
| Planet positions | Swiss Ephemeris, built-in Moshier ephemeris, true geometric positions |
| Ayanamsa | Lahiri (`SE_SIDM_LAHIRI_1940`) |
| Rahu / Ketu | Mean nodes |
| Lagna (ascendant) | Standard formula from local sidereal time and true obliquity |
| Houses | Whole-sign houses, with house lords |
| Nakshatra | Nakshatra, pada and nakshatra lord for the Lagna and every planet |
| Aspects | Parashari graha drishti (7th for all; Mars 4/8, Jupiter 5/9, Saturn 3/10). Rahu/Ketu aspects not included. |
| Dasha | Vimshottari: all 9 mahadashas with antardashas, using true sidereal solar years; current and next period |
| Time zones | IANA time zone database (includes India's 1941–45 war time). For births in India before 1956 the result is flagged `needsTimeConfirmation`, and the caller may send its own `utcOffsetMinutes`. |

These settings were chosen to match the free reference software Jagannatha Hora. On the test chart in `tests/` every planet and the Lagna agree within 5 arc-seconds, and the dasha dates fall on the same day.

## Request and response

`POST /functions/v1/chart` with a JSON body:

```json
{
  "date": "1975-11-05",
  "time": "22:15:19",
  "latitude": 26.1444,
  "longitude": 91.7361,
  "timezone": "Asia/Kolkata",
  "utcOffsetMinutes": 330,
  "today": "2026-11-20"
}
```

`utcOffsetMinutes` and `today` are optional. The response is described by `ChartResult` in `supabase/functions/_shared/engine.ts`.

The function stores nothing and never logs birth details.

## Daily functions

### `sky`

`POST /functions/v1/sky` with `{ "date": "2026-12-02" }` returns the 9 planets (sidereal sign, nakshatra, retrograde) at **06:00 India time** on that date, and every planet that moves into another sign before 06:00 the next day, to the minute. Same settings as `chart`. Described by `SkyResult` in `supabase/functions/_shared/sky.ts`.

### `panchang`

`POST /functions/v1/panchang` with `{ "date": "2026-12-10", "latitude": 28.61, "longitude": 77.21, "timezone": "Asia/Kolkata" }` returns:

| Item | Method |
|---|---|
| Sunrise, sunset, next sunrise | Own calculation (this Swiss Ephemeris build has no rise/set function): the Sun's centre 0.8333° below the horizon, from its apparent right ascension and declination and local sidereal time |
| Tithi (with paksha) | Moon − Sun in 12° steps |
| Nakshatra | The Moon's nakshatra |
| Yoga | Sun + Moon in 13°20' steps |
| Karana | Half tithis (Kimstughna, Bava…Vishti ×8, Shakuni, Chatushpada, Naga) |
| Vara | Weekday of the date |
| Rahu Kaal | Daytime split into 8 parts, part by weekday |
| Abhijit muhurat | 8th of 15 parts of the daytime; none on Wednesday (tradition) |

Tithi, nakshatra, yoga and karana are listed from sunrise to the next sunrise, each with its end time (local time, its own date, and UTC). The Panchang uses standard Lahiri (`SE_SIDM_LAHIRI`) with apparent positions, as India's Rashtriya Panchang and Drik Panchang do; `chart` keeps `SE_SIDM_LAHIRI_1940` with true positions to match Jagannatha Hora. Compared with Drik Panchang for three dates and three cities (`tests/daily_test.ts`), every time is within 2 minutes (most within 1). Described by `PanchangResult` in `supabase/functions/_shared/panchang.ts`. Places beyond 60° latitude are not supported.

Neither function stores anything or logs the request.

## Run the tests

Requires [Deno](https://deno.com/):

```
deno task test
```

## How Swiss Ephemeris is loaded

The WebAssembly build comes from [`@fusionstrings/swisseph-wasm`](https://jsr.io/@fusionstrings/swisseph-wasm) 0.1.5. Supabase's bundler cannot import `.wasm` files, so the original `.wasm` is stored as base64 text in `supabase/functions/_shared/swisseph/swisseph_wasm.b64.ts` (its SHA-256 is recorded there) and loaded by `swe.ts`. The package's generated glue code (`swisseph_wasm.internal.js`) and constants are included unchanged.

## Licence

GNU Affero General Public License v3.0 – see `LICENSE`.
Swiss Ephemeris © Astrodienst AG. `@fusionstrings/swisseph-wasm` © its authors.
