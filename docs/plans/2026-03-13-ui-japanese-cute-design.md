# Japan Buy UI Design: Natural & Minimal Cute (Soft Paper Style)

## Goal
為 Japan Buy 前端 MPA 介面設計一套具有「日式清新自然」風格並帶有「手繪圖示與微動畫」可愛元素的 UI，提升使用者體驗與親和力。其中所需的插圖將使用 Gemini Imagen API (Nano Banana Pro skill) 生成。

## 1. 視覺語彙與共同元件 (Visual Language & Shared UI)

- **核心概念 (Core Concept)**：柔軟紙張 (Soft Paper)，卡片無明顯邊框而是輕柔的陰影，宛如放在桌上的紙張。
- **色彩配置 (Color Palette)**：
  - **主背景**：非常淺的米黃/米白色 (`#F9F7F1`)，如無漂白紙張。
  - **卡片底色**：純白 (`#FFFFFF`)，帶有非常柔和的淡褐色/灰色陰影，彷彿紙張浮起 (`box-shadow: 0 4px 12px rgba(160, 150, 140, 0.1)`)。
  - **強調色**：抹茶綠 (`#8A9A5B`) 或櫻花粉 (`#FFD1DC`)，用於按鈕、狀態標籤或 Hover 提示。
  - **文字色**：深褐色或炭灰色 (`#4A4A4A`)，取代純黑，更顯溫潤。
- **字體 (Typography)**：
  - 主要使用無襯線圓體（如 `Zen Maru Gothic`、`Kiwi Maru` 或 `Noto Sans TC` 搭配較大的 `font-weight` 圓潤感），增加手感與親和力。
- **UI 元件設計與動畫 (UI & Micro-animations)**：
  - **按鈕**：全圓角 (pill shape, `border-radius: 999px`)，無邊框。Hover 時會有微小的向上一跳（Y軸位移 -2px）並加深陰影的果凍動畫 (Jelly bounce)。點擊時有凹陷感 (scale: 0.95)。
  - **圖示**：使用 AI 生成或線條粗細不均勻的「手繪風」圖示（如購物車、勾勾、返回箭頭）。Hover 時圖示自身輕微晃動 (Wiggle: rotate(-5deg) to rotate(5deg))。

## 2. 頁面具體佈局設計 (Page Layouts)

### Page 1: 列表頁 (`index.html`)
- **Header**: 
  - 手繪風標題「🎌 日系雜貨代購」。
  - 購物車圖示 (帶有懸浮小紅點表示已選數量，數字採用圓潤字體)。
- **商品網格 (Product Grid)**: 
  - 網格照片以大圓角 (border-radius: 12px) 呈現。
  - 卡片佈局為垂直堆疊，圖片下方是商品資訊，區塊間距適中留白 (Airy space)。
  - 價格與標籤採用手寫體的數字與抹茶綠小色塊。
  - **加入清單 (CTA)**: 櫻花粉或抹茶綠的可愛膠囊按鈕。點擊時按鈕會有微彈跳動畫，隨後顯示「已加入」狀態。

### Page 2: 需求單頁 (`request.html`)
- **Header**: 
  - 左側「⬅️ 返回列表」的手繪箭頭按鈕。
  - 標題旁點綴一支手繪羽毛筆或信封小圖示。
- **清單區塊**: 
  - 以多張水平橫向的「單行紙卡」羅列商品，左側小縮圖，右側是商品名與修改欄位。
  - 數量調整鈕 (`-` / `+`) 圓潤可愛，點擊有按壓微凹效果。
- **表單區塊**: 
  - 輸入框 (Input/Textarea) 背景為很淡的淺米色 (`#FFFBF5`)，圓角邊框 (`border-radius: 8px`)。
  - 聚焦 (Focus) 時，邊框變成手繪筆刷風格的粉色或綠色 (`outline: 2px solid #8A9A5B`)，帶有輕微發光。
- **提交鈕**: 
  - 寬大且圓潤的「送出需求 ✉️」主按鈕。點擊後按鈕文字變為「飛送中...」並有信封飛出的微動畫或加載中的三個跳動圓點。

### Page 3: 成功頁 (`success.html`)
- **主要畫面**: 
  - 畫面正中央出現一個大型的手繪可愛插圖，這將使用 Gemini 的生成圖片功能產生（例如：一隻叼著信封的柴犬/貓咪，或一個打勾勾且綁著緞帶的禮物盒，風格指定為日系手繪水彩或極簡線條插畫）。
- **訊息**: 
  - 溫暖有禮的日式問候語「ありがとうございます！需求單已送出」。
  - 以手寫風格字體顯示單號，配上淡色的重點螢光筆背景效果。
- **返回按鈕**: 
  - 「回首頁繼續逛逛」，帶有簡單的上下持續彈跳引導動畫 (Bouncing animation)，吸引用戶點擊。

## 3. 實作規範 (Implementation Notes)
- 將共用的 CSS 變數 (`--primary-color`, `--bg-color`, `--text-color` 等) 提取至 `styles.css` 的 `:root` 中。
- **圖片生成**: 使用 `nano-banana-pro` 技能生成所需的吉祥物/裝飾性圖片 (例如成功頁的柴犬插圖)。生成的圖片將存放在 `public/assets/images/` 供前端使用。
- 動畫一律使用 CSS `@keyframes` 實作，確保效能輕量，無需引入大型動畫函式庫。
