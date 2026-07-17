# DocuMind — Setup Guide (Simple Steps)

Everything below has one goal: get you a real, permanent, shared link that works
on any number of devices (2, 20, doesn't matter — it's the same link for everyone).

## What's included in this build
- Dashboard: vault health score, AI-generated smart insight, live activity feed
- Upload: permanent storage, visible to everyone instantly
- Library: every file ever uploaded, who uploaded it
- AI Chat: bilingual (Egyptian Arabic + English), suggested prompt chips, compiled PDF download
- Presence dots: shows who's online right now
- All AI calls run server-side — your API key is never exposed

---

## Step 1 — Supabase (permanent shared storage + real-time sync)
1. Go to **supabase.com** → sign up (free) → "New Project"
2. Wait ~2 minutes for it to finish setting up
3. Go to **SQL Editor** (left sidebar) → "New Query" → open `supabase_setup.sql` from this
   project, copy everything, paste it in → click **Run**
4. Go to **Storage** (left sidebar) → "New Bucket" → name it exactly `documents` →
   toggle it **Public** → Create
5. Go to **Settings → API** → copy two values, you'll need them in Step 4:
   - **Project URL**
   - **anon public key**

## Step 2 — Gemini API key (the AI brain — free, no credit card needed)
1. Go to **aistudio.google.com/app/apikey**
2. Sign in with any Google account (Gmail account works)
3. Click **"Create API Key"** → choose "Create key in new project" if asked
4. Copy the key — you'll need it in Step 4
5. This is Google's free tier — no card required, generous free daily usage limit

## Step 3 — GitHub (where the code lives so it can auto-deploy)
1. Go to **github.com** → sign up (free)
2. Click the **+** icon top-right → "New repository" → name it `documind` → Create
3. On the new repo page, click **"uploading an existing file"**
4. Drag in every file/folder from this project (unzip it first) → commit

## Step 4 — Vercel (this is what makes it live and auto-updating)
1. Go to **vercel.com** → sign up using your GitHub account
2. Click **"Add New Project"** → select your `documind` repo → **Import**
3. Before clicking Deploy, expand **"Environment Variables"** and add all three:
   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | from Step 1 |
   | `VITE_SUPABASE_ANON_KEY` | from Step 1 |
   | `GEMINI_API_KEY` | from Step 2 |
4. Click **Deploy**
5. After ~1 minute you'll get a live link like `documind-yourname.vercel.app`

## Step 5 — Share it
- Send that Vercel link to your dad (or anyone else) — text, WhatsApp, email, doesn't matter.
- **Works on unlimited devices** — phone, laptop, tablet, doesn't matter how many people open it,
  it's all pulling from the same Supabase database in real time.
- First time each person opens it, they should tap "Set your name" so uploads/activity show who did what.

## Making future changes
- Tell me what you want changed → I update the code → you re-upload the changed files to
  your GitHub repo (drag and drop, same as Step 3) → Vercel automatically redeploys within ~1 minute.
- No need to touch Supabase or Vercel settings again unless I specifically say so.

## If something breaks
Copy the exact error message shown on-screen and send it to me — I'll tell you exactly what to fix.
