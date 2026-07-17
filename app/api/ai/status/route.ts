import { getLocalAiStatus } from "@/app/lib/local-ai";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getLocalAiStatus();
  return Response.json(status, {
    headers: { "Cache-Control": "no-store" },
  });
}
