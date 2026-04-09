# Pixel Octopus Loading Animations

vovosnap 使用統一的像素風格大頭章魚角色作為 AI 功能的 loading 動畫。
三個場景各有獨立造型（帽子 + 道具 + 瞳孔行為），但共用同一角色基礎。

---

## 角色基礎

| 屬性 | 規格 |
|---|---|
| 風格 | Pixel art（`image-rendering: pixelated`） |
| 身體色 | `#7B68EE`（主色）/ `#6A5ACD`（觸手深色）/ `#8B7BEE`（觸手末端亮色） |
| 眼睛 | 眼白 16×18px，瞳孔 13×15px（大瞳孔佔比） |
| 腮紅 | `#FF8FAB` 帶呼吸脈動 |
| 嘴巴 | 弧形微笑 `#5a4abf`，帶呼吸動畫 |
| 觸手 | 6 隻，各自不同頻率擺動（1.1s~1.8s） |
| 浮動 | 整體上下浮動 `octopusFloat 2.5s` |
| 底部文字 | "vovosnap" pixel 字型 |

---

## 三種場景

### 1. 相機辨識（recognize-loading）

> 用於拍照上架時的 AI 辨識階段

| 項目 | 說明 |
|---|---|
| 帽子 | 棕色偵探帽 `#A0782A`，前方有帽簷突出 |
| 道具 | 右前觸手拿像素相機，閃光燈每 3 秒閃一次 |
| 瞳孔動畫 | `rcPupil` 4s 循環：正面 → 右看 → 下看螢幕 → 回正 |
| 眨眼 | `rcBlink` 每 5 秒自然眨眼 |
| keyframe 前綴 | `rc` |

**檔案位置：** `public/admin.html` — `#recognize-loading .octopus-anim`

### 2. AI 產生文案（marketing-loading）

> 用於行銷文案 AI 生成階段

| 項目 | 說明 |
|---|---|
| 帽子 | 桃紅色貝雷帽 `#E84393`，頂部有小毛球 |
| 道具 | 左前觸手拿筆並有寫字動畫，旁邊漂浮紙稿 |
| 瞳孔動畫 | `mkPupil` 5s 循環：正面 → 上看思考 → 右看 → 左下看稿 → 回正 |
| 眨眼 | `mkBlink` 每 4.5 秒自然眨眼 |
| keyframe 前綴 | `mk` |

**檔案位置：** `public/admin.html` — `#marketing-loading .octopus-anim`

### 3. 圖片優化（ai-image-edit-popup）

> 用於 AI 圖片優化的 modal popup

| 項目 | 說明 |
|---|---|
| 帽子 | 深紫色魔法師帽 `#5B45E0`，帽上有黃色星星 |
| 道具 | 右前觸手揮魔杖，三色星星飛濺（黃/紅/藍） |
| 瞳孔動畫 | `imPupil` 5s 循環：持續往下看作品，左右微移 |
| 眨眼 | `imBlink` 每 5.5 秒自然眨眼 |
| keyframe 前綴 | `im` |

**檔案位置：** `public/admin.html` — `#ai-image-edit-popup .octopus-anim`

---

## 動畫清單

每個場景的 keyframe 都加了獨立前綴避免衝突：

| 動畫類型 | 辨識 (`rc`) | 文案 (`mk`) | 圖片 (`im`) |
|---|---|---|---|
| 眨眼 | `rcBlink` 5s | `mkBlink` 4.5s | `imBlink` 5.5s |
| 瞳孔 | `rcPupil` 4s | `mkPupil` 5s | `imPupil` 5s |
| 腮紅 | `rcCheek` 2.5s | `mkCheek` 2.5s | `imCheek` 2.5s |
| 微笑 | `rcSmile` 2.5s | `mkSmile` 2.5s | `imSmile` 2.5s |
| 觸手 L1~L3 | `rcTentL1~L3` | `mkTentL1~L3` | `imTentL1~L3` |
| 觸手 R1~R3 | `rcTentR1~R3` | `mkTentR1~R3` | `imTentR1~R3` |
| 帽子彈跳 | `rcHatBob` 2.5s | `mkHatBob` 2.5s | `imHatBob` 2.5s |
| 道具動畫 | `rcCamFlash` 3s | `mkPenWrite` 1.2s | `imWand` 1.5s / `imSparkle` 1s |

---

## CSS 共用

定義在 `public/assets/admin.css`：

```css
.octopus-anim {
  display: flex;
  justify-content: center;
  padding: 8px 0;
}

.octopus-anim svg {
  animation: octopusFloat 2.5s ease-in-out infinite;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}

@keyframes octopusFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
```

---

## 修改指南

- 新增場景時，複製任一 SVG 為基礎，更換帽子/道具/瞳孔動畫
- keyframe 前綴必須唯一，避免與其他場景衝突
- 瞳孔大小維持 13×15（眼白 16×18），保持大眼可愛比例
- 道具動畫綁定在特定觸手的 `<g>` 內，隨觸手擺動同步
