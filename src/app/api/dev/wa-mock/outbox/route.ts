import { mockGuard } from "@/lib/dev-guard";
import { getWaMockState, resetWaMockState } from "@/server/dev/wa-mock-state";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = mockGuard();
  if (guard) return guard;
  const state = getWaMockState();
  return Response.json({ outbox: state.outbox, uploads: state.uploads, lecturas: state.lecturas });
}

export async function DELETE() {
  const guard = mockGuard();
  if (guard) return guard;
  resetWaMockState();
  return Response.json({ cleared: true });
}
