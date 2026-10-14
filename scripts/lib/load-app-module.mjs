import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

// Run server helpers from maintenance scripts without a Next server or a bundler.
export async function loadAppModule(entry, overrides = {}) {
  const modules = new Map();
  const context = vm.createContext({ console, process, Date, URL, URLSearchParams, Request, Response,
    Headers, AbortSignal, Buffer, setTimeout, clearTimeout });
  async function moduleFor(id) {
    if (modules.has(id)) return modules.get(id);
    let loadedModule;
    if (overrides[id] || (!id.startsWith("@/") && !id.startsWith("src/"))) {
      const exports = overrides[id] || await import(id);
      loadedModule = new vm.SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
      }, { context });
    } else {
      const file = id.startsWith("@/") ? `src/${id.slice(2)}.js` : id;
      const source = await fs.readFile(file, "utf8");
      loadedModule = file.endsWith(".json")
        ? new vm.SyntheticModule(["default"], function () { this.setExport("default", JSON.parse(source)); }, { context })
        : new vm.SourceTextModule(source, { context, identifier: file });
    }
    modules.set(id, loadedModule);
    return loadedModule;
  }
  const loadedModule = await moduleFor(entry);
  await loadedModule.link((specifier, parent) => moduleFor(specifier.startsWith(".")
    ? path.posix.normalize(path.posix.join(path.posix.dirname(parent.identifier), specifier)) : specifier));
  await loadedModule.evaluate();
  return loadedModule.namespace;
}
