# Plan Offer Unification Design (Landing + Platform Admin)

## Goal

Unify paid plan discount rules so that:

- Landing page pricing cards no longer hardcode long-term discount strings.
- "Plan Offer" popup explains Starter + Pro discounts.
- Platform admin plan assignment modal and billing math use the same rule source.
- 12-month purchase includes +30 bonus days for both Starter and Pro.

## Scope

1. Landing page (`public/index.html`)
   - Replace inline Starter discount text with clickable "方案優惠" entry.
   - Add Pro "方案優惠" entry.
   - Add popup modal with Starter + Pro offer details.

2. Public API (`src/index.ts`)
   - Add `GET /api/plan-offers` that returns canonical offer definitions.

3. Platform admin (`public/platform-admin.html`)
   - Replace ad-hoc Starter-only options and Pro month-input pricing logic.
   - Both Starter and Pro use offer options from the unified rules.
   - Expiry (`days`) and revenue amount (`amount`) are calculated from selected offer.

4. Shared rule module
   - Introduce shared offer config + helpers in `src/shared/plan-offers.js`.

## Canonical Rules

- Starter:
  - 1 month: 30 days, NT$980
  - 6 months: 180 days, NT$5,280 (NT$880/month)
  - 12 months: 390 days, NT$8,160 (360 + bonus 30)

- Pro:
  - 1 month: 30 days, NT$1,580
  - 6 months: 180 days, NT$8,880 (NT$1,480/month)
  - 12 months: 390 days, NT$15,360 (NT$1,280/month, + bonus 30)

## Data Flow

1. Frontend fetches `GET /api/plan-offers`.
2. Landing popup renders Starter + Pro from API response.
3. Platform admin modal renders options from API response.
4. On confirm, selected option sends `{ action, days, amount, plan_expires_at }`.
5. Existing backend update + revenue log storage continues unchanged.

## Backward Compatibility

- If `plan-offers` fetch fails, UI uses local fallback equal to canonical defaults.
- Existing `PATCH /api/platform-admin/stores/:id` body contract remains valid.

## Test Plan

- Unit tests for offer helpers:
  - retrieval by plan
  - 12-month bonus days for Starter + Pro
  - amount/day mapping correctness
- Regression run of current test suite.
