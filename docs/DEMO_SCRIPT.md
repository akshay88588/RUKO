# 3-minute demo script

Rehearse this out loud three times, timed. The clock is the enemy, not the judges.

**Setup before you start:** app open on the deployed URL, `/api/health` already checked green,
input box empty, browser zoom at 110% so the back row can read the verdict.

---

**0:00 – 0:15 · The problem, no slides**

> "India lost twenty-two and a half thousand crore rupees to cyber fraud last year. Sixty-one crore
> a day. But that's not the problem. The problem is that everyone in this room has a message in
> their phone right now that they weren't sure about — and they stared at it for ten seconds and
> guessed."

**0:15 – 0:55 · The scam — STOP**

Click the "Digital arrest" example. While it runs, narrate the pipeline as it appears:

> "It's not asking whether this is spam. First it works out what the message wants you to *do* —
> call a number. Then code, not a model, checks the claims: that's a personal ten-digit mobile
> claiming to be Mumbai Customs."

Verdict lands. Read the headline aloud, then:

> "Fear, fake authority, a four-hour deadline, and 'don't tell your family' — which exists only to
> stop someone talking you out of it. This is the digital arrest scam. Nine percent of last year's
> losses."

**0:55 – 1:50 · The genuine bank alert — THIS IS FINE** ← the one that wins it

Click "Genuine bank alert". Let it run.

> "Now watch. Forty-nine thousand rupees. The word URGENT in capitals. A link. Every keyword filter
> on earth blocks this message."

Point at the evidence panel as the verdict turns green:

> "But hdfcbank.com is in our verified registry and RDAP says it was registered in the nineteen
> nineties. And look at what the message actually asks you to do — *block a card*. It doesn't
> extract anything from you. It even tells you not to share your OTP, which is the opposite of what
> a scam says."

> "Our defence model — a Llama model, deliberately from a different family than the DeepSeek model
> that prosecuted it — argued this is real, and won. So we cleared it."

**1:50 – 2:20 · Why two families**

Point at the router panel.

> "That's the whole design. Two models from the same family make the same mistakes and agree with
> each other. We needed an independent second reader, and that means a different training lineage —
> which is exactly what Featherless gives us: Qwen, DeepSeek and Llama behind one API. On a single
> closed vendor there is no second family to ask."

> "And notice the routing — the four-B model handled the triage in under a second. Messages that
> demand nothing never touch a large model at all."

**2:20 – 2:45 · Judge's own message**

> "Someone hand me a message from your phone."

Paste it. Let it run live. Do not narrate — let it work. Whatever comes out, read the verdict.

*(If it returns VERIFY: that is a win, not a failure. Say: "It's telling you it isn't sure, and
here's the one check that settles it. We'd rather be useless than confidently wrong about your
money.")*

**2:45 – 3:00 · Close**

> "Twenty-five scams and fifteen genuine messages in our test set. [Read your real numbers.] The
> second number is the one we care about — a tool that blocks real bank alerts gets uninstalled,
> and then its detection rate doesn't matter. Repo and live link are on screen. Thank you."

---

## If something breaks

- **A model 404s** → open `/api/health` on the projector. "Model roster is config, not code — one
  env var and we're back." That is a better answer than a working demo of a brittle system.
- **The API is slow** → keep talking over it; the pipeline trace is showing progress, use it.
- **Total failure** → switch to the recorded video. Have it downloaded locally, not on a link.

## Do not

- Do not open with your names and college. You have 180 seconds.
- Do not explain the tech stack. Nobody scores Next.js.
- Do not thank the judges for their time at the start. Do it at the end, in four words.
- Do not show three red verdicts. The green one is the demo.
