import assert from "node:assert/strict";
import { buildFullAccessAddressResultParams, resolveValuationDistrict } from "../src/lib/cadastru-valuation-handoff.js";

const addressResult = {
  cadastral_number: "0100103.109.01.010",
  district: "bOTANICA",
  cadastru_evaluation_token: "test-token",
};
const resultParams = buildFullAccessAddressResultParams(addressResult, { city: "Chișinău" });
assert.equal(resultParams.get("district"), "Botanica");
assert.equal(resultParams.get("cadastral_number"), addressResult.cadastral_number);
assert.equal(resultParams.get("source"), "address");
assert.equal(resultParams.get("cadastru_evaluation"), "test-token");

const numberResult = { cadastral_number: addressResult.cadastral_number, form_fields: { city: "Chișinău" } };
assert.equal(resolveValuationDistrict(numberResult, "Chișinău", resultParams.get("district")), "Botanica",
  "the address district survives the full-access number lookup");
assert.equal(resolveValuationDistrict({ district: "RÂŞCANI" }, "Chișinău"), "Râșcani");
assert.equal(resolveValuationDistrict({ district: "unknown" }, "Chișinău"), null);
assert.equal(buildFullAccessAddressResultParams({ cadastral_number: addressResult.cadastral_number, district: "unknown" }, { city: "Chișinău" }).has("district"), false);

console.log("Full-access Cadastru valuation handoff checks passed.");
