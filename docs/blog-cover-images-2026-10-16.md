# 2026-10-16 新增文章封面圖

依使用者要求，為 Claude 新增的 10 篇繁中文章製作獨立封面。使用內建 imagegen；沿用既有暖色自然光、木質桌面、米色與鼠尾草綠的寫實攝影風格。圖片為 AI 生成情境示意，非實際產品操作截圖。

網站資產為 1200 × 630 WebP，品質 83，原始 PNG 保留於工具的 generated_images 目錄。文章首圖、Open Graph、Twitter、Article schema 與部落格資料表同步引用各篇新圖，重建靜態部落格索引。

驗證完成：319 項測試通過；10 篇文章與新圖本機載入正常，圖片尺寸及各入口引用一致；桌面索引與手機文章頁已目視檢查。文章內文未修改，尚未推送或部署。

## 圖片清單

| 文章 | 圖片 | 大小 |
|---|---|---|
| [在 Facebook 社團和 Threads 賣東西，商店連結怎麼分享比較不會被洗掉？](../public/blog/facebook-threads-store-link-sharing.html) | [og-facebook-threads-store-link-sharing.webp](../public/assets/images/blog/og-facebook-threads-store-link-sharing.webp) | 85.2 KiB |
| [網路賣東西一定要接受七天退貨嗎？例外商品與退款期限整理](../public/blog/online-shop-returns-seven-day-rule.html) | [og-online-shop-returns-seven-day-rule.webp](../public/assets/images/blog/og-online-shop-returns-seven-day-rule.webp) | 69.4 KiB |
| [商品照片怎麼拍，AI 辨識比較準？三張照片的拍法](../public/blog/product-photo-tips-ai-recognition.html) | [og-product-photo-tips-ai-recognition.webp](../public/assets/images/blog/og-product-photo-tips-ai-recognition.webp) | 77.7 KiB |
| [泰國代購怎麼做？泰銖定價、選品與賣給台灣客人的流程](../public/blog/thailand-daigou-guide.html) | [og-thailand-daigou-guide.webp](../public/assets/images/blog/og-thailand-daigou-guide.webp) | 117.2 KiB |
| [住在海外，想開店賣東西給台灣客人，要準備什麼？](../public/blog/overseas-seller-sell-to-taiwan.html) | [og-overseas-seller-sell-to-taiwan.webp](../public/assets/images/blog/og-overseas-seller-sell-to-taiwan.webp) | 89.7 KiB |
| [代購食品、化粧品、藥品能不能賣？出國帶回轉售的規定與罰則](../public/blog/daigou-food-cosmetics-medicine-rules.html) | [og-daigou-food-cosmetics-medicine-rules.webp](../public/assets/images/blog/og-daigou-food-cosmetics-medicine-rules.webp) | 72.2 KiB |
| [出國代購帶回台灣，免稅額 3 萬 5 千元能用嗎？菸酒與申報規定整理](../public/blog/taiwan-customs-duty-free-daigou.html) | [og-taiwan-customs-duty-free-daigou.webp](../public/assets/images/blog/og-taiwan-customs-duty-free-daigou.webp) | 96.3 KiB |
| [代購要辦稅籍登記嗎？每月銷售額門檻與代購發票怎麼開](../public/blog/daigou-tax-registration-threshold.html) | [og-daigou-tax-registration-threshold.webp](../public/assets/images/blog/og-daigou-tax-registration-threshold.webp) | 93.3 KiB |
| [代購訂單怎麼整理？從聊天紀錄改成用訂單狀態管理](../public/blog/daigou-order-management-status.html) | [og-daigou-order-management-status.webp](../public/assets/images/blog/og-daigou-order-management-status.webp) | 83.0 KiB |
| [剛開好網路商店，第一週該做哪些事？七個設定與上架步驟](../public/blog/new-store-first-week-checklist.html) | [og-new-store-first-week-checklist.webp](../public/assets/images/blog/og-new-store-first-week-checklist.webp) | 83.1 KiB |

