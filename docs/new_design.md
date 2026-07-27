# New Design — 商品 UI 改版規格

> 來源：`docs/anshuc_2081185524199674196_1212x2160.mp4`（15.9s / 60fps / 1212×2160）逐幀解析。
> 對象：商品列表、商品詳情、以及兩者之間的轉場動畫。
> 現行設計系統見 [DESIGN.md](../DESIGN.md)；本文是**商品 UI 的新方向提案**，尚未套用到任何頁面。

---

## 1. 設計概念

**Editorial Catalogue — 雜誌式商品目錄。**

核心主張：**去掉所有容器，讓商品圖自己當版面。**

沒有卡片、沒有圓角框、沒有陰影盒、沒有底部 tab bar。分隔只用 1px 極淡橫線，其餘全部交給留白。
商品圖是去背棚拍 PNG + 柔和接地陰影，直接浮在米白背景上，不裁切、不套框、**不等大**。
文字用襯線體撐氣質，所有 label 一律無襯線 + 全大寫 + 寬字距 + 淺灰，形成穩定的兩層資訊階級。

結果：同一批資料，讀起來像精品目錄而不是電商列表。

---

## 2. Design Tokens

色值取自原片像素取樣，小字級與細線因抗鋸齒略有偏差，實作時可微調。

| Token | Value | Role |
|---|---|---|
| `--nd-bg` | `#F2EEE8` | 主底（暖米白，非純白） |
| `--nd-ink` | `#12100D` | 主文字：標題、品名、數值 |
| `--nd-muted` | `#8A8378` | 次要文字：份量、日期 |
| `--nd-faint` | `#B3ABA0` | Label、單位、弱說明 |
| `--nd-line` | `#EBE7E1` | 1px 分隔線（唯一的線） |
| `--nd-accent` | `#9C4432` | 磚紅：主進度條、餐段/分類標籤 |
| `--nd-c1` | `#A83E2C` | 資料色 1（紅） |
| `--nd-c2` | `#C09A2E` | 資料色 2（黃） |
| `--nd-c3` | `#4F7A4C` | 資料色 3（綠） |
| `--nd-chip` | `#E6E2DB` | 未選中 pill 底 |
| `--nd-chip-on` | `#141210` | 選中 pill 底（白字） |
| `--nd-ease` | `cubic-bezier(.22,1,.36,1)` | 全域 easing（與現行 `--ease-out` 一致） |
| `--nd-dur-fast` | `240ms` | 換頁、sheet |
| `--nd-dur-morph` | `340ms` | 共享元素轉場 |

### 字體

沿用專案既有字族，不引入新字體。

| 角色 | 規格 |
|---|---|
| 頁面標題 | Noto Serif TC 600 / `clamp(30px, 8vw, 40px)` / 字距 `.01em` |
| 主數值 | Noto Serif TC 500 / `clamp(38px, 11vw, 52px)` / `font-variant-numeric: tabular-nums` |
| 品名 | Noto Serif TC 500 / 19px |
| 項目數值 | Noto Serif TC 500 / 22px / tabular-nums |
| **Label** | Noto Sans TC 500 / **11px** / `text-transform: uppercase` / `letter-spacing: .14em` / `--nd-faint` |
| 內文 | Noto Sans TC 400 / 15px / line-height 1.55 |

Label 規格是整套視覺的骨幹，`AMOUNT`、`KCAL`、`1 CUP`、`SOURCE`、日期副標全部套同一組值，不得例外。

### 間距

8px 基準。區塊間距用 `28 / 36 / 48`，列表列上下 padding `18px`，網格 cell 高度 `≥ 200px`（留白必須多於圖）。

---

## 3. 版面骨架

```
┌─────────────────────────┐
│ status bar              │  ← 不參與任何轉場
├─────────────────────────┤
│              [⊞] [⋯]    │  ← 唯一導航：視圖切換 + 更多
│                         │
│  《標題》                │
│  SUBTITLE LABEL         │
│                         │
│  [ 總覽數字區 ]           │
│                         │
│  ─────────────────────  │  ← 可捲動內容區（唯一會動的層）
│  [ 分組 label ]          │
│  [ 商品列 × n ]          │
│                         │
├─────────────────────────┤
│ [ 常駐輸入 / 主 CTA ]     │  ← 不參與任何轉場
└─────────────────────────┘
```

