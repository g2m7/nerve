import { ensureMigrated, errorResponse, jsonResponse } from "@/lib/api-helper";
import { dbGet, dbMut } from "@/lib/db/repos";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureMigrated();
    const { id } = await params;
    const node = await dbGet.fileNode(id);
    if (!node) return errorResponse("File not found", 404);
    return jsonResponse(node);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureMigrated();
    const { id } = await params;
    const body = await req.json();
    const updated = await dbMut.updateFileNode(id, body);
    return jsonResponse(updated);
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
    await dbMut.deleteFileNode(id);
    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
