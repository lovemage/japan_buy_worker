import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const robots = readFileSync(new URL("../public/robots.txt", import.meta.url), "utf8");
const AI_CRAWLERS = [
  "Amazonbot",
  "Applebot-Extended",
  "Bytespider",
  "CCBot",
  "ClaudeBot",
  "Google-Extended",
  "GPTBot",
  "meta-externalagent",
  "OAI-SearchBot",
  "PerplexityBot",
];

function parseGroups(source) {
  const groups = [];
  let agents = [];
  let rules = [];
  let hasRules = false;

  function finishGroup() {
    if (agents.length) groups.push({ agents, rules });
    agents = [];
    rules = [];
    hasRules = false;
  }

  for (const rawLine of source.split("\n")) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;

    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === "user-agent") {
      if (hasRules) finishGroup();
      agents.push(value.toLowerCase());
      continue;
    }

    if (!agents.length) continue;
    rules.push({ field, value });
    hasRules = true;
  }

  finishGroup();
  return groups;
}

const groups = parseGroups(robots);

test("robots.txt does not block any supported AI crawler site-wide", () => {
  const protectedAgents = new Set(["*", ...AI_CRAWLERS.map((agent) => agent.toLowerCase())]);

  for (const group of groups) {
    if (!group.agents.some((agent) => protectedAgents.has(agent))) continue;

    for (const rule of group.rules) {
      if (rule.field !== "disallow") continue;
      assert.ok(
        rule.value !== "/" && rule.value !== "/*",
        `${group.agents.join(", ")} must not be blocked site-wide`
      );
    }
  }
});

test("robots.txt keeps public pages open and private routes out of crawl results", () => {
  const wildcard = groups.find((group) => group.agents.includes("*"));
  assert.ok(wildcard, "robots.txt must include a wildcard user-agent group");
  assert.ok(
    wildcard.rules.some((rule) => rule.field === "allow" && rule.value === "/"),
    "public pages must be crawlable"
  );

  for (const privatePath of ["/admin.html", "/platform-admin.html", "/auth/", "/api/"]) {
    assert.ok(
      wildcard.rules.some(
        (rule) => rule.field === "disallow" && rule.value === privatePath
      ),
      `${privatePath} must remain excluded`
    );
  }
});
