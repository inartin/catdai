// Copy the worker resolver without maintaining a second implementation.
// pnpm exec node scripts/sync-cadastru-streets.mjs ../catdai-api
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
const source = resolve(process.argv[2] || "../catdai-api", "services/cadastru");
const target = new URL("../src/lib/cadastru-streets/", import.meta.url);
await mkdir(new URL("data/", target), { recursive: true });
const original = await readFile(`${source}/street-resolver.js`, "utf8");
const loader = 'const readData = (name) => JSON.parse(readFileSync(new URL(`./data/${name}`, import.meta.url), "utf8"));';
if (!original.includes(loader)) throw new Error("Worker loader changed; review the sync adapter");
const adapted = original.replace('import { readFileSync } from "node:fs";',
  'import streets from "./data/streets.json";\nimport corrections from "./data/street-corrections.json";')
  .replace(loader, 'const readData = (name) => name === "streets.json" ? streets : corrections;');
await writeFile(new URL("street-resolver.js", target), adapted);
const hashes = { "street-resolver.js": createHash("sha256").update(original).digest("hex") };
for (const name of ["supported-cities.js", "data/streets.json", "data/street-corrections.json"]) {
  await copyFile(`${source}/${name}`, new URL(name, target));
  hashes[name] = createHash("sha256").update(await readFile(`${source}/${name}`)).digest("hex");
}
await writeFile(new URL("source-hashes.json", target), JSON.stringify(hashes, null, 2) + "\n");
console.log("Synced worker street resolver and dictionary.");
