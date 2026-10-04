import { ensureMigrated, errorResponse, jsonResponse } from "@/lib/api-helper";
import { dbGet } from "@/lib/db/repos";
import { computeNow } from "@/lib/prioritize";

export async function GET() {
  try {
    await ensureMigrated();
    const tasks = await dbGet.tasks();
    const nowView = computeNow(tasks);
    return jsonResponse(nowView);
  } catch (e) {
    return errorResponse(e);
  }
}
