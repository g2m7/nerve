import { ensureMigrated, errorResponse, jsonResponse } from "@/lib/api-helper";
import { dbGet, dbMut } from "@/lib/db/repos";

export async function GET() {
  try {
    await ensureMigrated();
    const vision = await dbGet.vision();
    return jsonResponse(vision);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PUT(req: Request) {
  try {
    await ensureMigrated();
    const body = await req.json();
    const text = String(body.text ?? "");
    const updated = await dbMut.setVision(text);
    return jsonResponse(updated);
  } catch (e) {
    return errorResponse(e);
  }
}
