# RUKO

*रुको — Hindi for "wait." The word a friend says when they see you about to send money to a stranger.*

**RUKO decides whether you should act on a message that is asking you for money.**

It is not a spam filter. It extracts what a message wants you to *do*, tests that story against
live evidence — domain registration age, lookalike-domain detection, link destination, sender
shape — and then a second model **from a different vendor family** argues that the message is
legitimate. If that defence wins, we do not raise an alarm.

**The hard problem is not catching scams. It is not blocking the real bank alert.**

> ⚠️ Evaluation numbers below are placeholders until `npm run eval` has been run. See
> [Evaluation](#evaluation). Do not publish this README with the placeholders still in it.

- **Live app:** _TODO — paste your Vercel URL here_
- **Demo video (3 min):** _TODO — paste link here_
- **Track:** Autonomous AI Workflows
- **Built for:** HackWave 3.0 "Build by Sunset", SNIST Hyderabad, 4–5 September 2026

---

## The problem

India lost **₹22,495 crore to cyber fraud in 2025** across **28.15 lakh reported cases** — a 24%
jump in a single year, and roughly **₹61 crore every day**. Investment scams alone account for 76%
of the money lost; "digital arrest" scams account for another 9%.
([ThePrint / I4C data](https://theprint.in/india/cybercrime-saw-24-spike-in-2025-indians-lost-rs-22495-crore-mainly-in-investment-scams/2859930/))

But the number is not the problem. This is:

Everyone has a message in their phone right now that they were not sure about. A parcel held at
customs. A KYC update. A part-time job paying ₹3,000 a day. The recipient stares at it for ten
seconds, cannot tell, and then either ignores something real or taps something fake. **That ten
seconds of uncertainty is where ₹61 crore a day disappears.**

Existing tools fail in both directions. They match keywords and sender reputation, so they miss the
politely-written scams, and they flag genuine bank alerts — which are *supposed* to look urgent.
After a few false alarms people stop reading the warnings, and the tool becomes worse than nothing.

## What it decides

Given any message, RUKO returns one of three verdicts, with a confidence:

| Verdict | Meaning |
|---|---|
| 🔴 **STOP** | Do not send the money / share the code / install the app. Here is the evidence. |
| 🟡 **VERIFY FIRST** | We are not confident enough to call it. Here is the one check that settles it. |
| 🟢 **THIS IS FINE** | Looks alarming, but we checked, and it is genuine. Go ahead. |

The third verdict is why this is a decision system and not a classifier. Anything can shout "scam".
Clearing a real ₹49,999 fraud alert from HDFC is the hard call, and it is the one that decides
whether a person keeps the tool installed.

## How it works

```
message
   │
   ├─ 1  TRIAGE      small model      what action does this message demand?
   │
   ├─ 2  EVIDENCE    deterministic    test the message's claims with code, not opinion
   │                 + network        lookalike domains · TLD risk · shorteners · APK links
   │                                  UPI handles · sender shape · RDAP registration age
   │
   ├─ 3  ROUTING     ── decision ──   demands nothing + no danger signal?  stop here.
   │                                  otherwise escalate to the reasoning model.
   │
   ├─ 4  PROSECUTION reasoning model  argue this is fraud, citing the evidence
   │
   ├─ 5  DEFENCE     different family argue this is legitimate
   │
   └─ 6  DECISION    arithmetic       net = fraudScore − defenceStrength
                                      |net| < threshold → VERIFY (refuse to call it)
                                      net > 0 → STOP,  else → SAFE
```

Full detail in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

### Why the evidence layer exists

A language model is good at reading intent and bad at knowing facts. So before any model gives an
opinion, deterministic code tests what the message claims:

- **Lookalike detection** — Levenshtein distance and brand-embedding against a curated registry of
  real Indian bank, courier, telecom and government domains. `hdfcbank.com` clears; `hdfcbank-kycverify.top` does not.
- **Registration age** via RDAP — a phishing domain is days old, a bank's domain is decades old.
- **Link expansion, TLD risk, APK detection, UPI handle extraction, authority-claim-from-personal-mobile.**

Local checks are pure logic and cannot fail. Network checks are best-effort: **if a lookup fails we
report it as `unavailable` and lower the verdict's confidence rather than guessing.** Deterministic
danger evidence also sets a floor on the verdict — a model does not get to talk the system out of
something the code verified itself.

## AI implementation

Six configured models across three vendor families, all served through Featherless's
OpenAI-compatible API. Every id is read from the environment, never hardcoded.

| Role | Primary | Fallback | Why |
|---|---|---|---|
| **TRIAGE** | `Qwen/Qwen3.5-4B` | `meta-llama/Llama-3.2-3B-Instruct` | Small and cheap enough to run on every message. Only names the demanded action. |
| **PROSECUTION** | `deepseek-ai/DeepSeek-V4-Flash` | `zai-org/GLM-5.3` | Reasoning over the extracted demand plus verified evidence. |
| **DEFENCE** | `meta-llama/Llama-3.3-70B-Instruct` | `google/gemma-4-31B-it` | **Different family from prosecution, on purpose.** |

**Why Featherless is structural, not decorative:** the defence model must come from a different
training lineage than the prosecution model. Two models from one family share failure modes and
agree with each other's mistakes — which is exactly the correlated error that produces a confident
wrong answer about someone's money. Getting Qwen, DeepSeek and Llama behind one API is what makes
the adversarial check possible at all. On a single closed vendor there is no second family to ask,
and the design collapses back into one model checking its own homework.

**Routing is a real decision, and it is visible in the UI.** A message that demands nothing and
trips no deterministic danger signal is resolved by the 4B model alone and never reaches a large
one. The router panel shows which model ran, why, and how long it took.

**Model availability changes.** `npm run health` and `GET /api/health` probe every configured id
and report which are actually alive, so the roster is verified rather than assumed.

## Evaluation

Run `npm run eval`. It writes `eval/results/RESULTS.md`. **Paste the table here before submitting.**

| | Stopped | Asked to verify | Cleared |
|---|---|---|---|
| **Scam messages (n=_TODO_)** | _TODO_ | _TODO_ | _TODO_ |
| **Genuine messages (n=_TODO_)** | _TODO_ | _TODO_ | _TODO_ |

- Detection rate: _TODO_
- **False alarm rate: _TODO_**
- Resolved on the small model alone: _TODO_
- Average latency: _TODO_

We report false alarms as prominently as detection because the false alarm is the failure that
makes a tool like this get uninstalled.

## Running locally

```bash
npm install
cp .env.example .env.local     # add your Featherless key
npm run health                 # confirm the model roster is alive
npm run dev                    # http://localhost:3000
```

`FEATHERLESS_API_KEY` is the only required variable. Everything else has a default — see
[`.env.example`](.env.example).

## Project layout

```
app/
  page.tsx                 UI: input, streaming trace, verdict, router panel
  api/analyze/route.ts     SSE stream, one event per pipeline stage
  api/health/route.ts      probes every configured model id
lib/
  featherless.ts           OpenAI-compatible client, fallback chain, JSON recovery
  models.ts                model roster, read from env
  evidence.ts              deterministic + network checks
  pipeline/
    triage.ts              stage 1  extract the demand
    prosecute.ts           stage 4  argue fraud
    defend.ts              stage 5  argue legitimacy
    decide.ts              stage 6  arithmetic verdict, no model call
    index.ts               orchestrator, emits stage events
eval/
  dataset.json             labelled messages
  run-eval.ts              detection + false-alarm harness
docs/
  ARCHITECTURE.md          the flow in detail
  DECISIONS.md             engineering decisions and their trade-offs
  DEMO_SCRIPT.md           the 3-minute run
```

## Engineering decisions

Documented with trade-offs in [`docs/DECISIONS.md`](docs/DECISIONS.md). The five that matter:
adversarial cross-family verification, deterministic evidence outranking model opinion, a verdict
computed by arithmetic rather than a third model, honest degradation when a lookup fails, and a
model roster held in configuration because the catalogue changes.

## Limits

Honest list, because a tool that decides things about money should be clear about where it stops.

- **English and Hinglish only.** Regional-language scams are the largest gap.
- **The known-good domain registry is hand-curated.** A legitimate organisation not on that list
  gets no reassurance boost and may land in VERIFY rather than SAFE.
- **RDAP does not cover every TLD**, and some registries rate-limit. Those lookups degrade to
  `unavailable`, which lowers confidence rather than failing loudly.
- **No image input yet.** People forward screenshots; we accept pasted text only.
- **Confidence thresholds are tuned, not calibrated.** We chose the operating point deliberately —
  fewer wrong "this is safe" calls, more "verify first" — but that is a judgement, not statistics.
- **This is decision support, not advice.** It can be wrong.

---

If you have already lost money: call **1930** (National Cyber Crime Helpline) or report at
[cybercrime.gov.in](https://cybercrime.gov.in). Money reported within the first hour is often frozen
before it is withdrawn.