三層固定原則：**狀態列、頂部 icon 列、底部常駐條在所有轉場中靜止不動**，只有中間內容區在動。這是原片「像翻頁而不像換畫面」的關鍵。

---

## 4. 元件規格

### 4.1 分組標頭

```
Today ──────────────────  1,229 KCAL
— 65G   — 136G   — 51G
```

- 左：襯線標題；右：該組彙總數值（襯線 + label）
- 下一行：三個帶色 dash 的次級指標，dash 顏色對應 `--nd-c1/2/3`
- 標頭與內容之間**不加分隔線**，靠 28px 留白區隔

### 4.2 總覽數字區

```
1,229  OF 2,200              971 LEFT
━━━━━━━━━━━━━━━━──────────────────────   ← 2px 主進度條
PROTEIN 65     CARBS 136      FAT 51
────────────   ─────────      ──────      ← 各 1.5px，對應資料色
```

- 主數值超大襯線 + 緊接的小寫 label（`OF 2,200`）不換行
- 進度條無圓角、無背景槽，只有一條實心線 + 一條 `--nd-line` 底線
- 三欄等寬，每欄底下的細線長度即該項比例

### 4.3 商品列（列表視圖）

```
[圖]  品名                          166
      1 CUP                        KCAL
```

- 左縮圖 `56×56` 容器，圖片 `object-fit: contain`，**不裁切成方形**
- 中：品名（襯線 19px）+ 份量（label 11px）
- 右：數值（襯線 22px）+ 單位（label，換行疊在數值下方，右對齊）
- **無背景色塊、無 chevron、無右箭頭**，整列可點
- 列間 1px `--nd-line`，首列上方與末列下方不畫線
- 點擊回饋：整列 `opacity: .55`，`120ms`，不做背景高亮

### 4.4 商品網格（全覽視圖）

- 2 欄，`gap: 8px`，cell 內容置中
- 圖片區高度固定 `140px`，圖片 `max-height: 100%` 置中 —— **圖片實際寬高依商品自然比例，不強制對齊**
- 圖下 20px 放品名（襯線 17px，置中），再下 6px 放 label 數值
- 分組末尾單數項只佔左欄，右欄留白，**不做補位卡片**
- 捲動時上下邊緣以 `mask-image` 漸隱，不硬切

```css
.nd-grid-scroll {
  -webkit-mask-image: linear-gradient(to bottom,
    transparent 0, #000 56px, #000 calc(100% - 56px), transparent 100%);
          mask-image: linear-gradient(to bottom,
    transparent 0, #000 56px, #000 calc(100% - 56px), transparent 100%);
}
```

### 4.5 商品詳情（Bottom Sheet）

由上而下固定七段：

1. **大圖** — 佔 sheet 高度約 1/3，純背景無框，僅保留原生接地陰影
2. **分類列** — `DINNER · YESTERDAY`，前者 `--nd-accent`，後者 `--nd-faint`，皆 label 規格
3. **標題** — 襯線大字
4. **主數值** — 特大襯線 + 單位 label
5. **AMOUNT** — 左值右 stepper（見 4.6）
6. **分類 pill 群組** — 見 4.7
7. **MACROS / 明細** — 每列「label ⋯ 值 / 上限」+ 底部對應色細線
8. **Metadata 三欄** — `SOURCE` / `IMAGE` / `LOGGED`，全 label 規格

Sheet 頂端 4px grabber，圓角 `20px 20px 0 0`；背後頁面**不縮放**，僅 `filter` 輕微變暗。

### 4.6 Stepper

```
6  OZ                              ( − )  ( + )
```

- 值：襯線 22px + 單位 label
- 按鈕：`40px` 圓形，底色 `--nd-chip`，符號 `--nd-ink`
- 按下後所有連動數值走**數字滾動動畫**（見 5.4），不是硬切換

### 4.7 分類 Pill 群組

