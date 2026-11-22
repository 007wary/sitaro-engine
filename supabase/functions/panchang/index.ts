// Supabase Edge Function "panchang": POST a date and a place, get that day's Panchang.
//
// Request body: { "date": "2026-12-10", "latitude": 28.6, "longitude": 77.2, "timezone": "Asia/Kolkata" }
// Response: the PanchangResult JSON described in ../_shared/panchang.ts
//
// Privacy: this function stores nothing and never logs the place.

import { calculatePanchang } from "../_shared/panchang.ts";
import { validatePanchangInput } from "../_shared/validate_daily.ts";

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

  const checked = validatePanchangInput(body);
  if (!checked.ok) return json(400, { error: checked.error });

  try {
    return json(200, calculatePanchang(checked.input));
  } catch (e) {
    // Log only the error type, never the place
    console.error("panchang calculation failed:", (e as Error).name);
    return json(500, { error: "Panchang calculation failed." });
  }
});
