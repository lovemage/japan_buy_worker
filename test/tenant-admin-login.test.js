import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const routerTs = readFileSync(new URL("../src/router.ts", import.meta.url), "utf8");
const indexTs = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
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

test("OAuth starts on APP_URL origin so state cookie matches callback origin", () => {
  assert.match(indexTs, /function redirectAuthStartToAppUrl\(request: Request, appUrl: string\): Response \| null/, "Expected auth start canonical redirect helper");
  assert.match(indexTs, /if \(currentUrl\.origin === appBaseUrl\.origin\) return null;/, "Expected same-origin auth starts to continue normally");
  assert.match(indexTs, /const canonicalRedirect = redirectAuthStartToAppUrl\(request, authEnv\.APP_URL\);[\s\S]*if \(canonicalRedirect\) return canonicalRedirect;[\s\S]*return handleGoogleAuthRedirect\(authEnv\);/, "Expected Google auth to canonicalize before setting oauth_state");
  assert.match(indexTs, /const canonicalRedirect = redirectAuthStartToAppUrl\(request, authEnv\.APP_URL\);[\s\S]*if \(canonicalRedirect\) return canonicalRedirect;[\s\S]*return handleLineAuthRedirect\(authEnv\);/, "Expected LINE auth to canonicalize before setting oauth_state");
});

test("subdomain owner routes redirect to path-based admin on main domain", () => {
  assert.match(indexTs, /function isTenantOwnerPath\(pathname: string\): boolean/, "Expected owner-route detector for tenant subdomains");
  assert.match(indexTs, /pathname === "\/admin"/, "Expected subdomain /admin to be treated as owner route");
  assert.match(indexTs, /pathname\.startsWith\("\/api\/admin\/"\)/, "Expected subdomain admin APIs to be treated as owner routes");
  assert.match(indexTs, /redirectUrl\.pathname = `\/s\/\$\{store\.slug\}\$\{url\.pathname\}`;/, "Expected owner routes to redirect to /s/{slug}/... on main domain");
});
