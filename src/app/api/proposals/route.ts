import { ensureMigrated, errorResponse, jsonResponse } from "@/lib/api-helper";
import { dbGet } from "@/lib/db/repos";

export async function GET(req: Request) {
  try {
    await ensureMigrated();
    const url = new URL(req.url);
    const status = url.searchParams.get("status") || undefined;
    const proposals = await dbGet.proposals(status);
    return jsonResponse(proposals);
  } catch (e) {
    return errorResponse(e);
  }
}
