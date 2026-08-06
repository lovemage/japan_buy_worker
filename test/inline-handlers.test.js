import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Functions declared inside <script type="module"> live in module scope, not on
// window, so an inline onclick="fn()" silently throws ReferenceError at click
// time — no build step catches it. Every such handler must be re-exposed.
function htmlFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) htmlFiles(full, out);
    else if (entry.endsWith(".html")) out.push(full);
  }
  return out;
}

function moduleScripts(html) {
  const blocks = [];
  const re = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    if (/\btype\s*=\s*["']module["']/.test(m[1])) blocks.push(m[2]);
  }
  return blocks;
}

function inlineHandlerNames(html) {
  const names = new Set();
  const re = /\bon(?:click|change|input|submit|keyup)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(html))) {
    for (const call of m[1].matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)) names.add(call[1]);
  }
  return names;
}

test("module-scope functions used by inline handlers are exposed on window", () => {
  const problems = [];
  for (const file of htmlFiles("public")) {
    const html = readFileSync(file, "utf8");
    const modules = moduleScripts(html);
    if (!modules.length) continue;

    const moduleCode = modules.join("\n");
    for (const name of inlineHandlerNames(html)) {
      const declared = new RegExp(
        `(?:async\\s+)?function\\s+${name}\\b|(?:const|let|var)\\s+${name}\\s*=`
      ).test(moduleCode);
      if (!declared) continue; // defined elsewhere (classic script) or a built-in
      const exposed = new RegExp(`window\\.${name}\\s*=`).test(moduleCode);
      if (!exposed) problems.push(`${file}: ${name}() is module-scoped but never assigned to window`);
    }
  }
  assert.deepEqual(problems, [], problems.join("\n"));
});
