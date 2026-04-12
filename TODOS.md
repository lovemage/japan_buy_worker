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
