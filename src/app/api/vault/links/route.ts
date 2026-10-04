import { ensureMigrated, errorResponse, jsonResponse } from "@/lib/api-helper";
import { dbGet, dbMut } from "@/lib/db/repos";

export async function GET(req: Request) {
  try {
    await ensureMigrated();
    const url = new URL(req.url);
    const entityType = url.searchParams.get("entityType") || undefined;
    const entityId = url.searchParams.get("entityId") || undefined;
    const links = await dbGet.fileLinks(entityType, entityId);
    return jsonResponse(links);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    await ensureMigrated();
    const body = await req.json();
    const link = await dbMut.linkFileToEntity({
      fileNodeId: body.fileNodeId,
      entityType: body.entityType,
      entityId: body.entityId,
      relationType: body.relationType,
      includeInContext: body.includeInContext,
      notes: body.notes,
    });
    return jsonResponse(link, 201);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request) {
  try {
    await ensureMigrated();
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return errorResponse("Missing link id", 400);
    await dbMut.removeFileLink(id);
    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
