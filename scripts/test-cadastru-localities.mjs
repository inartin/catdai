import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
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
console.log('Passed: all 1,682 locality identities, bilingual names, defaults and exact settlement checks.');
