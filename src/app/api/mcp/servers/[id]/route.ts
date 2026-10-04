import { ensureMigrated, errorResponse, jsonResponse } from "@/lib/api-helper";
import { dbMut } from "@/lib/db/repos";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureMigrated();
    const { id } = await params;
    await dbMut.deleteMcpServer(id);
    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
