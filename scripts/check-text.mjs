import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { URL, fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: root, encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
const forbiddenForms = [
  String.fromCodePoint(0x2014),
  ["&", "mdash;"].join(""),
  ["&#", "8212;"].join(""),
  ["&#x", "2014;"].join(""),
  ["\\", "u2014"].join(""),
  ["\\", "u{2014}"].join(""),
];
const failures = [];
for (const file of new Set(files)) {
  let bytes;
  try {
    const path = resolve(root, file);
    if (!statSync(path).isFile()) continue;
    bytes = readFileSync(path);
  } catch (error) {
    if (error.code === "ENOENT") continue;
    throw error;
  }
  // Binary assets are not text. Generated files and local state are excluded by Git.
  if (bytes.includes(0)) continue;
  const lines = bytes.toString("utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    const lower = line.toLowerCase();
    if (forbiddenForms.some((form) => lower.includes(form)))
      failures.push(`${file}:${index + 1}`);
  });
}
if (failures.length) {
  console.error(`Forbidden punctuation found in:\n${failures.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(
    "Project text contains no em dash characters or equivalent escapes.",
  );
}