## 生成提示詞

每張使用以下共用風格，加上個別場景。

```text
Use case: photorealistic-natural. Asset type: editorial blog cover for VOVOSnap, a Taiwan small-seller ecommerce platform. Generate ONE standalone landscape photo, exact 1200x630 aspect ratio (40:21) if possible; compose with generous crop-safe margins for this ratio. Match a consistent existing photography series: genuine cozy small-business workspaces, warm natural window light from the left, oak wood desks, cream plaster walls, linen curtains, muted sage green and sand-beige palette, restrained terracotta accents, tactile natural materials. Documentary editorial photography, realistic hands and objects, moderate depth of field, crisp main subject with soft background, warm but not orange grading, no glossy stock-photo smile. No text overlays, no logos, no watermarks, no readable screen text, no fake UI lettering, no graphics, no collage, no borders. Screens must show understated abstract thumbnails and lines only. The scene is an illustrative situation, not a real product UI screenshot. Wide horizontal framing.
```

### facebook-threads-store-link-sharing

```text
Scene: Social media selling and sharing a storefront link. Close over-the-shoulder view of a Taiwanese woman in her early thirties seated at her small home shop desk, a smartphone in one hand showing abstract social feed cards and a laptop displaying a simple grid of small bags and ceramic homewares. A canvas tote and a ceramic cup ready to photograph rest on the oak table. Focus on the human act of selecting a product to share, not a giant screen. No actual platform logos.
```

### online-shop-returns-seven-day-rule

```text
Scene: An online shop handling a customer return carefully. Close documentary photograph of a Taiwanese woman's hands opening a small returned kraft cardboard parcel on an oak desk and inspecting a neatly folded cream cotton cardigan. Tissue paper and a blank return slip beside the parcel, a laptop softly blurred in background. Thoughtful calm atmosphere, goods undamaged, no angry customer, no law symbols, no gavel.
```

### product-photo-tips-ai-recognition

```text
Scene: Taking clear product photos for AI-assisted listing. Side-angle editorial photograph of a Taiwanese seller holding a smartphone with both hands to photograph a small unbranded cream canvas handbag standing on a sheet of off-white paper on an oak table by a window. A small sewn fabric label and stitching clearly visible on the handbag; laptop with abstract photo thumbnails in the distant background. Hands and phone anatomy accurate, camera aimed at the actual bag, not at person.
```

### thailand-daigou-guide

```text
Scene: A small seller preparing Thai handmade goods for an online store. Beautiful natural documentary still life on an oak packing desk: a woven natural raffia handbag, neatly folded pale sage and oatmeal linen garments, a tiny ceramic dish, a cloth measuring tape beside the bag, an open kraft carton. Taiwanese seller's hands gently measuring the woven bag. Soft tropical plant leaves and bright linen curtains in background. Subtle Thai craft material cues, no flags, no temples, no tourism collage.
```

### overseas-seller-sell-to-taiwan

```text
Scene: An overseas independent seller preparing a parcel for Taiwan customers. Taiwanese woman at a warm oak desk folding a canvas accessory into tissue paper inside an open kraft shipping box, a small travel suitcase blurred near the wall and a laptop showing a simple abstract storefront grid. Beside the box a blank shipping label and packing tape. Intimate realistic home business, understated cross-border shipping conveyed through packing and suitcase, no maps, no flags, no fake carriers.
```

### daigou-food-cosmetics-medicine-rules

```text
Scene: Checking imported product labels before deciding whether goods may be resold. Close editorial scene of a Taiwanese seller's hands carefully examining the back ingredient label of an unbranded skincare carton on an oak desk. On table, separate plain packaged snack pouch, a cream cosmetic pump bottle, a closed small plain pharmacy-style carton, notebook and laptop with abstract document layout. Labels have neutral abstract marks without readable claims. Careful verification, all packages closed, no pills loose, no product consumption, no medical efficacy imagery, no gavel.
```

