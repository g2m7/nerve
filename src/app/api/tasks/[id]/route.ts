import { ensureMigrated, errorResponse, jsonResponse } from "@/lib/api-helper";
import { dbGet, dbMut } from "@/lib/db/repos";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureMigrated();
    const { id } = await params;
    const task = await dbGet.task(id);
    if (!task) return errorResponse("Task not found", 404);
    return jsonResponse(task);
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
    const updated = await dbMut.updateTask(id, body, body.expectedRevision);
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
    await dbMut.deleteTask(id);
    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
