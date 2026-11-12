# Deploying AtoZAIx to Vercel

Everything below is done in your own Vercel, Supabase and PayPal developer
accounts. Secrets go into Vercel's dashboard, never into the code or GitHub.

## 1. Import the project (about 5 minutes)

1. Sign in at **vercel.com** with the GitHub account that owns the repository (**AtoZAIx**).
2. **Add New → Project** → import **AtoZAIx/AtoZAIx---AI-HACKATHON-**.
   If it isn't listed, choose **Adjust GitHub App Permissions** and give Vercel access to it.
3. Framework: **Next.js** (detected). Leave the build settings as they are.
4. Open **Environment Variables** and paste the whole contents of your local **`.env.vercel`**
   file into the first box (Vercel splits it into separate variables). It holds:
   - your PayPal Sandbox and Supabase keys (copied from `.env.local`)
   - `NEXUS_SIGNING_SECRET` and `NEXUS_SIM_WEBHOOK_SECRET` (**required on Vercel**: every copy of
     the app must share them, or a deal signed on one server fails its check on another)
   - `NEXUS_MERCHANT_PASSCODE_ATELIER / _BOLT / _COVE` (passcodes for the merchant workspace)
5. **Deploy.** The first build takes about 3 minutes. Your link looks like
   `https://atozaix-ai-hackathon.vercel.app`.
6. Open it and check **Settings**: Payments should say **PayPal Sandbox** and Data storage **Supabase**.

**Supabase is required on Vercel.** Vercel runs many short-lived copies of the app and any
request can land on any copy, so deals and orders are always read from and saved to Supabase
(the app switches to this "shared mode" by itself when it runs on Vercel).

**Don't set `APP_URL` on Vercel.** The app uses the address the visitor actually opened, which
keeps passkeys and PayPal's return link working on your main link and on preview links.

## 2. Turn on PayPal webhooks (about 5 minutes)

1. **developer.paypal.com → Apps & Credentials** (Sandbox) → your app → **Add Webhook**.
2. Webhook URL: `https://<your-vercel-link>/api/paypal/webhook`
3. Events: **Payment capture completed**, **Payment capture denied**, **Payment capture refunded**,
   **Customer dispute created**.
4. Save, copy the **Webhook ID**, add it in Vercel → **Settings → Environment Variables** as
   `PAYPAL_WEBHOOK_ID`, then **Deployments → ⋯ → Redeploy** (variables apply to new deployments).
5. Optional, strongest setting: add `NEXUS_REQUIRE_WEBHOOK` = `true`, so an order only becomes
   *Paid* after PayPal's signed webhook arrives.

## 3. Before judging

- Use your **main link** (Production), not a preview link, for the demo and for setting up the
  passkey: a passkey belongs to one web address.
- Payments are PayPal **Sandbox**: test money only. Sign in at checkout with a sandbox *buyer*
  account from **developer.paypal.com → Testing Tools → Sandbox Accounts**.
- Use PayPal Sandbox (not the built-in demo payment simulator) on Vercel: the simulator keeps its
  state in one server's memory, which suits a single server like Render or your laptop.
- Good to know: store stock, merchant budget changes made in the merchant workspace, and the
  in-app audit-log view are kept per server copy on Vercel; deals, orders, webhooks and the
  audit log itself are saved in Supabase.

---

# Alternative: deploying AtoZAIx to Render

One always-on Node server (free plan). Everything below is done in your own
Render and PayPal developer accounts; secrets are typed into their dashboards,
never into the code or this repository.

## 1. Create the service (about 10 minutes)

1. Sign in at **render.com** (use **Sign in with GitHub** as the account that owns the repository).
2. **New → Blueprint**, pick **AtoZAIx/AtoZAIx---AI-HACKATHON-**. If it isn't listed, choose
   **Configure GitHub app** and give Render access to that repository.
3. Render reads `render.yaml` and asks for the secret values. Copy each one from your local `.env.local`:
   - `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` (sandbox app keys)
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`
   - `GEMINI_API_KEY` (optional)
   - leave `PAYPAL_WEBHOOK_ID` empty for now (step 2)
4. **Apply**. The first build takes about 5 minutes. Your link is shown at the top, e.g.
   `https://paypal-nexus.onrender.com`.
5. Open the link and check **Settings**: Payments should say **PayPal Sandbox** and
   Data storage **Supabase**.

## 2. Turn on PayPal webhooks (about 5 minutes)

1. **developer.paypal.com → Apps & Credentials** (Sandbox) → your app → **Add Webhook**.
2. Webhook URL: `https://<your-render-link>/api/paypal/webhook`
3. Events: **Payment capture completed**, **Payment capture denied**, **Payment capture refunded**,
   **Customer dispute created**.
4. Save, copy the **Webhook ID**, paste it into Render → your service → **Environment** →
   `PAYPAL_WEBHOOK_ID`, and save (Render redeploys).
5. Optional, strongest setting: add `NEXUS_REQUIRE_WEBHOOK` = `true`, so an order only becomes
   *Paid* after PayPal's signed webhook arrives.

## 3. Before judging

- The free plan sleeps after 15 minutes without visits; the first visit then takes about a minute.
  **Open the link a few minutes before your demo.**
- Merchant workspace passcodes were generated by Render: see **Environment** →
  `NEXUS_MERCHANT_PASSCODE_*`.
- Payments are PayPal **Sandbox**: test money only. Sign in at checkout with a sandbox *buyer*
  account from **developer.paypal.com → Testing Tools → Sandbox Accounts**.
- PayPal sends the buyer back to the address Render reports (`RENDER_EXTERNAL_URL`); set
  `APP_URL` if you add a custom domain.
