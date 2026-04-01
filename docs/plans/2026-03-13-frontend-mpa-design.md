# Japan Buy Frontend MPA Design (List + Request + Success)

## Goal

建立一個純靜態 MPA 前端，使用 Worker API 呈現商品並提交需求單，流程包含：

1. 商品列表頁 `index.html`
2. 需求單頁 `request.html`
3. 成功頁 `success.html`

## Confirmed Decisions

1. 前端型態：純靜態 MPA（非 React/Next）
2. 功能範圍：列表 + 需求單 + 成功頁
3. 圖片來源：直接使用目標頁商品圖片 URL
4. 不顯示原始目標站商品連結

## Information Architecture

## Page 1: `index.html`

1. Header
- 標題：商品列表
- 子資訊：資料最後更新時間

2. Product Grid
- 卡片欄位：圖片、名稱、品牌、價格（JPY）、分類、顏色數
- CTA：`加入需求單`

3. Draft Status
- 顯示目前已加入需求單的商品數量
- 可前往 `request.html`

## Page 2: `request.html`

1. Draft Items
- 列出已選商品
- 每項可編輯：`quantity`, `desiredSize`, `desiredColor`, `note`

2. Customer Form
- `customerName`（必填）
- `contact`（必填）
- `notes`（選填）

3. Submit Action
- 呼叫 `POST /api/requirements`
- 成功導向 `success.html?id=<requirementId>`

## Page 3: `success.html`

1. 成功訊息
2. 顯示需求單編號（query 參數 `id`）
3. 返回商品頁按鈕

## Data Contract

## GET `/api/products`

前端使用欄位：

1. `id`
2. `code`
3. `nameJa`
4. `nameZhTw`
5. `brand`
6. `category`
7. `priceJpyTaxIn`
8. `colorCount`
9. `imageUrl`
10. `lastCrawledAt`

## POST `/api/requirements`

Request:

```json
{
  "customerName": "王小明",
  "contact": "line:abc123",
  "notes": "整單備註",
  "items": [
    {
      "productId": 1,
      "productNameSnapshot": "WEB限定 ...",
      "quantity": 2,
      "desiredSize": "130",
      "desiredColor": "黑",
      "note": "希望同款"
    }
  ]
}
```

Response:

```json
{
  "ok": true,
  "requirementId": 123
}
```

## Client-side Storage

使用 `localStorage.requirementDraft` 暫存需求單內容，格式：

```json
{
  "items": [
    {
      "productId": 1,
      "productNameSnapshot": "xxx",
      "quantity": 1,
      "desiredSize": "",
      "desiredColor": "",
      "note": "",
      "imageUrl": "https://...",
      "priceJpyTaxIn": 990
    }
  ]
}
```

## Validation Rules

1. 需求單至少 1 個商品
2. `customerName` 必填
3. `contact` 必填
4. 每項 `quantity >= 1`

## Error Handling

1. 商品載入失敗：顯示重試按鈕
2. 送單失敗：保留 draft，不清空
3. 欄位驗證失敗：逐欄提示

## Responsive Rules

1. Desktop：4 欄卡片
2. Tablet：2 欄卡片
3. Mobile：1 欄卡片

## Out of Scope (Current Iteration)

1. 會員登入
2. 線上付款
3. 即時庫存同步
4. 圖片代理與壓縮管線

