import { ensureMigrated, errorResponse, jsonResponse } from "@/lib/api-helper";
import { dbGet } from "@/lib/db/repos";

export async function GET() {
  try {
    await ensureMigrated();
    const runs = await dbGet.agentRuns();
    return jsonResponse(runs);
  } catch (e) {
    return errorResponse(e);
  }
}
