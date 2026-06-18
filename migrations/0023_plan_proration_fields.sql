-- 0023_plan_proration_fields.sql
-- 升級折抵：credit-basis 累加模型欄位 + 升級訂單審計欄位 + 回填既有付費店家
-- 權威計畫 §1.2。plan_paid_amount(0017) 語意改為 credit basis（實付對價累加餘額），欄位本身不動。
-- 注意：本檔僅產出，套用指令見 PR 說明；勿對 production 執行。

-- stores：累加分母 + 回填標記（DEFAULT 0 防 NaN）
ALTER TABLE stores ADD COLUMN plan_paid_days       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stores ADD COLUMN plan_bonus_days      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stores ADD COLUMN needs_billing_review INTEGER NOT NULL DEFAULT 0;

-- payment_orders：升級訂單審計快照
ALTER TABLE payment_orders ADD COLUMN is_upgrade         INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payment_orders ADD COLUMN list_amount        INTEGER;
ALTER TABLE payment_orders ADD COLUMN gateway_amount     INTEGER;
ALTER TABLE payment_orders ADD COLUMN credit_applied     INTEGER;
ALTER TABLE payment_orders ADD COLUMN credit_basis_added INTEGER;
ALTER TABLE payment_orders ADD COLUMN extra_paid_days    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payment_orders ADD COLUMN source_snapshot_json TEXT;
ALTER TABLE payment_orders ADD COLUMN status_reason      TEXT;

-- 同店同時只允許一張未付升級單
CREATE UNIQUE INDEX idx_one_pending_upgrade
  ON payment_orders(store_id) WHERE is_upgrade = 1 AND status = 'pending';

-- 回填既有付費店家的 plan_paid_days / plan_bonus_days（對照 plan-offers.js 寫死 CASE）
-- 對照表（amount → paid_days, bonus_days）：
--   plus 490→(30,0)
--   pro  880→(30,0) 4680→(180,0) 8160→(360,30)
--   proplus 1280→(30,0) 7680→(180,30) 15360→(360,60)
UPDATE stores SET
  plan_paid_days = CASE
    WHEN plan='plus'    AND plan_paid_amount=490   THEN 30
    WHEN plan='pro'     AND plan_paid_amount=880   THEN 30
    WHEN plan='pro'     AND plan_paid_amount=4680  THEN 180
    WHEN plan='pro'     AND plan_paid_amount=8160  THEN 360
    WHEN plan='proplus' AND plan_paid_amount=1280  THEN 30
    WHEN plan='proplus' AND plan_paid_amount=7680  THEN 180
    WHEN plan='proplus' AND plan_paid_amount=15360 THEN 360
    ELSE 0 END,
  plan_bonus_days = CASE
    WHEN plan='pro'     AND plan_paid_amount=8160  THEN 30
    WHEN plan='proplus' AND plan_paid_amount=7680  THEN 30
    WHEN plan='proplus' AND plan_paid_amount=15360 THEN 60
    ELSE 0 END
WHERE plan IN ('plus','pro','proplus');

-- 付費方案但金額無法唯一對照（含 NULL/0 或非標準金額）→ 標記人工審查，升級時導客服
UPDATE stores SET needs_billing_review = 1
WHERE plan IN ('plus','pro','proplus') AND plan_paid_days = 0;

-- 無法確認累加正確性者 → 標記人工審查（Codex High #2）：
-- 舊 applyActivation 對多次續約是「覆寫 plan_paid_amount=單筆金額、但 expires 往後疊」，
-- 故金額對得上單筆 offer 不代表 basis 正確。凡 started/expires 缺失，或實際效期跨距
-- 明顯超過單筆 offer 總天數（paid+bonus，+3 天容差）者，視為可能多次續約，導客服重建 basis。
UPDATE stores SET needs_billing_review = 1
WHERE plan IN ('plus','pro','proplus')
  AND plan_paid_days > 0
  AND (
    plan_started_at IS NULL
    OR plan_expires_at IS NULL
    OR (julianday(plan_expires_at) - julianday(plan_started_at)) > (plan_paid_days + plan_bonus_days + 3)
  );
