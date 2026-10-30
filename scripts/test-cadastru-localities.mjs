import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {localities}=require('../src/lib/cadastru-streets/data/localities.json');
const {resolveSupportedCity,resolveSupportedCityFromAddress,resolveSupportedCityFromGeocode}=await import('../../catdai-api/services/cadastru/supported-cities.js');
assert.equal(localities.length,1682);
assert.equal(new Set(localities.map(x=>x.id)).size,1682);
assert.equal(new Set(localities.map(x=>x.city)).size,1682);
for(const row of localities){
 assert.ok(row.ro && row.ru);
 assert.equal(resolveSupportedCity(row.city),row.city);
 assert.equal(resolveSupportedCityFromAddress(`${row.city}, str. Florilor 1`),row.city,row.city);
}
assert.equal(resolveSupportedCity('Кишинев'),'Chișinău');
assert.equal(resolveSupportedCity('Кишинэу'),'Chișinău');
assert.equal(resolveSupportedCity('Ungheni'),'Ungheni');
assert.equal(resolveSupportedCityFromAddress('r-nul Anenii Noi, sat. Varnița, str. Florilor 1'),'Varnița');
assert.equal(resolveSupportedCityFromAddress('mun. Chișinău, sat. Unknown, str. Florilor 1'),null);
assert.equal(resolveSupportedCityFromGeocode({address:{village:'Unknown',city:'Chișinău'}}),null);
// Verify the generated fallback uses the worker's exact parser logic.
for (const name of ['locality-catalogue.js', 'supported-cities.js']) {
 const original = await readFile(new URL('../../catdai-api/services/cadastru/' + name, import.meta.url), 'utf8');
 const expected = name === 'locality-catalogue.js'
  ? original.replace('import { readFileSync } from "node:fs";', 'import catalogue from "./data/localities.json";').replace(/^const catalogue = .*;$/m, '') : original;
 assert.equal(await readFile(new URL('../src/lib/cadastru-streets/' + name, import.meta.url), 'utf8'), expected, name + ' must stay synced');
}
for (const [marker, code] of [['or.', '3401'], ['sat.', '3417']]) {
 assert.equal(resolveSupportedCityFromAddress('r-nul Dondușeni, ' + marker + ' Dondușeni, str. 31 August 1989, 2'), 'Dondușeni (Dondușeni) [' + code + ']');
}
for (const [field, code] of [['town', '3401'], ['village', '3417']]) {
 assert.equal(resolveSupportedCityFromGeocode({address:{[field]:'Dondușeni',county:'Raionul Dondușeni'}}), 'Dondușeni (Dondușeni) [' + code + ']');
}
console.log('Passed: all 1,682 locality identities, bilingual names, settlement types and synced fallback parsers.');
