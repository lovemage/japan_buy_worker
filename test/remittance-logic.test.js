import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeLast5,
  normalizeDateOnly,
  canReportRemittance,
  validateRemittanceReport,
  parseRemittanceSettings,
  sanitizeRemittanceSettingsPatch,
  remittanceAmountMatches,
} from "../src/shared/remittance-logic.js";

test("normalizeLast5 只接受恰好五位數字", () => {
  assert.equal(normalizeLast5("12345"), "12345");
  assert.equal(normalizeLast5(" 12345 "), "12345");
  assert.equal(normalizeLast5("1-2345"), "12345");
  assert.equal(normalizeLast5(12345), "12345");
  // 四碼通常是買家填成末四碼，六碼以上多半是貼了整組帳號
  assert.equal(normalizeLast5("1234"), null);
  assert.equal(normalizeLast5("123456"), null);
  assert.equal(normalizeLast5("abcde"), null);
  assert.equal(normalizeLast5(""), null);
  assert.equal(normalizeLast5(null), null);
});

test("normalizeDateOnly 擋掉格式合法但不存在的日期", () => {
  assert.equal(normalizeDateOnly("2026-09-08"), "2026-09-08");
  assert.equal(normalizeDateOnly("2026-09-08 14:32:01"), "2026-09-08");
  assert.equal(normalizeDateOnly("2026-02-31"), null);
  assert.equal(normalizeDateOnly("2026-13-01"), null);
  assert.equal(normalizeDateOnly("09/08/2026"), null);
  assert.equal(normalizeDateOnly(""), null);
});

test("canReportRemittance 擋掉不該再回報的訂單", () => {
  assert.equal(canReportRemittance({ status: "pending" }).ok, true);
  assert.equal(canReportRemittance({ status: "paid" }).ok, true);
  assert.equal(canReportRemittance({ status: "preparing" }).ok, true);

  assert.equal(canReportRemittance({ status: "shipped" }).ok, false);
  assert.equal(canReportRemittance({ status: "completed" }).ok, false);
  assert.equal(canReportRemittance({ status: "cancelled" }).ok, false);
  assert.equal(canReportRemittance({ status: "merged" }).ok, false);

  // 已核銷不可覆寫，否則店家對完的帳會被買家改掉
  assert.equal(canReportRemittance({ status: "paid", remittance_status: "verified" }).ok, false);
  // 被駁回的可以重報
  assert.equal(canReportRemittance({ status: "pending", remittance_status: "rejected" }).ok, true);
  // 已合併的訂單要到主單回報
  assert.equal(canReportRemittance({ status: "pending", merged_into_id: 12 }).ok, false);
  assert.equal(canReportRemittance(null).ok, false);
});

test("validateRemittanceReport 驗證後五碼、金額與日期", () => {
  const base = { orderCreatedAt: "2026-09-01 10:00:00", todayIso: "2026-09-08" };

  const ok = validateRemittanceReport({ ...base, last5: "12345", amount: "1200", paidDate: "2026-09-05" });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.value, { last5: "12345", amount: 1200, paidDate: "2026-09-05", note: "" });

  assert.equal(validateRemittanceReport({ ...base, last5: "123", amount: 1200, paidDate: "2026-09-05" }).ok, false);
  assert.equal(validateRemittanceReport({ ...base, last5: "12345", amount: 0, paidDate: "2026-09-05" }).ok, false);
  assert.equal(validateRemittanceReport({ ...base, last5: "12345", amount: "12.5", paidDate: "2026-09-05" }).ok, false);
  assert.equal(validateRemittanceReport({ ...base, last5: "12345", amount: 1200, paidDate: "" }).ok, false);
});

test("validateRemittanceReport 的日期區間保留一天時差容忍", () => {
  const base = { orderCreatedAt: "2026-09-01 10:00:00", todayIso: "2026-09-08" };

  // 伺服器是 UTC、買家在 UTC+8，跨日送出時買家的「今天」會比伺服器早一天到
  assert.equal(validateRemittanceReport({ ...base, last5: "12345", amount: 100, paidDate: "2026-09-09" }).ok, true);
  assert.equal(validateRemittanceReport({ ...base, last5: "12345", amount: 100, paidDate: "2026-09-10" }).ok, false);

  // 同樣的容忍套在訂單成立日這一側
  assert.equal(validateRemittanceReport({ ...base, last5: "12345", amount: 100, paidDate: "2026-08-31" }).ok, true);
  assert.equal(validateRemittanceReport({ ...base, last5: "12345", amount: 100, paidDate: "2026-08-30" }).ok, false);
});

test("validateRemittanceReport 截斷過長備註", () => {
  const result = validateRemittanceReport({
    last5: "12345",
    amount: 100,
    paidDate: "2026-09-05",
    note: "x".repeat(500),
    orderCreatedAt: "2026-09-01 10:00:00",
    todayIso: "2026-09-08",
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.note.length, 200);
});

test("parseRemittanceSettings 對壞資料回預設值", () => {
  assert.deepEqual(parseRemittanceSettings(null), { enabled: false, instruction: "", accounts: [] });
  assert.deepEqual(parseRemittanceSettings("not json"), { enabled: false, instruction: "", accounts: [] });
  assert.deepEqual(parseRemittanceSettings('{"enabled":true}').accounts, []);

  const parsed = parseRemittanceSettings(JSON.stringify({
    enabled: true,
    instruction: "匯款後請回報",
    accounts: [{ bankName: "國泰世華", bankCode: "013", accountNo: "1234567890", accountName: "王小明" }],
  }));
  assert.equal(parsed.enabled, true);
  assert.equal(parsed.accounts.length, 1);
  assert.equal(parsed.accounts[0].bankCode, "013");
});

test("sanitizeRemittanceSettingsPatch 丟掉不完整的帳戶", () => {
  const result = sanitizeRemittanceSettingsPatch({
    enabled: true,
    instruction: "  請回報後五碼  ",
    accounts: [
      { bankName: "國泰世華", accountNo: "1234-5678", accountName: "王小明" },
      { bankName: "", accountNo: "999" },        // 沒有銀行名稱
      { bankName: "玉山", accountNo: "" },        // 沒有帳號
      "not an object",
    ],
  });
  assert.equal(result.accounts.length, 1);
  assert.equal(result.accounts[0].accountNo, "1234-5678");
  assert.equal(result.instruction, "請回報後五碼");
});

test("sanitizeRemittanceSettingsPatch 沒有帳戶時不允許開啟", () => {
  // 否則買家會看到一個沒有任何帳號的匯款區塊
  const result = sanitizeRemittanceSettingsPatch({ enabled: true, accounts: [] });
  assert.equal(result.enabled, false);
});

test("sanitizeRemittanceSettingsPatch 上限五組帳戶", () => {
  const many = Array.from({ length: 8 }, (_, i) => ({ bankName: `銀行${i}`, accountNo: `${i}${i}${i}` }));
  assert.equal(sanitizeRemittanceSettingsPatch({ enabled: true, accounts: many }).accounts.length, 5);
});

test("remittanceAmountMatches 只在兩邊都是數字時比較", () => {
  assert.equal(remittanceAmountMatches(1200, 1200), true);
  assert.equal(remittanceAmountMatches(1000, 1200), false);
  assert.equal(remittanceAmountMatches(null, 1200), true);
  assert.equal(remittanceAmountMatches(1200, undefined), true);
});
