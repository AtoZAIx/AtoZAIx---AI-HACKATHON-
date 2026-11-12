# AtoZAIx

**Discover. Negotiate. Verify. Pay.** An AI-to-AI agentic commerce platform. A buyer agent turns a chat, voice or image request into a structured brief, negotiates with three independent (simulated) merchant agents, verifies the agreed terms deterministically, and hands the customer a PayPal checkout for exactly those terms. Payment is confirmed only after server-side verification.

## Quick start

```bash
npm install
cp .env.example .env.local   # everything is optional
npm run dev                  # http://localhost:3000
```

With no keys, the full flow runs on deterministic policy agents and a **payment simulator** that mirrors PayPal Orders v2 (create → approve → capture → signed webhook) without moving money.

| Set | Unlocks |
| --- | --- |
| `GEMINI_API_KEY` | Gemini intent parsing, Gemini-steered merchant moves (clamped by policy), narrated recommendations, product-photo recognition |
| `PAYPAL_CLIENT_ID` + `PAYPAL_CLIENT_SECRET` | Real PayPal Sandbox checkout (JS SDK v6, Orders API v2) and wallet eligibility |
| `PAYPAL_WEBHOOK_ID` (+ public URL to `/api/paypal/webhook`) | PayPal webhook signature verification |
| `NEXUS_MERCHANT_PASSCODE_<ATELIER\|BOLT\|COVE>` | Merchant workspace passcodes (dev falls back to `nexus-dev`; production has no fallback) |

## Product map

The menu has four main places (Home, Browse, My deals, Orders) plus a "New request" button. Everything else sits under **More**. Every purchase shows a five-step guide: Tell us → Agents negotiate → Pick a deal → Approve & pay → Done. The agent-by-agent log and technical details are one click away rather than on screen by default.

| Area | Route | What it does |
| --- | --- | --- |
| Home | `/` | Search box (type, speak, photo, budget), suggested requests, "How it works" in four steps, and "Continue where you left off" with the next action for each request |
| Browse | `/discover` | Catalogue with merchant list prices and stock; negotiate any model |
| Voice | `/voice` | Full-screen voice commerce: idle, listening, transcribing, processing, negotiating, speaking, interrupted, error. Real mic waveform, editable transcript, mute and replay |
| Meet the agents (More) | `/agents` | Agent cards with status, capabilities and real activity, plus the network graph |
| My deals | `/negotiations`, `/negotiations/[id]` | Each request with its next step. The deal page shows live progress, then "Our pick" and the other offers with one button each; the full agent log expands on demand |
| Deals | `/deals`, `/deals/[id]` | Side-by-side comparison with transparent scoring; reliability is shown as unscored, not invented |
| Verification | `/verification`, `/verification/[id]` | PASSED / FAILED / UNKNOWN checks across 12 categories, with evidence and timestamps, plus the signed mutual agreement |
| Orders | `/orders`, `/orders/[id]` | Filters (All, Pending, Confirmed, Failed, Refunded, Disputed); purchase approval → PayPal checkout → receipt |
| Payments | `/payments`, `/payments/[id]` | Lifecycle (created → captured, failed, refunded, disputed), IDs, capture, webhook verification |
| Wallet | `/wallet` | Eligible PayPal methods via the SDK (sandbox only) |
| Insights (More) | `/analytics` | Metrics computed only from stored records, with empty states |
| Merchant workspace | `/merchant` | Role-restricted: cost, asking/max/min price, profit and margin floors, discount cap, concession and campaign budgets, incentive allocation, profit protection, budget ledger, negotiation history |
| How it works (More) | `/how-it-works` | Two-minute overview for judges and new visitors: the problem, the deal flow, six enforced guarantees, who benefits, and a live panel showing what is switched on (AI, PayPal mode) with counts from real activity |
| Settings / Help | `/settings`, `/help` | Preferences, live integration status, FAQ |

## Catalogue

32 real products from Apple (MacBook Air/Pro, iPhone 17/17 Pro/17 Pro Max/16e, iPad, AirPods, Studio Display), Samsung (Galaxy S25/S25 Ultra/A56, Tab S10 FE, Buds3 Pro), Google (Pixel 10/10 Pro), Dell (XPS 14, UltraSharp), Lenovo (ThinkPad X1 Carbon, Legion 5i), ASUS (ROG Zephyrus G14, Zenbook 14), HP, Microsoft Surface, Acer, Sony, Bose and LG, in `src/lib/nexus/catalog.ts`. Prices and specs are approximate demo values, and the three stores selling them are simulated.

