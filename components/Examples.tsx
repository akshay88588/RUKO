"use client";

/**
 * Demo fixtures.
 *
 * Three cases, chosen so the demo shows the full range rather than three
 * variations of "SCAM DETECTED". The genuine bank alert is the important
 * one: every keyword filter blocks it, and RUKO must not.
 */
export interface Example {
  id: string;
  label: string;
  note: string;
  text: string;
}

export const EXAMPLES: Example[] = [
  {
    id: "digital-arrest",
    label: "Digital arrest",
    note: "9% of India's 2025 cyber-fraud losses",
    text: `Dear Customer, your parcel from FedEx containing 400g MDMA has been seized by Mumbai Customs. Case No. MUM/NCB/2026/8841. Contact Officer Rajesh Sharma immediately on 9876543210 or an arrest warrant will be issued within 4 hours. Do not discuss this with family as this is a confidential investigation.`,
  },
  {
    id: "genuine-bank",
    label: "Genuine bank alert",
    note: "Looks like a scam. Is not one.",
    text: `URGENT: Rs.49,999 debited from a/c XX4471 on 04-09-26 for purchase at ELECTROHUB. If this was not you, block your card immediately at https://hdfcbank.com/blockcard. Do not share your OTP or card details with anyone.`,
  },
  {
    id: "investment",
    label: "Investment scam",
    note: "76% of all money lost in 2025",
    text: `Hello! I am Priya from Zenith Capital Advisory. Our SEBI-certified algo gave 41% returns last quarter. Join our free VIP WhatsApp group and start with just Rs.5000. Withdraw anytime. Limited to 30 members, closing tonight. Download our app: https://zenith-capital-invest.xyz/app.apk`,
  },
];

export function ExampleChips({
  onPick,
  disabled,
}: {
  onPick: (text: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {EXAMPLES.map((ex) => (
        <button
          key={ex.id}
          onClick={() => onPick(ex.text)}
          disabled={disabled}
          className="group rounded-lg border border-edge bg-panel px-3 py-2 text-left transition hover:border-[#39424F] disabled:opacity-40"
        >
          <div className="text-[13px] font-medium text-[#E7EAEE]">{ex.label}</div>
          <div className="text-[11px] text-muted">{ex.note}</div>
        </button>
      ))}
    </div>
  );
}
