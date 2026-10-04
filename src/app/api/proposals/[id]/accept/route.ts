import { ensureMigrated, errorResponse, jsonResponse } from "@/lib/api-helper";
import { acceptProposal } from "@/lib/proposals";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureMigrated();
    const { id } = await params;
    let note = "";
    try {
      const body = await req.json();
      note = String(body.note || "");
    } catch { /* empty */ }

    await acceptProposal(id, note);
    return jsonResponse({ ok: true, status: "accepted" });
  } catch (e) {
    return errorResponse(e);
  }
}
