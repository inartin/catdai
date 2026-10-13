import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/server") {
    return nextResolve("next/server.js", context);
  }
  if (specifier.startsWith("@/")) {
    let sub = specifier.slice(2);
    if (!sub.endsWith(".js") && !sub.endsWith(".mjs") && !sub.endsWith(".json")) {
      sub += ".js";
    }
    const resolvedUrl = new URL("../src/" + sub, import.meta.url).href;
    return nextResolve(resolvedUrl, context);
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".json")) {
    const content = await fs.readFile(fileURLToPath(url), "utf8");
    return {
      format: "json",
      shortCircuit: true,
      source: content,
    };
  }
  return nextLoad(url, context);
}
