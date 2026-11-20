// Loads Swiss Ephemeris (compiled to WebAssembly) without importing a .wasm file.
//
// Why: Supabase's function bundler cannot import ".wasm" files, so the original package
// (@fusionstrings/swisseph-wasm 0.1.5) fails to deploy. We keep its JavaScript glue code
// unchanged, store the .wasm bytes as base64 text, and connect the two ourselves.
//
// Swiss Ephemeris is © Astrodienst AG, used under the GNU Affero General Public License v3.

import * as glue from "./swisseph_wasm.internal.js";
import { WASM_BASE64 } from "./swisseph_wasm.b64.ts";

export * from "./constants.ts";

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const wasmModule = new WebAssembly.Module(base64ToBytes(WASM_BASE64));
const wasmInstance = new WebAssembly.Instance(wasmModule, {
  // The .wasm file asks for its helper functions under this exact module name
  "./swisseph_wasm.internal.js": glue as unknown as WebAssembly.ModuleImports,
});
glue.__wbg_set_wasm(wasmInstance.exports);
(wasmInstance.exports.__wbindgen_start as () => void)();

/** Result of swe_calc_ut: position (degrees), distance (AU) and their daily speeds. */
export interface CalcResult {
  longitude: number;
  latitude: number;
  distance: number;
  speed_long: number;
  speed_lat: number;
  speed_dist: number;
  rc_flags: number;
}

export const swe_calc_ut = glue.swe_calc_ut as (tjdUt: number, planet: number, flags: number) => CalcResult;
export const swe_julday = glue.swe_julday as (
  year: number,
  month: number,
  day: number,
  hour: number,
  calendar: number,
) => number;
export const swe_set_sid_mode = glue.swe_set_sid_mode as (sidMode: number, t0: number, ayanT0: number) => void;
export const swe_get_ayanamsa_ut = glue.swe_get_ayanamsa_ut as (tjdUt: number) => number;
export const swe_sidtime = glue.swe_sidtime as (tjdUt: number) => number;
