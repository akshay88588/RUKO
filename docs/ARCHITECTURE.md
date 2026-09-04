# Architecture

## The flow

```
INPUT      raw message text (SMS / WhatsApp / email), max 8000 chars
   ↓
TRIAGE     Qwen/Qwen3-8B
           Extracts: action demanded, rupee amount, claimed identity,
           the literal demand sentence, the pressure sentence, whether the
           message discourages telling anyone.
           It is NOT asked whether the message is a scam.
   ↓
EVIDENCE   lib/evidence.ts — deterministic code, then best-effort network
           LOCAL  (cannot fail)      lookalike domains, TLD risk, shorteners,
                                     APK links, UPI handles, phone shape,
                                     authority-claim-from-personal-mobile
           NETWORK (may fail)        RDAP registration age, redirect expansion
   ↓
ROUTING    ── the consequential routing decision ──
           escalate = action !== "none"
                      OR any danger evidence
                      OR any caution evidence
                      OR isolation requested
           If false: verdict is SAFE, produced by the 4B model alone.
           No large model is called. This is the cost and latency win.
   ↓
PROSECUTE  deepseek-ai/DeepSeek-V4-Flash
           Given the message, the extracted demand and the verified evidence,
           argue the message is fraudulent. Returns confidence, tactics,
           what the sender actually wants, and reasoning citing the evidence.
   ↓
DEFEND     zai-org/GLM-5.3                     (different vendor family)
           Given the same inputs plus the prosecution's reasoning, argue the
           message is legitimate. Returns strength and a decisive check.
   ↓
DECIDE     lib/pipeline/decide.ts — arithmetic, no model call
           fraudScore   = prosecution.fraudulent ? conf : 1 − conf
           defence      = defence.can_be_legitimate ? strength : 0
           net          = fraudScore − defence
           net          = max(net, 0.5) if deterministic danger evidence exists
           confidence   = |net| − 0.1 if any evidence was unavailable

           confidence < CONFIDENCE_THRESHOLD  → VERIFY
           net > 0                            → STOP
           otherwise                          → SAFE
   ↓
OUTPUT     verdict + confidence + headline + what they want + why + what to do
           + full model trace (which model, latency, tokens, fallback used)
```

## Streaming

`POST /api/analyze` returns server-sent events, one per stage. The client renders the pipeline as
it runs. This is a product decision, not a technical one: "visible reasoning" means a judge watches
the system work, not a spinner followed by an answer.

Event types: `stage`, `ask`, `evidence`, `routing`, `prosecution`, `defence`, `trace`, `done`, `error`.

## Failure behaviour

| Failure | Behaviour |
|---|---|
| Primary model errors or times out (45s) | Automatic fallback to the secondary model. The UI marks the call `fallback` and shows the primary's error on hover. |
| Model returns prose instead of JSON | `parseJson` tries three recovery strategies (raw, fenced block, outermost braces) before throwing. |
| RDAP lookup fails | Evidence item recorded as `unavailable`; confidence penalised by 0.1. No guess is substituted. |
| Both models for a role fail | The request errors visibly. The UI points at `/api/health`. We do not fabricate a verdict. |
| No API key | Caught at the first call with an explicit message naming `.env.local`. |

## Why the verdict is not a model call

A third model summarising the first two would add latency, add cost, add a hallucination surface,
and make the most important step the least inspectable one. The arithmetic in `decide.ts` fits on a
whiteboard, is unit-testable, and can be defended in a two-minute Q&A. See `docs/DECISIONS.md` #4.
