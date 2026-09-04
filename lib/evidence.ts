/**
 * Evidence layer.
 *
 * This is the part that makes RUKO a decision system rather than a
 * classifier. A language model is good at reading intent and terrible at
 * knowing facts about the world. So before any model gives an opinion, we
 * test the message's factual claims with deterministic code.
 *
 * Two classes of check:
 *   1. LOCAL   - pure logic, no network, cannot fail. Lookalike domains,
 *                TLD risk, shorteners, APK links, UPI ids, sender shape.
 *   2. NETWORK - best effort. Domain registration age via RDAP, redirect
 *                expansion. If these fail we report "unavailable" and let
 *                the decision layer lower its confidence. We never guess.
 */

import type { EvidenceItem, EvidenceReport } from "./types";

/**
 * Domains we treat as known-good. Hand-curated from Indian banks, couriers,
 * telecom, payments and government. This list is the difference between
 * flagging a real HDFC fraud alert and clearing it.
 *
 * TEAM NOTE: extend this. Every entry you add is a false positive you
 * prevent. Keep it to registrable domains, lowercase, no protocol.
 */
export const KNOWN_GOOD_DOMAINS: string[] = [
  // banks
  "hdfcbank.com", "onlinesbi.sbi", "sbi.co.in", "icicibank.com", "axisbank.com",
  "kotak.com", "pnbindia.in", "bankofbaroda.in", "canarabank.com", "unionbankofindia.co.in",
  "idfcfirstbank.com", "yesbank.in", "indusind.com", "federalbank.co.in",
  // payments
  "paytm.com", "phonepe.com", "npci.org.in", "razorpay.com", "cred.club",
  "gpay.app.goo.gl", "amazonpay.in",
  // couriers / logistics
  "bluedart.com", "delhivery.com", "dtdc.in", "indiapost.gov.in", "fedex.com",
  "dhl.com", "ekartlogistics.com", "shiprocket.in",
  // commerce
  "amazon.in", "flipkart.com", "myntra.com", "swiggy.com", "zomato.com",
  "meesho.com", "ajio.com",
  // telecom
  "airtel.in", "jio.com", "vi.in", "bsnl.co.in", "trai.gov.in",
  // government
  "india.gov.in", "incometax.gov.in", "uidai.gov.in", "epfindia.gov.in",
  "cybercrime.gov.in", "irctc.co.in", "parivahan.gov.in", "gst.gov.in",
  "nic.in", "rbi.org.in", "sebi.gov.in", "passportindia.gov.in",
];

/** TLDs disproportionately used in Indian phishing campaigns. */
const HIGH_RISK_TLDS = [
  "xyz", "top", "cn", "ru", "tk", "ml", "ga", "cf", "gq", "buzz", "click",
  "link", "work", "rest", "cyou", "icu", "cc", "shop", "online", "site",
];

const URL_SHORTENERS = [
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "cutt.ly", "rb.gy", "is.gd",
  "shorturl.at", "rebrand.ly", "ow.ly", "buff.ly", "tiny.cc", "bitly.com",
];

/* ------------------------------------------------------------------ */
/* extraction                                                          */
/* ------------------------------------------------------------------ */

const URL_RE = /\b((?:https?:\/\/)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s<>"']*)?)/gi;
const UPI_RE = /\b([a-z0-9._-]{2,64}@(?:ok(?:hdfcbank|icici|axis|sbi)|paytm|ybl|apl|ibl|axl|upi|airtel|fbl|jio))\b/gi;
const PHONE_RE = /(?:\+?91[\s-]?)?\b([6-9]\d{9})\b|\b(1[89]00[\s-]?\d{3}[\s-]?\d{3,4})\b/g;

export function extractUrls(text: string): string[] {
  const found = text.match(URL_RE) ?? [];
  return Array.from(
    new Set(
      found
        .map((u) => u.trim().replace(/[.,;:)\]]+$/, ""))
        // an email address is not a link
        .filter((u) => !/@/.test(u))
        // require a plausible TLD so "3.5" or "Rs.49" do not match
        .filter((u) => /\.[a-z]{2,}(\/|$)/i.test(u))
    )
  );
}

export function domainOf(url: string): string | null {
  try {
    const withProto = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const host = new URL(withProto).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return null;
  }
}

/** Strip subdomains down to the registrable part, handling common Indian
 *  two-part suffixes (.co.in, .gov.in, .org.in, .net.in, .ac.in). */
export function registrableDomain(host: string): string {
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  const twoPartSuffixes = ["co.in", "gov.in", "org.in", "net.in", "ac.in", "res.in", "com.au", "co.uk"];
  const lastTwo = parts.slice(-2).join(".");
  const lastThree = parts.slice(-3).join(".");
  if (twoPartSuffixes.includes(lastTwo)) return lastThree;
  return lastTwo;
}

export function extractUpiIds(text: string): string[] {
  return Array.from(new Set((text.match(UPI_RE) ?? []).map((s) => s.toLowerCase())));
}

