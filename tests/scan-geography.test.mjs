import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { identify, pointerPoint, searchedPlaceLabel, searchPlaces, tileKey } from "../app/scan-geography.ts";

const assets = new URL("../public/world-scan/geo-v1/", import.meta.url);
const read = async name => JSON.parse(await readFile(new URL(name, assets), "utf8"));
const places = await read("places.json");
const meta = await read("manifest.json");

async function lookup(point) {
  const key = tileKey(point);
  return identify(point, places, meta.tile_keys.includes(key) ? await read("tile-" + key + ".json") : []);
}

test("Natural Earth search lands in the expected country and near the named city", async () => {
  for (const [query, country] of [["Karachi", "Pakistan"], ["Tokyo", "Japan"],
    ["London", "United Kingdom"], ["New York", "United States of America"], ["Sydney", "Australia"]]) {
    const [{ place }] = searchPlaces(places, query);
    const context = await lookup([place[5], place[6]]);
    assert.equal(context.country?.[0], country);
    assert.equal(context.city?.[0], place[0]);
    assert.ok(context.distance < 1);
    if (query === "Karachi") assert.equal(context.region?.[0], "Sindh");
  }
});

test("offshore lookup does not inherit a nearby city's country", async () => {
  const coast = await lookup([66.8, 24.6]);
  assert.equal(coast.country, undefined);
  assert.equal(coast.city, undefined);
  assert.equal(coast.marine?.[0], "Arabian Sea");
  const ocean = await lookup([-142, 18]);
  assert.equal(ocean.country, undefined);
  assert.match(ocean.marine?.[0], /Pacific Ocean/);
});

test("small islands, Antarctica, and disputed land use geographic source polygons", async () => {
  const [{ place: island }] = searchPlaces(places, "Nauru");
  assert.equal((await lookup([island[5], island[6]])).country?.[0], "Nauru");
  const [{ place: antarctica }] = searchPlaces(places, "Antarctica");
  assert.equal((await lookup([antarctica[5], antarctica[6]])).country?.[0], "Antarctica");
  const crimea = await lookup([34.1, 45.15]);
  assert.equal(crimea.ambiguous, true);
  assert.equal(crimea.disputed?.[0], "Crimean Peninsula");
  assert.equal(crimea.country, undefined);
});

test("wrapping and zoom share the climate-grid projection", async () => {
  assert.equal(tileKey([180, 25]), tileKey([-180, 25]));
  assert.deepEqual(await lookup([179.99, -17.8]), await lookup([-180.01, -17.8]));
  assert.equal((await lookup([178.40, -18.10])).country?.[0], "Fiji");
  assert.deepEqual(pointerPoint(.25, .5, {x: 175, y: 20, zoom: 4}), [-167.5, 27.5]);
  const [lon, lat] = pointerPoint((67 + 180) / 360, (90 - 25) / 180, {x: 0, y: 0, zoom: 1});
  assert.equal(Math.floor((lon + 180) / 2), 123);
  assert.equal(Math.floor((90 - lat) / 2), 32);
});

test("polygon holes stay unassigned and duplicate polygon parts do not cause ambiguity", () => {
  const country = places.findIndex(place => place[0] === "Pakistan" && place[1] === "country");
  const outer = [[66,24],[68,24],[68,26],[66,26],[66,24]];
  const hole = [[66.9,24.9],[67.1,24.9],[67.1,25.1],[66.9,25.1],[66.9,24.9]];
  assert.equal(identify([67,25], places, [[country,[outer,hole]]]).country, undefined);
  assert.equal(identify([67,25.5], places, [[country,[outer,hole]],[country,[outer]]]).country?.[0], "Pakistan");
});

test("search supports countries, aliases, and region disambiguation", () => {
  assert.equal(searchPlaces(places, "Brazil")[0].place[1], "country");
  assert.equal(searchPlaces(places, "UK")[0].place[0], "United Kingdom");
  assert.ok(searchPlaces(places, "Punjab").some(({place}) => place[1] === "region" && place[2] === "PAK"));
  assert.ok(searchPlaces(places, "Punjab").some(({place}) => place[1] === "region" && place[2] === "IND"));
});

test("Istanbul retains its gazetteer name and matches the refined coast", async () => {
  const [{ place }] = searchPlaces(places, "Istanbul");
  assert.equal(searchedPlaceLabel(place), "Istanbul, Turkey");
  const point = [place[5], place[6]];
  const resolved = await lookup(point);
  assert.equal(resolved.country?.[2], "TUR");
  assert.equal(resolved.city?.[0], "Istanbul");
  assert.equal(identify(point, places, []).country, undefined);
  assert.equal(searchedPlaceLabel(place), "Istanbul, Turkey");
});
