import { NextRequest } from "next/server";
import { analyse } from "@/lib/pipeline";

// Node runtime: the evidence layer uses fetch with redirect following and
// the pipeline can run well past the edge runtime's limits.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel Hobby ceiling

/**
 * Server-sent events, one per pipeline stage.
 *
 * The UI shows the system working through the problem rather than a
 * spinner, which is the whole point of "visible reasoning". A single
 * request/response would have been less code and a worse product.
 */
export async function POST(req: NextRequest) {
  let message = "";
  try {
    const body = await req.json();
    message = typeof body?.message === "string" ? body.message.trim() : "";
  } catch {
    return new Response(JSON.stringify({ error: "Body must be JSON: { message: string }" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!message) {
    return new Response(JSON.stringify({ error: "message is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (message.length > 8000) {
    return new Response(JSON.stringify({ error: "message is too long (8000 char limit)" }), {
      status: 413,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        for await (const ev of analyse(message)) send(ev);
      } catch (err: any) {
        send({ type: "error", message: err?.message ?? String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
