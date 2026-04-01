# Japan Buy UI Japanese Cute Design Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the "Natural & Minimal Cute (Soft Paper Style)" UI design for the Japan Buy frontend, including AI-generated mascot images.

**Architecture:** Pure static MPA (HTML/CSS/JS) served by Cloudflare Workers. We will use plain CSS for styling and the Gemini Imagen API (nano-banana-pro) to generate a cute mascot image.

**Tech Stack:** HTML5, Vanilla CSS, Gemini Imagen API (nano-banana-pro)

---

### Task 1: Generate the Success Page Mascot Image

**Files:**
- Create: `workers/public/assets/images/success-shiba.png`

**Step 1: Call Nano Banana Pro API**

Run the AI agent with the `nano-banana-pro` skill. Request an image with the prompt: "A Japanese hand-drawn watercolor style or minimalist line art cute shiba inu carrying a letter in its mouth, white background".

**Step 2: Save the image**

Ensure the generated image is saved to `workers/public/assets/images/success-shiba.png`.

**Step 3: Commit**

```bash
git add workers/public/assets/images/success-shiba.png
git commit -m "feat: add ai-generated shiba mascot image"
```

### Task 2: Setup CSS Variables and Base Styles

**Files:**
- Modify: `workers/public/assets/styles.css`

**Step 1: Update CSS**

Add CSS variables for the color palette, typography, and card shadows. Define `@keyframes` for the `jelly-bounce` and `wiggle` animations.

**Step 2: Apply Base Styles**

Update `body` styles to use the new font and background color. Create utility classes for `.card`, `.btn-pill`, `.input-cute`, etc.

**Step 3: Commit**

```bash
git add workers/public/assets/styles.css
git commit -m "feat: add japanese cute style css variables and base styles"
```

### Task 3: Update Index Page UI

**Files:**
- Modify: `workers/public/index.html`

**Step 1: Update Structure**

Update the header with hand-drawn SVG icons. Apply the new `.card` classes to the product grid and the `.btn-pill` to CTA buttons.

**Step 2: Check layout in browser**

Serve to verify layout manually.

**Step 3: Commit**

```bash
git add workers/public/index.html
git commit -m "feat: update index.html to cute ui design"
```

### Task 4: Update Request Page UI

**Files:**
- Modify: `workers/public/request.html`

**Step 1: Update Layout**

Style the form inputs with soft backgrounds and colored focus rings. Style the list of items as horizontal cards.

**Step 2: Check layout in browser**

Serve to verify layout manually.

**Step 3: Commit**

```bash
git add workers/public/request.html
git commit -m "feat: update request.html to cute ui design"
```

### Task 5: Update Success Page UI

**Files:**
- Modify: `workers/public/success.html`

**Step 1: Add Mascot & Animation**

Insert the `<img src="/assets/images/success-shiba.png" />` tag. Center the layout. Apply the bouncing animation to the return button.

**Step 2: Check layout in browser**

Serve to verify layout manually.

**Step 3: Commit**

```bash
git add workers/public/success.html
git commit -m "feat: update success.html to cute ui design"
```