### taiwan-customs-duty-free-daigou

```text
Scene: Preparing purchased goods and records before arriving at customs. A realistic quiet travel packing scene at an oak table: an open sand-colored carry-on suitcase containing folded neutral clothes and one woven bag, several simple purchase receipts spread neatly on table, an unbranded calculator and closed plain passport-sized booklet. Taiwanese woman's hands sorting the receipts. Domestic interior by a window, no airport checkpoint, no officers, no tobacco or alcohol, no currency closeups. Conveys travel goods and declaration preparation.
```

### daigou-tax-registration-threshold

```text
Scene: A small shop owner organizing monthly sales records for tax registration. Over-the-shoulder close editorial photo of a Taiwanese woman checking a paper ledger with an ordinary desktop calculator on a warm oak desk; laptop displays abstract simple rows of sales entries. Neatly grouped receipts and a few kraft envelopes, one small packed shipping box in background. Calm honest bookkeeping, no prominent numbers, no money stacks, no official stamps or tax office logos.
```

### daigou-order-management-status

```text
Scene: Managing customer orders and preparing shipments in a small home shop. Three modest kraft parcels in a tidy line on an oak table, each with a small unlettered cream, sage or terracotta sticker; Taiwanese seller seated behind them checking a laptop with an abstract organized order list, one hand resting naturally on trackpad. Folded clothing and packing tape to the side. Focus on organized parcels and daily order handling, no conveyor belt, no giant warehouse.
```

### new-store-first-week-checklist

```text
Scene: The first week setting up an independent online shop at home. Wider editorial photograph of a Taiwanese woman arranging her first small collection of products on a warm oak desk: a canvas tote, a ceramic mug and two neatly folded cotton garments. Laptop shows a clean abstract storefront product grid; an open notebook with small hand-drawn empty checkboxes and a pencil beside it. Sunlit home work corner with linen curtains and a leafy plant. Modest approachable new beginning, no triumphant pose, no large warehouse.
```

## 法規改寫後的三張替換圖

同日依 Claude 改寫後的內容，以內建 imagegen 重新生成 3 張暖色寫實情境圖，套用至 5 個頁面。保留原圖檔，改用新檔名避免舊圖片快取；首圖、分享圖、Article schema 與現有列表縮圖均更新。此輪未修改文章正文。

| 原圖 | 新圖 | 大小 | 場景 |
|---|---|---|---|
| `hero-daigou.webp` | [hero-daigou-general-goods.webp](../public/assets/images/blog/hero-daigou-general-goods.webp) | 102.0 KiB | 賣家在日本生活用品店核對文具與布製小物，確認選品資料的情境示意 |
| `og-japan-cosmetics-photo-listing.webp` | [og-japan-product-listing-review.webp](../public/assets/images/blog/og-japan-product-listing-review.webp) | 94.3 KiB | 賣家先核對商品來源文件，再整理拍照上架資料的情境示意 |
| `og-japan-drugstore-batch-recognition.webp` | [og-japan-store-batch-recognition.webp](../public/assets/images/blog/og-japan-store-batch-recognition.webp) | 77.3 KiB | 賣家在日本文具店將商品分開，逐件以手機拍攝的情境示意 |

共用首圖套用至日本藥妝法規指南、日本代購實戰、新手代購教學；另外兩張分別用於上架前資格核對與日本商店批次辨識文章。

驗證：319 項測試通過；靜態部落格索引檢查通過；5 個頁面與 3 張新圖本機載入正常，圖片均為 1200 × 630，Open Graph 與 Twitter 引用一致；桌面指南與手機文章頁已目視檢查。先前 10 張新封面引用仍正確。尚未推送或部署。

### 替換圖共用提示詞

