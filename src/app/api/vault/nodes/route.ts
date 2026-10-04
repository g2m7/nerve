import { ensureMigrated, errorResponse, jsonResponse } from "@/lib/api-helper";
import { dbGet, dbMut } from "@/lib/db/repos";

export async function GET(req: Request) {
  try {
    await ensureMigrated();
    const url = new URL(req.url);
    const parentId = url.searchParams.has("parentId") ? url.searchParams.get("parentId") : undefined;
    const search = url.searchParams.get("search") || undefined;
    const nodes = await dbGet.fileNodes(parentId, search);
    return jsonResponse(nodes);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    await ensureMigrated();
    const body = await req.json();
    const created = await dbMut.createFileNode({
      parentId: body.parentId || null,
      name: body.name,
      type: body.type || "file",
      mimeType: body.mimeType,
      rawContent: body.rawContent || "",
      metadata: body.metadata || {},
    });
    return jsonResponse(created, 201);
  } catch (e) {
    return errorResponse(e);
  }
}
