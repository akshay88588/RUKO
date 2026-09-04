# Engineering decisions

Each entry: what we chose, what we gave up, and what would change our mind.

> **TEAM: read this before the Q&A.** Every person should be able to explain at least two of these
> in their own words. Judges ask "what did you build versus what did the AI write" and the answer
> is these decisions. Where you see **[YOUR CALL]**, fill in your own reasoning — do not present a
> decision you cannot defend.

---

## 1. Deterministic evidence before any model opinion

**Chose:** test the message's factual claims in code — domain lookalike distance, registration age,
TLD, link destination, APK presence — and feed the *results* to the models rather than asking a
model to imagine them.

**Gave up:** coverage. Our checks only catch what we thought to implement.

**Why:** a language model reliably reads intent and unreliably knows facts. Asking a model "is
hdfcbank-kycverify.top a real HDFC domain" invites a confident wrong answer. Asking code to compute
the edit distance to `hdfcbank.com` does not.

**Would change our mind:** if the deterministic checks produced more false positives than the
models did on the same set.

---

## 2. Deterministic danger evidence sets a floor on the verdict

**Chose:** if code found a lookalike domain, an APK link, or an authority claim from a personal
mobile, the fraud score cannot fall below 0.5 regardless of what the defence model argues.

**Gave up:** the models' ability to overrule us on genuinely unusual legitimate messages.

**Why:** a persuasive model should not be able to talk the system out of a fact we verified
ourselves. The asymmetry is deliberate — code outranks opinion, in that direction only.

---

## 3. The defence model must be a different vendor family

**Chose:** prosecution on DeepSeek, defence on Zhipu's GLM. Not two sizes of the same family.
(We originally paired DeepSeek with Llama; Featherless gates `meta-llama/*` behind a HuggingFace
licence, so we moved to GLM. The requirement was never a specific vendor, only a different one.)

**Gave up:** the convenience of one provider and one prompt style.

**Why:** correlated failure. Models trained on overlapping data with similar methods share blind
spots, so a same-family verifier agrees with the mistakes it should catch. The whole safety
argument of this system is that two *independent* readers had to agree.

**This is why Featherless is structural to the product.** On a single closed vendor there is no
second family available and the design collapses into one model checking its own homework.

**Would change our mind:** if measured disagreement between families turned out no higher than
within a family. That is a measurable claim and we would run it.

---

## 4. The final verdict is arithmetic, not a third model call

**Chose:** `net = fraudScore − defenceStrength`, with a threshold below which we refuse to call it.

**Gave up:** nuance. A model could write a more graceful synthesis.

**Why:** three reasons. Latency — a third call adds seconds to a demo. Inspectability — the most
important step should be the most auditable, not the least. Honesty — a summarising model can
invent a rationale that neither of the first two models actually gave.

---

## 5. Refusing to answer is a first-class outcome

**Chose:** VERIFY is a real verdict, not a fallback. It fires when the two models disagree, when
confidence lands below threshold, or when evidence we wanted could not be verified.

**Gave up:** automation rate. Some cases get no clean answer.

**Why:** a wrong "this is safe" costs someone their savings. A wrong "verify first" costs them
thirty seconds. We tuned the operating point for the cheaper error.

**[YOUR CALL]** — after running `npm run eval`, record the threshold you settled on and why:
_threshold = ____ because _______________________________________________

---

## 6. Failed network lookups lower confidence instead of being ignored

**Chose:** an RDAP failure becomes a visible `unavailable` evidence item and a 0.1 confidence
penalty.

**Gave up:** clean-looking output. The UI sometimes says "we could not check this."

**Why:** the alternative is silently treating "unknown" as "fine", which is how a verification
system quietly becomes a guess.

---

## 7. The model roster lives in configuration, not code

**Chose:** every model id comes from an environment variable, with `npm run health` probing them.

**Gave up:** nothing meaningful.

**Why:** Featherless serves thousands of open-weight models and the catalogue moves. A model id
hardcoded on Friday can be a 404 on Sunday morning, ninety minutes before a demo. Swapping a model
is an env change, not a deploy.

---

## 8. Plain `fetch`, no SDK

**Chose:** hand-written client against the OpenAI-compatible endpoint.

**Gave up:** retries, streaming helpers and typed responses we would have got free.

**Why:** one less dependency to break during a hackathon, and the entire request path stays short
enough to read aloud in a Q&A.

---

## 9. **[YOUR CALL]** — the known-good domain registry

`lib/evidence.ts` ships a hand-curated list of real Indian bank, courier, telecom and government
domains. Every entry prevents a false alarm.

_Who extended it, how many entries you added, and what you decided to leave out:_
_______________________________________________________________________

---

## 10. **[YOUR CALL]** — what you cut and why

_Things you deliberately did not build, and the reasoning:_
_______________________________________________________________________
