import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "apps/dashboard/src");
const output = resolve(root, "apps/dashboard/dist");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const app = await readFile(resolve(source, "app.ts"), "utf8");
const javascript = stripTypeScriptTypes(app, { mode: "strip" });

await Promise.all([
  writeFile(resolve(output, "app.js"), javascript),
  copy("index.html"),
  copy("styles.css"),
]);

console.log(`Dashboard built at ${output}`);

async function copy(name) {
  const contents = await readFile(resolve(source, name));
  await writeFile(resolve(output, name), contents);
}
