// Product compliance moderation — pure logic shared by the scan job, the
// platform admin and the seller admin. No D1 access, so it is unit-testable.
//
// The AI and keyword checks only produce *suspicions*. They never take a
// product down by themselves: the seller is notified first, and only a
// platform admin can remove a product (Terms of Service §5.1).

export const MODERATION_PROMPT_VERSION = "2026-10-16.1";
export const SELLER_RESPONSE_DAYS = 7;
export const STRIKE_WINDOW_DAYS = 90;
export const STRIKE_THRESHOLD = 3;
export const SCAN_BATCH_SIZE = 25;
export const DEFAULT_SCAN_MAX_PRODUCTS = 800;
export const MANUAL_SCAN_MAX_PRODUCTS = 200;
export const SELLER_RESPONSE_MAX_LENGTH = 1000;

export const RISK_LEVELS = ["suspected", "violation", "high_risk"];

export const RISK_LABELS = {
  suspected: "需確認販售資格",
  violation: "可能違規",
  high_risk: "高風險",
};

export const RULES = {
  cosmetics: { label: "化粧品", guidance: "以自用名義帶回的化粧品不得販售；輸入業者須依《化粧品衛生安全管理法》完成產品登錄等義務。" },
  food: { label: "食品、保健食品", guidance: "以自用名義帶回的食品不得販售；輸入販售須以業者身分辦理輸入查驗。" },
  drug: { label: "藥品", guidance: "非藥商不得販售藥品；未經核准輸入的藥品可能屬禁藥。" },
  medical_device: { label: "醫療器材", guidance: "醫療器材須取得許可證，並由合格業者販售。" },
  tobacco: { label: "菸品、電子煙", guidance: "《菸害防制法》禁止以郵購、電子購物等方式販賣菸品，電子煙等類菸品禁止販售。" },
  alcohol: { label: "酒類", guidance: "《菸酒管理法》規定酒類不得以無法辨識購買者年齡的方式販賣，並不得販售予未滿 18 歲者。" },
  radio_device: { label: "無線電子產品", guidance: "藍牙、Wi-Fi 等射頻器材須通過 NCC 審驗才能販售。" },
  inspection_goods: { label: "應施檢驗商品", guidance: "兒童玩具、部分電器等應施檢驗商品須完成商品檢驗。" },
  counterfeit: { label: "疑似仿冒品", guidance: "販售仿冒品違反《商標法》，須能證明商品來源。" },
  weapon: { label: "武器、管制刀械", guidance: "管制刀械、槍砲彈藥等禁止販售。" },
  adult: { label: "成人內容", guidance: "成人商品與內容須符合相關法規與分級規定。" },
  efficacy_claim: { label: "誇大功效宣稱", guidance: "商品描述不得宣稱醫療效能或保證特定效果。" },
  other: { label: "其他", guidance: "請確認商品符合相關法規。" },
};

const RULE_CODES = Object.keys(RULES);

// Fallback when no AI key is configured or the AI call fails. Broad on
// purpose: everything here is only a "suspected" notice for human review.
const KEYWORD_RULES = [
  { rule: "drug", re: /醫藥品|医薬品|藥品|药品|處方|处方|眼藥水|目薬|感冒藥|口內炎|口内炎|止痛藥|胃腸藥|藥膏|第[一二三]類医薬品/i },
  { rule: "food", re: /保健食品|健康食品|營養補充|营养补充|膠原蛋白錠|維他命|維生素|酵素|益生菌|喉糖|零食|餅乾|巧克力|糖果|泡麵|調味料|茶包|咖啡豆/i },
  { rule: "cosmetics", re: /化妝水|化粧水|乳液|精華液|美容液|防曬|日焼け止め|面膜|粉底|口紅|唇膏|眼影|卸妝|洗面乳|洗顔|保養品|彩妝|香水|染髮/i },
  { rule: "medical_device", re: /醫療器材|医療機器|血壓計|體溫計|隱形眼鏡|OK繃|絆創膏|護具/i },
  { rule: "tobacco", re: /香菸|菸品|煙草|烟草|電子煙|电子烟|加熱菸|雪茄|\b(vape|tobacco)\b/i },
  { rule: "alcohol", re: /酒類|酒类|清酒|燒酎|焼酎|威士忌|葡萄酒|啤酒|梅酒|\b(whisky|sake|wine)\b/i },
  { rule: "radio_device", re: /藍牙|蓝牙|Bluetooth|無線耳機|无线耳机|Wi-?Fi|無線滑鼠|无线鼠标|對講機/i },
  { rule: "efficacy_claim", re: /開光|法事|姻緣|姻缘|桃花燈|桃花灯|招財|治療|根治|消炎|保證有效/i },
];

export function keywordAssessment(product) {
  const text = productText(product);
  for (const { rule, re } of KEYWORD_RULES) {
    const match = text.match(re);
    if (match) {
      return { risk: "suspected", rule, reason: `商品內容出現「${match[0]}」，可能屬於${RULES[rule].label}，請確認販售資格。` };
    }
  }
  return { risk: "none", rule: "other", reason: "" };
}

export function productText(product) {
  return [product.title_zh_tw, product.title_ja, product.brand, product.category, product.description]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
}