- 高 `32px`，`border-radius: 999px`，label 規格文字
- 未選：`--nd-chip` 底 + `--nd-muted` 字
- 選中：`--nd-chip-on` 底 + 白字 —— **實心填滿，不使用任何邊框或側邊指示條**
- 切換過渡 `160ms`

---

## 5. 動畫規格

原片的質感八成來自轉場。六種，優先級由高到低。

### 5.1 列表 ↔ 網格：共享元素 morph（最關鍵）

`--nd-dur-morph` / `--nd-ease`

- **只有商品圖是連續的**：保持完全不透明，從列表縮圖位置同時位移 + 放大到網格大圖位置
- **所有文字交叉溶解**：舊頁文字 fade-out 與新頁文字 fade-in 重疊，中途可見疊字
- 各商品圖抵達時間帶輕微 stagger（每項 `+20ms`）
- 反向切回完全對稱

實作首選 View Transitions API：

```css
/* 每個商品圖給穩定的 view-transition-name */
.nd-thumb[data-id], .nd-grid-img[data-id] { view-transition-name: attr(data-id type(<custom-ident>)); }

::view-transition-group(*) {
  animation-duration: 340ms;
  animation-timing-function: cubic-bezier(.22,1,.36,1);
}
```

不支援時 fallback 到 FLIP：切換前記錄舊 `getBoundingClientRect()`，切換後算 delta，用 `transform` 反推再 `transition` 歸零。**不要**退化成整頁 fade —— 共享元素是這個設計的識別點。

### 5.2 換頁：水平滑動 + 交叉淡出

`--nd-dur-fast` / `--nd-ease`

- 舊頁 `translateX(+12%)` + `opacity 1→0`，新頁 `translateX(-12%)→0` + `opacity 0→1`，兩頁同時可見
- 位移幅度刻意小（12% 而非 100%），讀起來是翻頁不是換畫面
- 頂部與底部固定層不參與

### 5.3 詳情 Sheet 推入

`--nd-dur-fast` / `--nd-ease`

- Sheet **內容在推入前已完成排版**，隨 sheet 整體上移
- 禁止「先出殼再填內容」的二段式（會讓 sheet 看起來在 loading）
- 關閉時反向，並支援下拉手勢

### 5.4 數字滾動（odometer）

`320ms` / `--nd-ease`

主數值與所有連動指標逐位翻滾，同時進度線 tween 延展。原片中 `290 → 348 → 406`、`34 → 41 → 48` 全部走此動畫。

```css
.nd-odo { display:inline-block; overflow:hidden; height:1em; vertical-align:-.12em; }
.nd-odo > span { display:block; transition: transform 320ms cubic-bezier(.22,1,.36,1); }
```

搭配 `font-variant-numeric: tabular-nums`，否則翻滾時寬度會跳。

### 5.5 捲動邊緣遮罩

見 4.4 的 `mask-image`。頂部總覽區**隨捲動淡出，不做 sticky**。

### 5.6 資料連動閉環