export function extractPhones(text: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(PHONE_RE.source, "g");
  while ((m = re.exec(text)) !== null) out.push((m[1] ?? m[2] ?? "").replace(/[\s-]/g, ""));
  return Array.from(new Set(out.filter(Boolean)));
}

/* ------------------------------------------------------------------ */
/* lookalike detection                                                 */
/* ------------------------------------------------------------------ */

export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  const curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr.slice();
  }
  return prev[n];
}

export interface LookalikeVerdict {
  kind: "exact_match" | "lookalike" | "unknown";
  matched?: string;
  distance?: number;
  /** e.g. brand name appears as a subdomain or path of an unrelated domain */
  brandAbuse?: boolean;
}

/**
 * Three outcomes that matter:
 *  - the domain IS a known-good one          -> strong reassurance
 *  - the domain is one or two edits away, or embeds a known brand name in a
 *    domain it does not own                  -> strong danger
 *  - neither                                 -> unknown, defer to other signals
 */
export function classifyDomain(host: string): LookalikeVerdict {
  const reg = registrableDomain(host);

  if (KNOWN_GOOD_DOMAINS.includes(reg) || KNOWN_GOOD_DOMAINS.includes(host)) {
    return { kind: "exact_match", matched: reg };
  }

  const bare = reg.split(".")[0];

  for (const good of KNOWN_GOOD_DOMAINS) {
    const goodBare = good.split(".")[0];
    if (goodBare.length < 4) continue;

    // brand name embedded in a domain that is not the brand's
    if (bare.includes(goodBare) && bare !== goodBare) {
      return { kind: "lookalike", matched: good, brandAbuse: true };
    }
    // typo-squat on the registrable label
    const d = levenshtein(bare, goodBare);
    if (d > 0 && d <= 2 && Math.abs(bare.length - goodBare.length) <= 3) {
      return { kind: "lookalike", matched: good, distance: d };
    }
  }
  return { kind: "unknown" };
}

/* ------------------------------------------------------------------ */
/* network checks (best effort, degrade honestly)                      */
/* ------------------------------------------------------------------ */

const NET_TIMEOUT_MS = Number(process.env.EVIDENCE_TIMEOUT_MS ?? 5000);

async function withTimeout<T>(p: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), NET_TIMEOUT_MS);
  try {
    return await p(c.signal);
  } finally {
    clearTimeout(t);
  }
}

export interface DomainAge {
  ok: boolean;
  registeredAt?: string;
  ageDays?: number;
  error?: string;
}

/**
 * RDAP (RFC 7483) registration date lookup. rdap.org redirects to the
 * authoritative registry for the TLD, so we follow redirects.
 *
 * If this fails for any reason we return ok:false. The caller reports the
 * check as "unavailable" and the decision layer lowers confidence. We do
 * not substitute a guess for a fact.
 */
export async function lookupDomainAge(domain: string): Promise<DomainAge> {
  try {
    return await withTimeout(async (signal) => {
      const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
        signal,
        redirect: "follow",
        headers: { Accept: "application/rdap+json, application/json" },
      });
      if (!res.ok) return { ok: false, error: `RDAP HTTP ${res.status}` };

      const json: any = await res.json();
      const events: any[] = Array.isArray(json?.events) ? json.events : [];
      const reg = events.find(
        (e) => typeof e?.eventAction === "string" && e.eventAction.toLowerCase() === "registration"
      );
      const dateStr: string | undefined = reg?.eventDate;
      if (!dateStr) return { ok: false, error: "RDAP response had no registration event" };

      const ts = Date.parse(dateStr);
      if (Number.isNaN(ts)) return { ok: false, error: `Unparseable RDAP date: ${dateStr}` };

      return {
        ok: true,
        registeredAt: new Date(ts).toISOString().slice(0, 10),
        ageDays: Math.floor((Date.now() - ts) / 86_400_000),
      };
    });
  } catch (err: any) {
    return { ok: false, error: err?.name === "AbortError" ? "RDAP timed out" : String(err?.message ?? err) };
  }
}

/** Follow a shortened link one hop to see where it actually points. */
export async function expandUrl(url: string): Promise<{ ok: boolean; finalUrl?: string; error?: string }> {
  try {
    return await withTimeout(async (signal) => {
      const withProto = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      const res = await fetch(withProto, { signal, redirect: "follow", method: "GET" });
      return { ok: true, finalUrl: res.url };
    });
  } catch (err: any) {
    return { ok: false, error: err?.name === "AbortError" ? "expansion timed out" : String(err?.message ?? err) };
  }
}

/* ------------------------------------------------------------------ */
/* the report                                                          */
/* ------------------------------------------------------------------ */

