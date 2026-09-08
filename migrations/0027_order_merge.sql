-- 0027_order_merge.sql
-- 同客戶（依電話）訂單合併 — 併入主訂單。
--
-- 商品搬到主單、被併單保留成一張標記為 'merged' 的空殼，並用 merged_into_id 指回主單。
-- 保留被併單而不是刪除，是因為買家手上有那組訂單編號（截圖、對話紀錄裡都是它），
-- 查歷史訂單時必須還查得到、也看得出併去哪張。
--
-- requirement_forms.status 會多出 'merged' 這個值。它只由合併端點寫入，
-- 不在後台狀態下拉的可選值裡（VALID_STATUSES），店家無法手動設成 merged。

ALTER TABLE requirement_forms ADD COLUMN merged_into_id INTEGER
  REFERENCES requirement_forms(id) ON DELETE SET NULL;
ALTER TABLE requirement_forms ADD COLUMN merged_at TEXT;

-- 商品的 requirement_form_id 會被改寫成主單，origin_form_id 記住它原本屬於哪張單。
-- 這是買家歷史頁還原被併訂單內容、以及 unmerge 拆回的唯一依據。
ALTER TABLE requirement_items ADD COLUMN origin_form_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_requirement_forms_merged_into
  ON requirement_forms(merged_into_id) WHERE merged_into_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_requirement_items_origin
  ON requirement_items(origin_form_id) WHERE origin_form_id IS NOT NULL;

-- 合併候選是「同 store 同電話」的查詢，沒有這個索引會全表掃描。
CREATE INDEX IF NOT EXISTS idx_requirement_forms_store_phone
  ON requirement_forms(store_id, member_phone);
