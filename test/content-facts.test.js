import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const facts = readFileSync(new URL("../content/facts.md", import.meta.url), "utf8");

test("brand facts card contains every required section", () => {
  for (const heading of [
    "## 實體",
    "## 產品與能力",
    "## 關鍵數字",
    "## 適用與不適用",
    "## 禁用表達",
  ]) {
    assert.ok(facts.includes(heading), `facts card must include ${heading}`);
  }
});

test("every factual table row carries an A-E evidence grade", () => {
  const lines = facts.split("\n");
  const separator = /^\|(?:\s*:?-{3,}:?\s*\|)+$/;
  const grade = /\|\s*[ABCDE]\s*\|/;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.startsWith("|") || separator.test(line)) continue;
    if (separator.test(lines[index + 1] || "")) continue;
    assert.match(line, grade, `table row ${index + 1} must include an A-E evidence grade`);
  }
});

test("every D or E claim includes a correction or evidence action", () => {
  const rows = facts
    .split("\n")
    .filter((line) => line.startsWith("|") && /\|\s*[DE]\s*\|/.test(line));

  for (const row of rows) {
    assert.match(
      row,
      /補|確認|刪除|停用|改寫|統一|不得|不可|使用|需由|須由|建立|保存|匯出|列出|完成|能說明/,
      `D/E row must include a concrete handling action: ${row}`
    );
  }
});