export async function gatherEvidence(text: string): Promise<EvidenceReport> {
  const items: EvidenceItem[] = [];
  const urls = extractUrls(text);
  const upiIds = extractUpiIds(text);
  const phoneNumbers = extractPhones(text);

  const domains = Array.from(
    new Set(urls.map((u) => domainOf(u)).filter((d): d is string => Boolean(d)))
  );

  let attempted = 0;
  let succeeded = 0;

  /* ---- local checks: these can never fail ---- */

  if (urls.length === 0) {
    items.push({
      id: "no-links",
      label: "No links in message",
      status: "reassuring",
      detail: "Nothing to click. Most phishing needs a link or an app install.",
      deterministic: true,
    });
  }

  for (const host of domains) {
    const verdict = classifyDomain(host);
    if (verdict.kind === "exact_match") {
      items.push({
        id: `domain-known-${host}`,
        label: `${host} is a known official domain`,
        status: "reassuring",
        detail: `Matches our verified registry entry "${verdict.matched}". This is the real organisation's domain, not a lookalike.`,
        deterministic: true,
      });
    } else if (verdict.kind === "lookalike") {
      items.push({
        id: `domain-lookalike-${host}`,
        label: `${host} imitates ${verdict.matched}`,
        status: "danger",
        detail: verdict.brandAbuse
          ? `Contains the brand name from "${verdict.matched}" but is a different domain the brand does not own.`
          : `Only ${verdict.distance} character(s) different from the real "${verdict.matched}".`,
        deterministic: true,
      });
    }

    const tld = host.split(".").pop() ?? "";
    if (HIGH_RISK_TLDS.includes(tld)) {
      items.push({
        id: `tld-${host}`,
        label: `.${tld} is a high-risk domain ending`,
        status: "caution",
        detail: `Cheap and disposable TLDs like .${tld} are heavily used in phishing. Banks and government bodies do not use them.`,
        deterministic: true,
      });
    }

    if (URL_SHORTENERS.includes(registrableDomain(host))) {
      items.push({
        id: `shortener-${host}`,
        label: "Link is hidden behind a shortener",
        status: "caution",
        detail: `${host} hides the real destination. Legitimate institutions link to their own domain directly.`,
        deterministic: true,
      });
    }
  }

  if (/\.apk\b/i.test(text)) {
    items.push({
      id: "apk",
      label: "Message points to a direct APK download",
      status: "danger",
      detail:
        "An app served outside the Play Store bypasses Google's review. This is the standard delivery method for screen-sharing and banking trojans.",
      deterministic: true,
    });
  }

  if (upiIds.length > 0) {
    items.push({
      id: "upi",
      label: `Payment destination named: ${upiIds.join(", ")}`,
      status: "caution",
      detail:
        "The message names a UPI handle to pay. Verify the receiver name shown in your UPI app before any transfer -- it is the only identity check UPI gives you.",
      deterministic: true,
    });
  }

  const personalNumbers = phoneNumbers.filter((p) => /^[6-9]\d{9}$/.test(p));
  if (personalNumbers.length > 0 && /police|customs|bank|officer|court|cbi|ncb|trai|income tax/i.test(text)) {
    items.push({
      id: "personal-number-authority",
      label: "Authority claim, personal mobile number",
      status: "danger",
      detail: `The message claims to be from an official body but gives a personal 10-digit mobile (${personalNumbers.join(", ")}). Government departments use landlines, published helplines or official portals.`,
      deterministic: true,
    });
  }

  /* ---- network checks: best effort, honest about failure ---- */

  for (const host of domains.slice(0, 2)) {
    attempted++;
    const age = await lookupDomainAge(registrableDomain(host));
    if (!age.ok) {
      items.push({
        id: `age-unavailable-${host}`,
        label: `Registration date for ${host} could not be checked`,
        status: "unavailable",
        detail: `${age.error}. We are not guessing this one -- the verdict below is made without it and its confidence is reduced accordingly.`,
        deterministic: false,
      });
      continue;
    }
    succeeded++;
    const days = age.ageDays ?? 0;
    if (days < 90) {
      items.push({
        id: `age-new-${host}`,
        label: `${host} was registered ${days} days ago`,
        status: "danger",
        detail: `Registered ${age.registeredAt}. Phishing domains are typically days to weeks old because they get taken down. A real bank's domain is decades old.`,
        deterministic: false,
      });
    } else if (days < 365) {
      items.push({
        id: `age-young-${host}`,
        label: `${host} is under a year old`,
        status: "caution",
        detail: `Registered ${age.registeredAt} (${days} days ago).`,
        deterministic: false,
      });
    } else {
      items.push({
        id: `age-old-${host}`,
        label: `${host} has existed for ${Math.floor(days / 365)} years`,
        status: "reassuring",
        detail: `Registered ${age.registeredAt}. Long-lived domains are not consistent with a throwaway phishing campaign.`,
        deterministic: false,
      });
    }
  }

  for (const u of urls.filter((u) => URL_SHORTENERS.includes(registrableDomain(domainOf(u) ?? "")))) {
    attempted++;
    const exp = await expandUrl(u);
    if (exp.ok && exp.finalUrl) {
      succeeded++;
      const realHost = domainOf(exp.finalUrl);
      items.push({
        id: `expand-${u}`,
        label: "Shortened link actually points to",
        status: realHost && classifyDomain(realHost).kind === "lookalike" ? "danger" : "caution",
        detail: `${u} resolves to ${exp.finalUrl}`,
        deterministic: false,
      });
    }
  }

  return { items, urls, domains, upiIds, phoneNumbers, networkChecksAttempted: attempted, networkChecksSucceeded: succeeded };
}