Shoppers can name a brand or line ("a MacBook Pro", "Samsung phone", "Pixel") and it becomes a must-have: stores without it bow out. Soft wording ("ideally Dell or Lenovo") is treated as a preference. Exact models ("iPhone 17 Pro Max", "Sony xm6") are matched by name and aliases.

**Product photos:** none are bundled. Brand logos and manufacturer photos are trademarked and copyrighted, so the tiles show the brand name instead. To use photos you're licensed to use, put them in `public/products/` and set `image: "/products/<file>"` on the product in `catalog.ts`; the tile switches to the photo automatically.

## Testing card payments

In demo mode, checkout offers **Pay with PayPal** or **Pay with debit or credit card**. The card option follows PayPal's Payflow "Test transactions" guide (`src/lib/nexus/payments/test-cards.ts`):

- **Test cards:** only PayPal's published test numbers work (e.g. `4111 1111 1111 1111`); anything else returns RESULT 23. Expiry must be a future MMYY; `0298` (Feb 1998) returns 24.
- **Processor tables:** the collapsed *Test settings* panel picks the processing platform. *PayPal (Payflow Simulator)* approves up to $10,000, and special amounts force results (10422 Referral, 10504 CVV2 mismatch…). American Express, Elavon, FISERV North/Nashville, Global Payments, Paymentech Salem/Tampa, TSYS and Vantiv approve up to $1,000. From $1,001 to $2,000 they return amount − 1000 if that code is in the processor's list (else 12), and decline above $2,000. The form predicts the result for the order's amount.
- **Code 25:** card types the store doesn't accept, and HSA/FSA cards on any processor except Paymentech Salem.
- **CVV2MATCH and AVS:** follow the guide's tables and show as advisory payment checks. Options make the processor decline on a CVV mismatch (RESULT 12, no CVV2MATCH) or enforce **AVS Deny** (RESULT 112).
- **Litle Account Updater:** when enabled, the listed cards and expiry dates are refreshed before the transaction is processed, by amount: $500–$999.99 both, $400–$499.99 card number, $300–$399.99 expiry. CCUPDATED, the new last four and the new expiry are recorded.
- A decline leaves the order open to retry. Only brand and last four digits are stored; full numbers and security codes are never saved or logged.
- **Not simulated:** results that need raw Payflow API parameters this checkout never sends (1 PWD, 2 TENDER, 3 TRXTYPE, 7/19 ORIGID, 22/113 ACH, 29 XMLPay, 101 timeout, 105/108/111 credit/void/capture of authorizations).

With PayPal Sandbox credentials, checkout instead shows PayPal's own button plus its **debit or credit card** (guest) button. There, use PayPal's Sandbox card generator; Payflow test cards don't apply to the Orders v2 API.

## Trust model

- **Budget privacy.** Merchants see only a target about 18% under your spending limit.
- **Policy-bound agents.** A merchant's minimum is the strictest of its minimum selling price, cost + minimum profit, minimum margin, discount cap and remaining concession budget, plus incentive costs. Gemini moves are clamped to it; paused merchants decline.
- **Agent limit.** Agents only ever use a share of a store's maximum discount (`agentLimitPct`, 80% by default): with a 50% maximum they never go past 40%. This is part of the minimum above, so it binds every offer, counter and price match.
- **Mutual deal, for every negotiation.** Each store opens at its opening discount (`openingDiscountPct`) and, over up to three rounds at its own pace, settles halfway between that and the buyer agent's ask, within the agent limit and every floor. The ask is the shopper's own ("MacBook Air, 10% off") or the agent's standard 20%, whichever is higher, so naming a discount never makes a deal worse. Example, live on Cove's clearance Bose QuietComfort Ultra (its own 50% maximum, 20% opening): ask 30% → 25%, never past 40%. Stores preview this in the merchant workspace's "Mutual deal zone"; shoppers only see the discount they asked for and the one they got. Vantage Electronics' published price-match can still beat a rival, inside the agent limit.
- **Confidentiality.** Costs, floors, margins and budgets live in `server-only` modules and are returned only to a merchant holding a signed, httpOnly role cookie. Customer payloads are tested to contain none of these fields.
- **Three-state verification.** An essential UNKNOWN blocks exactly like a FAIL.
- **Versioned approval.** Approval binds to the agreement version and terms hash; re-negotiating cancels the order, releases stock and budget, and requires a new approval.
- **Payment truth.** Success is shown only after the backend captures, re-reads the order from PayPal and passes every essential check, including the webhook signature when required.

