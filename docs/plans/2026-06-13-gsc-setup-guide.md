# Google Search Console 設置指引（P1-5）

> 對象：vovosnap.com 網站擁有者（需 Google 帳號權限，無法由程式自動完成）
> 目的：讓 Google 開始索引網站、提交 sitemap、取得真實的搜尋曝光/點擊/索引覆蓋率數據

---

## 一、加入資源（Property）

1. 開啟 https://search.google.com/search-console
2. 左上「新增資源」→ 選 **網域**（Domain）類型，輸入 `vovosnap.com`
   - 網域類型會一次涵蓋 `https://`、`www`、所有子網域（含各租戶 `*.vovosnap.com`），最完整，建議用這個。
   - 若無法改 DNS，改用「網址前置字元」類型輸入 `https://vovosnap.com/`（只涵蓋主網域，租戶子網域要另外加）。

## 二、驗證擁有權（擇一）

| 方式 | 適用 | 做法 |
|---|---|---|
| **DNS TXT（網域類型必用）** | 推薦 | GSC 會給一段 `google-site-verification=...` TXT 值，到網域 DNS（Cloudflare 後台）新增一筆 TXT 記錄，存檔後回 GSC 按驗證 |
| Google Analytics | 網址前置字元類型可用 | 本站已裝 GA4（`G-E3TD4YZSWY`）。若 GSC 與 GA 用同一個 Google 帳號，可直接選 GA 驗證，免改任何檔案 |
| HTML meta 標籤 | 網址前置字元類型可用 | 見下方「程式配合」 |

### 程式配合（僅當選 HTML meta 標籤驗證時）

在 `public/index.html` 的 `<head>` 內加入 GSC 給的標籤（範例，content 換成實際值）：

```html
<meta name="google-site-verification" content="這裡貼GSC給的字串" />
```

加好後重新部署，再回 GSC 按驗證。驗證通過後此標籤可永久保留（移除會掉驗證）。
> 用 DNS 或 GA 驗證則**不需要**改這個檔。

## 三、提交 sitemap

驗證通過後：

1. 左側選單 →「Sitemap」
2. 在「新增 Sitemap」輸入：`sitemap.xml`（完整網址會是 `https://vovosnap.com/sitemap.xml`）
3. 送出。狀態應顯示「成功」

> sitemap 是**動態產生**的（由 Worker 即時列出所有上線中商店首頁與商品頁），新商店/商品上架後會自動進 sitemap，不需手動更新。

## 四、上線後要看的報告

| 報告 | 看什麼 |
|---|---|
| 網頁（索引）| 「已建立索引」頁面數是否成長；被排除的頁面與原因（重複、已爬未索引等） |
| Sitemap | 已探索 vs 已索引 的數量差 |
| 成效 | 哪些查詢字詞帶來曝光/點擊（用來驗證長尾關鍵字策略） |
| 體驗 → Core Web Vitals | 與本站 GA4 web_vitals 事件互相對照 |

## 五、提交後第一週檢查清單

- [ ] sitemap 狀態為「成功」、已探索頁數 > 0
- [ ] 用「網址審查」工具測一個租戶商品頁 `https://<店>.vovosnap.com/product?code=<商品碼>`，確認「Google 可以索引」、且抓到的是含 title/description/JSON-LD 的版本（不是空殼）
- [ ] 確認 `robots.txt` 在 GSC 的 robots.txt 報告無錯誤、未誤擋商品頁
- [ ] 確認被選為 canonical 的網址與 sitemap 的 `?code=` 網址一致（先前已修正 canonical 一致性）

---

> 備註：StatCounter 等第三方市佔數據在台灣有取樣偏差，GSC 才是這個網站自己的 ground-truth 數據來源。上線累積 2–4 週後再回頭評估關鍵字策略。
