import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const RUNTIME_DIR = path.join(ROOT, ".runtime");

export function fromRoot(value) {
  return path.resolve(ROOT, String(value || ""));
}

export function relativeToRoot(value) {
  return path.relative(ROOT, value).split(path.sep).join("/");
}
