import { ensureMigrated, errorResponse, jsonResponse } from "@/lib/api-helper";
import { dbGet, dbMut } from "@/lib/db/repos";

export async function GET() {
  try {
    await ensureMigrated();
    const bets = await dbGet.bets();
    return jsonResponse(bets);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    await ensureMigrated();
    const body = await req.json();
    const created = await dbMut.createBet(body);
    return jsonResponse(created, 201);
  } catch (e) {
    return errorResponse(e);
  }
}
