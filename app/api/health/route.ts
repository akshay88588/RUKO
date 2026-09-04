import { allConfiguredModels, CONFIDENCE_THRESHOLD } from "@/lib/models";
import { probeModel } from "@/lib/featherless";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Probes every configured model id. Model availability on Featherless
 * changes, so the roster is verified at runtime rather than trusted.
 * Hit /api/health before every demo.
 */
export async function GET() {
  const configured = allConfiguredModels();
  const results = await Promise.all(
    configured.map(async (m) => ({ ...m, ...(await probeModel(m.id)) }))
  );

  const keySet = Boolean(process.env.FEATHERLESS_API_KEY);
  const primariesOk = results.filter((r) => r.tier === "primary" && r.ok).length;
  const primariesTotal = results.filter((r) => r.tier === "primary").length;

  return Response.json(
    {
      apiKeyPresent: keySet,
      confidenceThreshold: CONFIDENCE_THRESHOLD,
      primariesHealthy: `${primariesOk}/${primariesTotal}`,
      models: results,
      checkedAt: new Date().toISOString(),
    },
    { status: keySet && primariesOk === primariesTotal ? 200 : 503 }
  );
}
