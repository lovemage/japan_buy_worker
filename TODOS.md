# TODOS

## Landing Page — Journey-First 重構後續

### Pricing/Workflow 文案統一
- **What:** 把 Starter 方案描述（「認真經營代購」）、Pro 方案描述（「全職代購」）、Workflow 標題（「代購大小事，我們全包了」）改成新手友善語氣
- **Why:** 現在 Hero 對新手說話，但 Pricing/Workflow 仍對老手說話，造成頁面語氣矛盾。Codex 在 eng review 中標記為 P2。
- **Pros:** 整頁語氣一致，族群 1 不會在 Pricing 區域覺得「這不是給我的」
- **Cons:** 可能影響族群 2（已有用戶）的付費轉化感受
- **Context:** 決定先不動，等驗證新敘事（Journey-first Hero + 痛點教育）對族群 1 有效後再調整。驗證方式：觀察新頁面上線後的註冊轉化率和用戶回饋。
- **Depends on:** Landing page Journey-first 重構上線 + 2 週觀察期

### 完整漏斗追蹤
- **What:** 在 login 成功、onboarding 完成、首次上架等關鍵節點加 GA4 event tracking
- **Why:** 目前只追蹤 CTA 點擊（`cta_click`），這是虛榮指標。真正的 drop-off 發生在 login → onboarding → 首次上架之間。Codex 在 eng review 中標記為 P1。
- **Pros:** 能看到真實轉化漏斗，知道用戶卡在哪一步
- **Cons:** 需要在 Workers 後端多個端點加 tracking code
- **Context:** 這次 PR 先建立 GA4 基礎設施（tag + CTA events）。後續在 auth.ts、onboarding flow、product creation flow 中加入更多 events。
- **Depends on:** GA4 tag 上線（本次 PR）

## GEO 報告（2026-08-06）未完成項

### T-006 英文原生內容區
- **What:** 建 ≥8 頁英文原生內容（首頁、產品、定價、對比、FAQ、案例 ×3）並掛 hreflang
- **Why:** 報告指出海外 AI 引用的可辨識語言中英文佔 82.9%–95.1%，目前站上英文有效內容頁為 0
- **Pros:** 打開海外 AI 引用的候選池
- **Cons:** ≥5 人日內容工程，且需要先定英文品牌口徑與英文版定價呈現
- **Context:** 2026-08-09 業主決定本輪只做技術面 P0/P1，英文區延後另開一輪

### T-003 百科詞條
- **What:** 提交百度百科詞條；海外市場爭取 Wikipedia
- **Why:** 百科是品牌實體消歧的地基
- **Cons:** 需要第三方媒體報導等外部來源支撐，非工程可獨立完成
- **Depends on:** 第三方報導或可引用來源

### D-001 / D-002 待補證數字
- **What:** 補齊「使用中賣家數」與「平均上架時間」的原始量測
- **Why:** 兩者目前都是 D 級宣稱，見 `content/facts.md` 待補證清單
- **Context:** 2026-08-09 賣家數由 10,000+ 改為 1000+，60 秒上架保留；補證前不得再往上調整或加「保證」「最快」等強化詞

### P2 外部來源引用
- **What:** 在教學文章補上可查證的外部來源連結
- **Why:** 報告指出全站 25 頁幾乎不引用外部來源，證據鏈偏弱
