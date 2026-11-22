// Supabase Edge Function "sky": POST a date, get the planets at 06:00 India time and today's sign changes.
// Used by Sitaro's daily horoscope job.
//
// Request body: { "date": "2026-12-02" }
// Response: the SkyResult JSON described in ../_shared/sky.ts
//
// Stores nothing; there is no personal data in the request.

import { calculateSky } from "../_shared/sky.ts";
import { validateSkyInput } from "../_shared/validate_daily.ts";

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "Use POST with a JSON body." });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Body must be valid JSON." });
  }

  const checked = validateSkyInput(body);
  if (!checked.ok) return json(400, { error: checked.error });

  try {
    return json(200, calculateSky(checked.date));
  } catch (e) {
    console.error("sky calculation failed:", (e as Error).name);
    return json(500, { error: "Sky calculation failed." });
  }
});