## Money plan: personalised household money management (`/money`)

Everything is computed by pure, tested functions (`budget.ts`, `household.ts`, `budget-insights.ts`, `money-questions.ts`) and stored only in the browser. It's a planning tool, not financial advice, and it never moves money.

- **Simple mode:** monthly pay, a ready-made split (50/30/20, 70/20/10, pay yourself first, saver, low rent, each linked to its source), editable % or amounts, savings as the remainder, goals, a daily/weekly spending limit and a 10-step checklist.
- **Personalise (optional wizard):** about you, household (children and ages, parents, dependents, earning partner), income sources in INR, USD, EUR or GBP (₹ uses lakh grouping; a yearly bonus is shown but not split), essential categories by group (weekly amounts converted to monthly, fixed or variable), lifestyle limits with a suggestion capped at 30% of income, an emergency fund (3 or 6 months of essentials), then a review of the A–E allocation (essentials, lifestyle, emergency fund, goals, reserve). Household details personalise wording and suggestions; they never invent expenses.
- **Rules the engine follows:** never allocates more than income; never cuts rent, food, school, medical or loan payments to fund lifestyle; funds the emergency contribution before goals and goals by priority, then date; never moves money between categories or changes a goal date without approval.
- **Category limits and alerts:** at 50%, 75%, 90%, 100% and over, each with a reason, a suggested action, and daily and weekly guidance.
- **Savings vaults:** goals can have a 6-month to 5-year lock-in with a calendar-aware maturity date (month-ends and leap years), the monthly amount needed, a contribution ledger (scheduled contributions keyed by goal and month, so a duplicate is ignored), missed months, pause/resume, a chosen monthly amount, extra money, and withdrawal requests (flagged early before maturity, confirmed by typing the goal name). These are **virtual**: no bank or PayPal account holds or locks the money.
- **Also:** a dashboard; a health score (saving rate 20, needs 15, emergency cover 20, goals on time 15, spending pace 10, debt load 10, cash buffer 10 points; missing information is listed separately and it isn't a credit score); goal-date proposals you approve; life-change previews (salary, rent, loan, medical, moving, marriage, child, dependent) applied only on approval; and an on-device coach that answers from your own numbers.
- **Not yet:** real deposits or withdrawals through a regulated partner, cloud sync, and per-item lifestyle sub-categories (lifestyle limits are per group).

## Security: agent trust and fraud intelligence

Everything below is enforced on the server; the browser never supplies a risk score, and no AI output can skip payment validation. See `/security` for the live dashboard. **This is a demo build with automated tests, not an externally audited system.**

- **Audit log** (`src/lib/nexus/security/ledger.ts`): append-only, SHA-256 hash-chained JSONL under `NEXUS_DATA_DIR` (default `.nexus-data/`, git-ignored). Holds security events, every fraud decision (score, level, reasons, order and store) and every trust event. Card numbers, CVVs, bearer tokens and configured secrets are redacted before writing; device IDs are stored only as hashes. `verifyLedger()` finds any edited, removed or reordered record. It survives restarts and demo resets. Serverless hosts need the insert-only Supabase table in `supabase/migrations/0002_security_ledger.sql` (written, not applied).
- **Agent trust** (`trust.ts`): separate 0–100 scores for the Buyer Agent and each store agent, from observed behaviour only (failed sign-ins, AI messages rejected by the number check, prices past the store's own limit, list prices or discount claims that don't match the listing, self-claimed reputation, manipulation attempts, hidden instructions). Penalties halve every 7 days. A restricted store agent (< 50) is paused from negotiations. Five failed store sign-ins in 15 minutes locks sign-in; three blocked attacks in one conversation locks that conversation.
- **Fraud intelligence** (`fraud.ts`): rules plus statistics (z-score and the robust modified z-score) over overall and per-device velocity, repeated payment attempts, session bursts, recently blocked devices, budget, amount outliers, quantity, declined cards, forged webhooks, instant payment, store trust and refund/dispute rate. Each signal is labelled rule or statistical and explained. < 30 allow, 30–59 the shopper must confirm, 60+ block. The device ID is an anonymous random value in `localStorage`.
- **Payment security** (`payment-guard.ts`): approval is HMAC-signed over the order, exact amount, currency, store, terms hash and version, and expires after 30 minutes; it's re-checked before payment and before capture. `Idempotency-Key` is honoured on approve, pay and capture (same key + same request returns the first result; a different request is rejected). Captures take an atomic lock, a second payment start reuses the open PayPal order, and capture after confirmation is a no-op. Webhooks need a valid signature (PayPal's `verify-webhook-signature` in Sandbox), must be under 10 minutes old, and a repeated transmission is rejected. Captured amount, currency and payee are verified against the approval.
- **AI firewall** (`prompt-shield.ts`): screens shopper messages, and separately store content (descriptions, store-agent messages) for hidden instructions. Each text is also checked after decoding base64, hex, URL-encoding, HTML entities, ROT13, leetspeak, look-alike letters, invisible characters and spaced-out letters. Shopper text goes to the AI inside labelled `<untrusted>` blocks. Any AI request containing a configured secret is refused, and AI output that repeats its own instructions or a secret is discarded.
- **Tests**: `tests/unit/security-scenarios.test.ts` covers 20 prompt-injection, 20 fraud, 10 store-agent manipulation, 10 webhook and 11 duplicate-payment/replay scenarios, plus 22 legitimate messages and every catalogue description as false-positive checks, and ledger tamper detection and redaction.
- **Not covered**: rule-based detection can be evaded by attacks it has no rule for; the device signal is easy to reset; there's no external penetration test; the real PayPal webhook path is untested without a public URL and `PAYPAL_WEBHOOK_ID`.

