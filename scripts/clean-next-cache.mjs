import { rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const nextDir = path.resolve(root, ".next");

if (!nextDir.startsWith(root)) {
  throw new Error(`Refusing to remove unsafe path: ${nextDir}`);
}

await rm(nextDir, { recursive: true, force: true });
console.log("Removed .next cache");
