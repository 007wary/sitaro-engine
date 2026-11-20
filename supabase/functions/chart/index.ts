// Supabase Edge Function "chart": POST birth details as JSON, get a Vedic birth chart back.
//
// Request body: { "date": "1975-11-05", "time": "22:15", "latitude": 26.1445, "longitude": 91.7362,
//                 "timezone": "Asia/Kolkata", "utcOffsetMinutes"?: 330, "today"?: "2026-11-20" }
// Response: the ChartResult JSON described in ../_shared/engine.ts
//
// Privacy: this function stores nothing and never logs birth details.

import { calculateChart } from "../_shared/engine.ts";
import { validateBirthInput } from "../_shared/validate.ts";

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

  const checked = validateBirthInput(body);
  if (!checked.ok) return json(400, { error: checked.error });

  try {
    return json(200, calculateChart(checked.input));
  } catch (e) {
    // Log only the error type, never the birth details
    console.error("chart calculation failed:", (e as Error).name);
    return json(500, { error: "Chart calculation failed." });
  }
});
