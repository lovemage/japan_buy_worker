-- 0028_order_notes.sql
-- 訂單備註：內部備註（只給店家後台看）與外部備註（買家查歷史訂單時看得到）。
--
-- 兩者都跟買家下單時填的 notes 分開：notes 是買家寫給店家的，這兩欄是店家寫的。
-- internal_note 絕對不能出現在任何公開端點（/api/requirement、/api/requirement-history）。
--
-- external_note_created_at：第一次寫入外部備註的時間（買家看到的「編輯時間」）
-- external_note_updated_at：最後一次修改的時間（買家看到的「更新時間」）
-- 清空外部備註時兩個時間一起歸零，下次再寫就視為新的一則。

ALTER TABLE requirement_forms ADD COLUMN internal_note TEXT;
ALTER TABLE requirement_forms ADD COLUMN internal_note_updated_at TEXT;

ALTER TABLE requirement_forms ADD COLUMN external_note TEXT;
ALTER TABLE requirement_forms ADD COLUMN external_note_created_at TEXT;
ALTER TABLE requirement_forms ADD COLUMN external_note_updated_at TEXT;
