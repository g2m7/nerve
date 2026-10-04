import { ensureMigrated, errorResponse, jsonResponse } from "@/lib/api-helper";
import { dbGet, dbMut } from "@/lib/db/repos";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureMigrated();
    const { id } = await params;
    const signal = await dbGet.signal(id);
    if (!signal) return errorResponse("Signal not found", 404);
    return jsonResponse(signal);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureMigrated();
    const { id } = await params;
    await dbMut.deleteSignal(id);
    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
