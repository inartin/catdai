export function shouldPersistRuntimeData() {
  return process.env.NODE_ENV === "production";
}
