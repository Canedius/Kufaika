import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const path = join(process.cwd(), "script.js");
let source = readFileSync(path, "utf8");
source = source.replace("statusEl.innerHTML = '<p>", "statusEl.innerHTML = '<p>");
source = source.replace("'<p>æ…</p>'???", "");
const replacements = [
  {
    search: "statusEl.innerHTML = '<p>",
    replace: "statusEl.innerHTML = '<p>"
  }
];
writeFileSync(path, source, "utf8");
