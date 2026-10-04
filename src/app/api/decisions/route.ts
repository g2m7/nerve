import { ensureMigrated, errorResponse, jsonResponse } from "@/lib/api-helper";
import { dbGet } from "@/lib/db/repos";

export async function GET() {
  try {
    await ensureMigrated();
    const decisions = await dbGet.decisions();
    return jsonResponse(decisions);
  } catch (e) {
    return errorResponse(e);
  }
}
