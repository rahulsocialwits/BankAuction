import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canonCity, canonCityInState } from "../src/lib/pipeline/locations";

test("owner decision D15: Vasai is the one label for Vasai Virar; spelling variants go to one name", () => {
  for (const v of ["Vasai Virar", "vasai-virar", "VASAI VIRAR", "Vasai", "Bassein"]) assert.equal(canonCity(v), "Vasai", v);
  assert.equal(canonCity("Nalasopara"), "Nallasopara");
  assert.equal(canonCity("Nala Sopara"), "Nallasopara");
  assert.equal(canonCity("Ambarnath"), "Ambernath");
  assert.equal(canonCity("Dombivali"), "Dombivli");
  assert.equal(canonCity("Mira-Bhayandar"), "Mira Bhayandar");
  assert.equal(canonCity("Mumbai City"), "Mumbai");
  assert.equal(canonCity("Greater Mumbai"), "Mumbai");
  assert.equal(canonCity("Navi Mumbai"), "Navi Mumbai", "a different city");
});

test("Virar and Nallasopara are separate towns: they are not merged into Vasai", () => {
  assert.equal(canonCity("Virar"), "Virar");
  assert.equal(canonCity("Nallasopara"), "Nallasopara");
  assert.equal(canonCity("Navi Mumbai"), "Navi Mumbai");
});

test("Aurangabad becomes Chhatrapati Sambhajinagar ONLY in Maharashtra", () => {
  assert.equal(canonCityInState("Aurangabad", "Maharashtra"), "Chhatrapati Sambhajinagar");
  assert.equal(canonCityInState("aurangabad", " maharashtra "), "Chhatrapati Sambhajinagar");
  assert.equal(canonCityInState("Aurangabad", "Bihar"), "Aurangabad");
  assert.equal(canonCityInState("Aurangabad", null), "Aurangabad");
  assert.equal(canonCityInState("Pune", "Maharashtra"), "Pune");
});

test("the same city name in two states stays two entries in the directory, and the importer / location job use the state-aware name", () => {
  const places = readFileSync("src/lib/queries/places.ts", "utf8");
  assert.match(places, /const key = `\$\{city\}\|\$\{state \?\? ""\}`/);
  assert.match(readFileSync("src/data-sources/feeds/deepScan.ts", "utf8"), /canonCityInState\(city, state\)/);
  assert.match(readFileSync("src/lib/pipeline/geo.ts", "utf8"), /canonCityInState\(city, clean\(a\.state, 40\)\)/);
});

test("the stored-data script is a dry run unless --apply is given, saves a before-snapshot first, and has a rollback", () => {
  const s = readFileSync("scripts/normalize-city-aliases.ts", "utf8");
  assert.match(s, /const apply = process\.argv\.includes\("--apply"\)/);
  assert.ok(s.indexOf("if (!apply) return") < s.indexOf("writeFileSync(file"), "dry run returns before anything is written");
  assert.ok(s.indexOf("writeFileSync(file") < s.indexOf("updateMany"), "snapshot first, then the update");
  assert.match(s, /--rollback=/);
  assert.doesNotMatch(s, /\.(delete|deleteMany)\(/);
});
