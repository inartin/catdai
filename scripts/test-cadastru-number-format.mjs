// Shared client/server format checks; no server, database or network.
// pnpm exec node scripts/test-cadastru-number-format.mjs
import assert from "node:assert/strict";
import { CADASTRAL_RE, validateCadastralNumber } from "../src/lib/validation.js";

for (const [input, expected] of [
  ["1014203418", "1014203.418"],
  [" 1014203418 ", "1014203.418"],
  ["10142030418", "1014203.0418"],
  ["01001017", "0100101.7"],
  ["010010142", "0100101.42"],
  ["01001011234", "0100101.1234"],
  ["1014203.418", "1014203.418"],
  ["0100101.7", "0100101.7"],
  ["0100101.42", "0100101.42"],
  ["0100101.1234", "0100101.1234"],
  ["0100201.999.01.0101", "0100201.999.01.0101"],
  ["4301211156.01.030", "4301211156.01.030"],
]) {
  assert(CADASTRAL_RE.test(input.trim()), input);
  assert.deepEqual(validateCadastralNumber(input), { valid: true, value: expected });
}
for (const input of ["1014203", "101420341812", "1014203 418", "1014203abc", "1014203.418.01", "1014203..418"]) {
  assert.equal(CADASTRAL_RE.test(input), false, input);
  assert.deepEqual(validateCadastralNumber(input), { valid: false, reason: "invalid_format" });
}
for (const input of [null, undefined, "", 1014203418]) {
  assert.deepEqual(validateCadastralNumber(input), { valid: false, reason: "missing" });
}
console.log("Cadastral format checks passed: compact/dotted land numbers, leading zeros, existing apartment formats and invalid inputs.");
