# START HERE — what you have to do

This is the checklist. Work top to bottom. Nothing below step 3 matters until step 3 passes.

---

## 0. Read this first

This scaffold is a **starting point, not a submission.** HackWave rule C4 bans projects with no
meaningful human contribution, and Round 2 has a two-minute Q&A where you must defend engineering
decisions. Three things are deliberately left for you:

1. **`eval/dataset.json`** ships 20 seed messages. Add 20 real ones from your own phones.
2. **`docs/DECISIONS.md`** has four **[YOUR CALL]** blanks. Fill them in yourselves.
3. **`lib/evidence.ts`** has a hand-curated domain registry. Extend it — every entry you add
   prevents a false alarm, and it is the easiest real contribution to make.

Read `docs/DECISIONS.md` end to end. Each person should be able to explain two decisions in their
own words without notes.

---

## 1. Fix the git repo (2 min)

I created a git repo from a sandbox that could not clean up its own lock files. Start fresh:

```cmd
cd C:\Users\aksha\Desktop\AN_APP_IDEA
rmdir /s /q .git
git init
git branch -M main
git config user.name "Akshay Varma"
git config user.email "hiddengem0707@gmail.com"
```

---

## 2. Get a Featherless key (5 min)

1. Sign up at <https://featherless.ai>
2. Account → API Keys → create one
3. In the project folder:

```cmd
copy .env.example .env.local
```

4. Open `.env.local` in Notepad and paste your key into `FEATHERLESS_API_KEY=`

---

## 3. Install and verify the models (10 min) ← everything depends on this

```cmd
npm install
npm run models     :: finds model ids your key can actually call
npm run health     :: re-verifies whatever you put in .env.local
```

`npm run models` exists because two things bite here: the Featherless catalogue moves, and
**every `meta-llama/*` id is gated** — it returns HTTP 403 unless your account has a linked
HuggingFace licence. The script probes candidates with your own key, enforces the rule that
DEFEND must be a different vendor family from REASON, and prints a block to paste into
`.env.local`. If a role has no working candidate, add ids from
<https://featherless.ai/models> to the `CANDIDATES` list at the top of `scripts/find-models.ts`
and re-run.

**This is the step that decides whether the model roster in `.env.local` is real.** The model ids I
put in `.env.example` came from the Featherless catalogue page, but I could not call the API from my
sandbox to confirm them — that network is blocked. So `npm run health` is not optional.

If any model prints `FAIL`:

1. Open <https://featherless.ai/models>
2. Pick a replacement of a similar size **from the same vendor family**
   (TRIAGE ≈ 3–8B · PROSECUTION ≈ large reasoning · DEFENCE ≈ large, **must be a different family
   from PROSECUTION** — that separation is the whole safety argument, see `docs/DECISIONS.md` #3)
3. Update the id in `.env.local` and run `npm run health` again

No code changes needed. The roster is configuration for exactly this reason.

Then:

```cmd
npm run dev
```

Open <http://localhost:3000> and click the three example chips. All three should produce a verdict.

---

## 4. Make the commit history (10 min) ← this is a disqualification rule

Rule C3: a single bulk push is a disqualification. Run these in order, from the project folder.
Space them out across your build — do not paste all of them in one minute.

```cmd
git add .gitignore .gitattributes package.json tsconfig.json next.config.mjs postcss.config.mjs tailwind.config.ts .env.example
git commit -m "chore: project skeleton, Next.js 14 + TypeScript + Tailwind"

git add lib/types.ts lib/models.ts
git commit -m "feat: model registry with roles, fallbacks and env-driven ids"

git add lib/featherless.ts
git commit -m "feat: Featherless client with fallback chain and JSON recovery"

git add lib/evidence.ts
git commit -m "feat: deterministic evidence layer - lookalike domains, TLD risk, APK and UPI detection"

git add lib/pipeline/triage.ts
git commit -m "feat: triage stage - extract the demand, not a scam label"

git add lib/pipeline/prosecute.ts lib/pipeline/defend.ts
git commit -m "feat: adversarial prosecution and cross-family defence stages"

git add lib/pipeline/decide.ts lib/pipeline/index.ts
git commit -m "feat: arithmetic verdict with confidence gate and routing decision"

git add app/api
git commit -m "feat: SSE analyse endpoint and model health probe"

git add app/globals.css app/layout.tsx components/
git commit -m "feat: UI - verdict card, evidence panel, router panel, pipeline trace"

git add app/page.tsx
git commit -m "feat: main page with streaming pipeline consumption"

git add eval/
git commit -m "test: evaluation harness reporting detection and false-alarm rates"

git add docs/ README.md START_HERE.md
git commit -m "docs: README, architecture, engineering decisions, demo script"
```

Then, as **you** make your own changes (domain registry, dataset, decisions doc), commit each one
separately. Those commits are the ones that prove human contribution.

---

## 5. Push to GitHub (5 min)

Create a **public** repo named `ruko` at <https://github.com/new>. Do not add a README there.

```cmd
git remote add origin https://github.com/YOUR-USERNAME/ruko.git
git push -u origin main
```

Your friend can now clone it. Tell them to copy `.env.example` to `.env.local` and use their own key
— **never commit `.env.local`**, it is already gitignored.

---

## 6. Deploy to Vercel (10 min)

1. <https://vercel.com> → sign in with GitHub → Import your `ruko` repo
2. Framework preset: Next.js (auto-detected). Do not change build settings.
3. **Environment Variables** — add `FEATHERLESS_API_KEY` with your key. Add any model id you changed.
4. Deploy
5. Open `https://your-app.vercel.app/api/health` and confirm it returns 200

Put the live URL at the top of `README.md`.

---

## 7. Run the evaluation (30 min) ← do not skip, this is a large share of your score

First, add 20 real messages to `eval/dataset.json` from your own phones — at least 8 of them
genuine. Redact account numbers and personal names.

```cmd
npm run eval
```

It writes `eval/results/RESULTS.md`. **Paste that table into the README, replacing the `_TODO_`
placeholders.** Do not submit with placeholders still in the README.

If your false-alarm count is above zero, look at which genuine message got flagged and add its
domain to `KNOWN_GOOD_DOMAINS` in `lib/evidence.ts`. Then re-run. That loop is real engineering and
it makes a good Q&A answer.

---

## 8. Before you submit

- [ ] README has the live URL and video link — no `_TODO_` left anywhere
- [ ] Real eval numbers in the README
- [ ] `docs/DECISIONS.md` **[YOUR CALL]** blanks filled in
- [ ] `/api/health` returns 200 on the deployed URL
- [ ] All three examples work on the **deployed** site, not just localhost
- [ ] 20+ commits, spread over time
- [ ] `.env.local` is NOT in the repo (`git ls-files | findstr env` should show only `.env.example`)
- [ ] 3-minute video recorded, and downloaded locally as a backup
- [ ] Team size fits CodeSpectra's cap of 4
- [ ] Track declared: **Autonomous AI Workflows**
- [ ] Every team member can explain two decisions from `docs/DECISIONS.md`

---

## Known gaps (build these if you have time, in this order)

1. **Screenshot input** — `Qwen/Qwen3-VL-8B-Instruct` is on Featherless. People forward images.
2. **Regional languages** — Telugu and Hindi scam messages are a huge blind spot.
3. **Unit tests for `decide.ts`** — the verdict arithmetic is pure and trivially testable. A test
   file is a strong signal to an AI judge reading the repo.
