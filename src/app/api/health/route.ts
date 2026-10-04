import { ensureMigrated, jsonResponse } from "@/lib/api-helper";
import { getDb } from "@/lib/db/index";

export async function GET() {
  await ensureMigrated();
  const db = await getDb();
  return jsonResponse({
    ok: true,
    engine: db.isPglite ? "PostgreSQL (PGlite embedded)" : "PostgreSQL (Remote/Pool)",
    time: new Date().toISOString(),
  });
}