## Design system

Light, platinum surfaces (`#F5F5F7`), graphite ink and primary actions (`#171717`), restrained purple accents (`#8B5CF6`, `#EDE9FE`), fine borders (`#E9E9EF`), Geist with tabular figures, ~20px cards and 14px controls. Status colours (success `#16A36A`, warning `#D99A32`, error `#DC5555`) are reserved for state, with darker ink variants for AA text contrast. Secondary text is `#64646E`, darker than the brief's `#777780`, so that small text meets WCAG AA on white and on the grey `#F0F0F3` surfaces (5.1:1). An automated axe-core scan finds no WCAG 2.1 AA issues on 16 screens at desktop, tablet and phone sizes. Merchant identity colours (indigo, cyan, rose) were checked with a colour-blindness validator. Motion respects `prefers-reduced-motion`.

## Tests

```bash
npm test            # Vitest: 59 tests covering intent, policy invariants, budgets, verification, versioned approval, payment lifecycle, test cards, role tokens, confidentiality
npm run test:e2e    # Playwright: 60 tests. Full purchase flows, merchant auth, voice fallback, no horizontal overflow, and a WCAG 2.1 AA scan (axe-core), each on desktop, tablet and phone
npm run typecheck && npm run lint && npm run build
```

`npm run test:e2e` builds the app and starts its own production server on port 3100 (`E2E_PORT`) with the payment simulator forced on, so it never resets or restarts your dev server on :3000 and works even when `.env.local` holds PayPal Sandbox keys.

`POST /api/dev/reset` restores seed data (disabled in production unless `NEXUS_ALLOW_RESET=1`).

## Not yet

- **Supabase** (database, auth, Realtime) is not connected. State lives in server memory, so it resets on restart and won't work across Vercel serverless instances. Live updates stream as NDJSON from the API. The target schema is in `supabase/migrations/`.
- **Passkey approval** is not implemented; approval is an explicit on-screen consent.
- **PayPal Sandbox, partly verified with real keys:** sign-in to PayPal's API, order creation for the approved amount, payee pinning, and loading the PayPal and card buttons all work with real Sandbox credentials. Buyer approval followed by capture has not yet been completed end to end.
- **Untested with real credentials:** Gemini (including photo recognition) and wallet eligibility are written against current SDKs but were only exercised with keys unset.
- **Voice** relies on browser SpeechRecognition (Chrome, Edge, Safari). Other browsers get a clear fallback to text.