詳情頁改份量 → 關閉 sheet → 列表對應列數值**已更新**，分組彙總與所有指標同步，全程無 loading、無「儲存」按鈕。編輯即生效。

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation: none !important; }
  .nd-odo > span { transition: none; }
  /* 換頁保留 120ms opacity，其餘一律關閉位移 */
}
```

---

## 6. 商品圖資產規範

圖片是這套設計成立與否的單一決定因素。規格不達標就不要採用這個方向。

| 項目 | 要求 |
|---|---|
| 去背 | 透明 PNG / WebP，邊緣乾淨無白邊 |
| 光源 | 全站統一方向與色溫（棚拍柔光，右上打光） |
| 陰影 | 保留商品下方柔和接地陰影，**烘進圖片本身**，不用 CSS 陰影模擬 |
| 視角 | 全站統一（原片為略高於水平的 3/4 視角） |
| 尺寸 | 商品在畫布中的**相對比例要真實**——小份量的商品就該比大份量的小，不要各自填滿畫布 |
| 底色 | 圖片本身不含背景色，由頁面 `--nd-bg` 透出 |

原片在詳情頁明確標示 `IMAGE: Studio`，把圖片來源當成產品資訊的一部分揭露。

---

## 7. 值得移植的兩個資訊設計細節

1. **來源自動降級**：欄位被人工編輯過後，`SOURCE` 由 `From database` 自動變成 `Entered by hand`。低成本、高說服力的資料可信度標示。
2. **彙總即標頭**：分組標頭右側直接掛該組彙總值，使用者捲動時不需回到頂部就能對照。

---

## 8. 與現行 DESIGN.md 的差異

| 面向 | 現行（優雅暖調） | 本提案（Editorial Catalogue） |
|---|---|---|
| 容器 | 16px 圓角卡片 + 暖調陰影 | **無容器**，僅 1px 分隔線 |
| 底色 | `#faf6ef` 米杏 / `#f4ecdf` 交替 | `#F2EEE8` 單一底色，不交替分區 |
| Accent | 蜜橘 `#e86b2c`（CTA、active） | 磚紅 `#9C4432`（僅標籤與進度，**不用於 CTA**） |
| 按鈕 | pill、橘底白字 + 橘暈 | pill、**黑底白字**，無陰影 |
| 圖片 | 卡片內裁切 | 去背浮貼、不等大、不裁切 |
| 動畫 | crossfade | 共享元素 morph + 數字滾動 |

兩套系統的 accent 與容器策略互斥，**不建議混用**。若採用，建議先在單一頁面（商品詳情）完整落地驗證，再決定是否擴散到列表與首頁。

共通不變的規則：作用中／選取狀態一律用**整格直角或 pill 實心填滿**，禁止左側強調邊框。

---

## 9. 已落地範圍

已作為店面模板 `editorial`（顯示名稱「米白磚紅」）加入模板系統，方案授權 `proplus`。

**四個註冊點**

| 檔案 | 內容 |
|---|---|
| `public/assets/templates.css` | `[data-template="editorial"]` 樣式區塊 |
| `src/routes/admin/store-info.ts` | `TEMPLATES` 新增一筆（同時是 POST 的白名單） |
| `public/admin.html` | `TPL_COLORS` 色票 + `allTpls` 選擇器清單 |
| `public/platform-admin.html` | `TEMPLATES` 清單 |

模板由 `src/router.ts` 注入 `<body data-template="...">`，`default` 不注入。

**已落地**

- 全套色彩與 `--card-bg` 同底色（卡片、header 不浮出背景）
- 襯線字族、標題字距
- 商品卡去容器：無邊框、無圓角、無陰影，靠 `26px 20px` 留白分隔
- hover 不抬卡片，改為圖片 `scale(1.035)`
- 主按鈕黑底白字直角；卡片內按鈕改細框幽靈鈕
- 促銷標籤磚紅實心直角；商品列表價格近黑
- 詳情頁價格區去色塊，改上下 1px 細線；stepper／輸入框／下拉全部直角
- `prefers-reduced-motion` 保護

**未落地（受現有管線限制）**

| 項目 | 原因 |
|---|---|
| 去背商品圖浮貼 | 現行 `.product-card img` 是 `aspect-ratio: 3/4` + `object-fit: cover` 的實拍裁切圖，商品圖來自爬蟲與商家上傳，無去背管線。這是第 6 章的硬前提，未滿足前只能保留裁切呈現 |
| 共享元素 morph | 列表→詳情是跨頁導航（`store.html` → `product.html`），需要在 HTML 層加 `@view-transition` 並為每張圖派發 `view-transition-name`，會影響全部 9 個模板，不宜包在單一模板的樣式覆蓋裡 |
| 數字滾動 odometer | 需要 JS，同上，屬於跨模板的共用行為 |
| 商品名稱大寫寬字距 label | 原片為全英文 UI；本專案商品名為中文，`uppercase` 無效且大字距會破壞中文閱讀。改以「小字 + 淺灰 + 輕字距」達成同樣的階級感 |

**驗證方式**：以 `styles.css` + `templates.css` 對照渲染 default 與 editorial 兩版商品網格與詳情價格區，確認覆蓋生效且未影響其他模板（CSS 全部包在 `[data-template="editorial"]` 之下）。
