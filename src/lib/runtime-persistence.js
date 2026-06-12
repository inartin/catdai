export function shouldPersistRuntimeData() {
  return process.env.NODE_ENV === "production" || process.env.ENABLE_RUNTIME_PERSISTENCE === "true";
}
