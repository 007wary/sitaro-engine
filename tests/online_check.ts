// Calls the deployed "chart" function with test chart T4 and compares it with Jagannatha Hora.
// Run: deno run --allow-net=jxbnxuzwmnwprijaezcc.supabase.co tests/online_check.ts <public-anon-key>
// (The anon key is a public key that ships inside apps; it is not a secret.)

const URL_ = "https://jxbnxuzwmnwprijaezcc.supabase.co/functions/v1/chart";
const key = Deno.args[0];
if (!key) throw new Error("Pass the public anon key as the first argument.");

const body = {
  date: "1975-11-05",
  time: "22:15:19",
  latitude: 26 + 8 / 60 + 40 / 3600,
  longitude: 91 + 44 / 60 + 10 / 3600,
  timezone: "Asia/Kolkata",
  today: "2026-11-20",
};

const jh: Record<string, string> = {
  Lagna: "Cancer 11°16'41.78\"", Sun: "Libra 19°08'39.80\"", Moon: "Scorpio 18°06'31.63\"",
  Mars: "Gemini 9°09'09.00\"", Mercury: "Libra 5°25'44.52\"", Jupiter: "Pisces 23°14'30.16\"",
  Venus: "Virgo 2°35'15.02\"", Saturn: "Cancer 9°23'27.96\"", Rahu: "Libra 28°44'27.59\"", Ketu: "Aries 28°44'27.59\"",
};

async function call(payload: unknown) {
  const t0 = performance.now();
  const res = await fetch(URL_, {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "apikey": key, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { status: res.status, ms: Math.round(performance.now() - t0), json: await res.json() };
}

const first = await call(body); // may include a cold start
const second = await call(body); // warm
console.log(`HTTP ${first.status}; first call ${first.ms} ms (cold start), second call ${second.ms} ms`);
if (first.status !== 200) {
  console.log(JSON.stringify(first.json));
  Deno.exit(1);
}
const r = first.json;
console.log(`Engine ${r.engine.version}; UTC ${r.birth.utc}; offset ${r.birth.utcOffsetMinutes} min`);
console.log("Body       Online engine                      Jagannatha Hora");
console.log(`Lagna      ${(r.lagna.sign + " " + r.lagna.dms).padEnd(34)} ${jh.Lagna}`);
for (const p of r.planets) {
  console.log(`${p.planet.padEnd(10)} ${(p.sign + " " + p.dms + " H" + p.house + (p.retrograde ? " R" : "")).padEnd(34)} ${jh[p.planet]}`);
}
console.log("Mahadashas: " + r.vimshottari.mahadashas.map((m: { lord: string; start: string }) => `${m.lord} ${m.start.slice(0, 10)}`).join(", "));
const c = r.vimshottari.current;
console.log(`Current: ${c.mahadasha.lord} / ${c.antardasha.lord} (until ${c.antardasha.end.slice(0, 10)}), next ${c.nextAntardasha.lord}`);

const bad = await call({ ...body, date: "1975-02-30" });
console.log(`Bad input check: HTTP ${bad.status} – ${bad.json.error}`);