```text
Use case: photorealistic-natural. Asset type: VOVOSnap Traditional Chinese ecommerce editorial cover. Generate ONE standalone landscape photograph, aspect ratio exactly 40:21 (1200x630 composition), with crop-safe margins. Match the existing cover series: warm soft natural window light, realistic oak wood and tactile linen, restrained cream, sand beige, sage green and muted warm brown palette. Authentic cozy independent seller atmosphere, refined documentary photography, high realism, natural human posture and anatomically accurate hands, crisp subject and gently defocused background. No title overlays, graphic designs, collages, dramatic stock-photo posing, giant interfaces, text, logos, watermarks or borders. Any document or screen content must be subtle abstract lines, unlettered cards and simple thumbnails, not fake readable words. This is a lifestyle illustration, not an actual screenshot or a claim of legal certification.
```

### hero-daigou-general-goods.webp

```text
Scene: A Taiwanese independent seller choosing ordinary Japanese stationery and textiles in a small Japanese lifestyle store. Three-quarter rear view of an adult woman in cream linen clothing at a warm oak display table, carefully looking at a plain notebook and a folded cotton pouch. On the table are orderly paper notebooks, wooden pencils, unbranded washi paper rolls, cloth pencil cases and one folded linen tote; background wooden shelves with understated stationery and cotton bags, softly blurred. She holds a small simple purchase-note clipboard as she checks the goods, subtle thoughtful selection rather than impulsive shopping. Elegant everyday retail setting, natural daylight through the store window. Entire scene contains only stationery, textile accessories and plain paper records. This versatile cover is shared by articles about choosing saleable goods, checking resale eligibility and beginning Japanese purchasing. No foods, drinks, cosmetics, skincare, medicines, drugstore shelves, character merchandise, tax-free signage, airport, visible branding or readable text.
```

原始 PNG：`/home/ivan-bai/.codex/generated_images/01a143f9-2a1e-7880-9dfc-119834cccbd6/exec-9ec14586-6d80-4741-8f13-047792a64711.png`。

### og-japan-product-listing-review.webp

```text
Scene: Checking product sourcing documents before photographing and listing an item. Intimate photoreal editorial view from above and slightly over the shoulder of an adult Taiwanese woman at an oak home-business desk. Her left hand holds a simple supplier invoice with only abstract gray ruled lines, her right hand rests naturally on the laptop trackpad. A neatly folded cream cotton pouch and a plain notebook sit beside a smartphone lying flat ready to photograph; laptop shows a clean abstract product information form and one thumbnail of that same cotton pouch. Focus on the invoice, hands and actual product together, suggesting source verification before publishing. A leafy plant and linen curtain softly blurred behind, warm natural daylight. Only stationery/textile goods. No beauty bottles, medicines, food, legal stamps, official approval badges, seals, gavel, readable document text or exact product UI.
```

原始 PNG：`/home/ivan-bai/.codex/generated_images/01a143f9-2a1e-7880-9dfc-119834cccbd6/exec-d0d7f81a-a2a0-4ea7-afd6-4e6ea224a1eb.png`。

### og-japan-store-batch-recognition.webp

```text
Scene: Photographing a group of ordinary Japanese shop items one product at a time. Side-angle documentary photograph inside a warm Japanese stationery and lifestyle shop. An adult Taiwanese seller wearing an oatmeal linen shirt holds a smartphone horizontally with two realistic hands and photographs one single small sage cotton pencil case centered on a clear section of an oak counter. Three other separate items, a blank paper notebook, a cream cloth tote and an unbranded roll of decorative paper tape, wait neatly at the far side outside the phone's framing. Phone screen shows only that one pencil case, not a collage. Soft-focus wooden shelves of notebooks and fabric accessories in background. Quiet organized small-scale work, warm window light. No crowded drugstore shelves, no pills, foods, beauty packaging, price text, signs, logos, watermarks or multiple products on the phone screen.
```

原始 PNG：`/home/ivan-bai/.codex/generated_images/01a143f9-2a1e-7880-9dfc-119834cccbd6/exec-77a56d7a-bac6-46bd-8599-483ffe5d63f4.png`。