// Stable input for the content fingerprint. Includes the prompt version so a
// prompt change re-scans everything once.
export function fingerprintInput(product) {
  return [MODERATION_PROMPT_VERSION, productText(product)].join("\u0001");
}

export async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function buildScanPrompt(products) {
  const items = products.map((p) => ({
    id: p.id,
    title: String(p.title_zh_tw || p.title_ja || "").slice(0, 120),
    brand: String(p.brand || "").slice(0, 60),
    category: String(p.category || "").slice(0, 60),
    description: String(p.description || "").slice(0, 400),
  }));
  return `你是台灣電商平台的商品合規初篩助手。以下是會員商店上架的商品，買家都在台灣。
請逐一判斷每件商品在台灣網路販售時，是否可能涉及需要特別資格或被禁止的類別。

判斷標準：
- risk = "none"：一般商品（服飾、包包、文具、生活雜貨、書籍、周邊等），沒有明顯法規風險。
- risk = "suspected"：屬於需要販售資格的類別，但賣家可能合法取得（例如化粧品、食品、保健食品、酒類、無線電子產品、應施檢驗商品）。
- risk = "violation"：內容明確顯示違規，例如寫明「日本帶回」「出國代購」的化粧品或食品、誇大醫療效能、疑似仿冒。
- risk = "high_risk"：藥品、處方藥、菸品、電子煙、管制刀械或武器。

rule 只能是以下其中之一：${RULE_CODES.join(", ")}。
reason 用繁體中文一句話說明判斷依據，60 字以內，語氣中性，不要指控賣家。
資訊不足時選擇較輕的等級。每件商品都必須回傳一筆結果，id 與輸入相同。

商品清單（JSON）：
${JSON.stringify(items)}`;
}

export const SCAN_RESPONSE_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      id: { type: "INTEGER" },
      risk: { type: "STRING", enum: ["none", ...RISK_LEVELS] },
      rule: { type: "STRING", enum: RULE_CODES },
      reason: { type: "STRING" },
    },
    required: ["id", "risk", "rule", "reason"],
  },
};

// Validate the model output; unknown ids, levels or rules are dropped/clamped.
export function normalizeAiResults(raw, expectedIds) {
  const expected = new Set(expectedIds.map(Number));
  const out = new Map();
  if (!Array.isArray(raw)) return out;
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const id = Number(entry.id);
    if (!expected.has(id) || out.has(id)) continue;
    const risk = RISK_LEVELS.includes(entry.risk) ? entry.risk : "none";
    const rule = RULE_CODES.includes(entry.rule) ? entry.rule : "other";
    const reason = String(entry.reason || "").replace(/\s+/g, " ").trim().slice(0, 200);
    out.set(id, { risk, rule, reason });
  }
  return out;
}

export function deadlineFrom(now, days = SELLER_RESPONSE_DAYS) {
  return new Date(now.getTime() + days * 86400_000).toISOString();
}

export function isOverdue(caseRow, now = new Date()) {
  if (caseRow.status !== "open" || !caseRow.seller_deadline_at) return false;
  const deadline = new Date(caseRow.seller_deadline_at).getTime();
  return Number.isFinite(deadline) && deadline < now.getTime();
}

export const ACTIVE_CASE_STATUSES = ["open", "responded", "removed", "appealed"];
export const CLOSED_CASE_STATUSES = ["dismissed", "seller_removed", "restored"];

export const CASE_STATUS_LABELS = {
  open: "等待會員確認",
  responded: "會員已說明，待審核",
  removed: "平台已下架",
  appealed: "會員申訴中",
  dismissed: "確認無違規",
  seller_removed: "會員已自行下架",
  restored: "申訴通過，已恢復",
};

// Which admin actions are allowed from which case status.
const ADMIN_TRANSITIONS = {
  dismiss: ["open", "responded"],
  remove: ["open", "responded"],
  restore: ["removed", "appealed"],
  uphold: ["appealed"],
  note: ["open", "responded", "removed", "appealed", "dismissed", "seller_removed", "restored"],
};

export function adminActionAllowed(action, status) {
  return Boolean(ADMIN_TRANSITIONS[action]?.includes(status));
}

export function sellerActionAllowed(action, status) {
  if (action === "respond") return status === "open" || status === "responded" || status === "removed" || status === "appealed";
  if (action === "self_remove") return status === "open" || status === "responded";
  return false;
}

// Seller explanation on an open case keeps it in review; on a removed case it becomes an appeal.
export function statusAfterSellerResponse(status) {
  return status === "removed" || status === "appealed" ? "appealed" : "responded";
}

export function sanitizeSellerMessage(message) {
  return String(message || "").replace(/\r\n/g, "\n").trim().slice(0, SELLER_RESPONSE_MAX_LENGTH);
}

export function shouldSuggestSuspension(strikeCount) {
  return strikeCount >= STRIKE_THRESHOLD;
}

export function caseSortKey(caseRow, now = new Date()) {
  const riskRank = { high_risk: 0, violation: 1, suspected: 2 }[caseRow.risk_level] ?? 3;
  const statusRank = { appealed: 0, responded: 1, open: isOverdue(caseRow, now) ? 0 : 2, removed: 3 }[caseRow.status] ?? 4;
  return [statusRank, riskRank, caseRow.created_at || ""];
}

export function formatTaipeiDate(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  return date.toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "long", day: "numeric" });
}
