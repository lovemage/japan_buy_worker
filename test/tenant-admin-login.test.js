import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const routerTs = readFileSync(new URL("../src/router.ts", import.meta.url), "utf8");
const loginHtml = readFileSync(new URL("../public/login.html", import.meta.url), "utf8");

test("tenant admin-login route serves OAuth login page instead of legacy password form", () => {
  assert.ok(
    routerTs.includes('if (subPath === "/admin-login.html") {\n    return serveTenantHtml(request, ctx, "login.html", assets);\n  }'),
    "Expected tenant /admin-login.html to serve login.html"
  );
  assert.match(loginHtml, /Google 登入/, "Expected OAuth login page to offer Google login");
  assert.match(loginHtml, /LINE 登入/, "Expected OAuth login page to offer LINE login");
  assert.doesNotMatch(
    loginHtml,
    /帳號[\s\S]*密碼[\s\S]*登入/,
    "Expected tenant login page not to expose the legacy username/password admin form"
  );
});
