import { NextResponse } from "next/server";
import { migratePg } from "./db/migrate";

let migrated = false;

export async function ensureMigrated() {
  if (!migrated) {
    await migratePg();
    migrated = true;
  }
}

export function jsonResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function errorResponse(err: unknown, status = 400) {
  const message = err instanceof Error ? err.message : String(err);
  return NextResponse.json({ error: message }, { status });
}
