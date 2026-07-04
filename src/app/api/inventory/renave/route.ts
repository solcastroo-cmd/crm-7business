import { NextRequest, NextResponse } from "next/server";
import { renaveService, RenaveStatus } from "@/lib/renaveService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const vehicleId = searchParams.get("vehicleId");
  if (!vehicleId) return NextResponse.json({ error: "vehicleId obrigatorio" }, { status: 400 });

  try {
    const [status, history] = await Promise.all([
      renaveService.getStatus(vehicleId),
      renaveService.getHistory(vehicleId),
    ]);
    return NextResponse.json({ ...status, history });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const vehicleId = searchParams.get("vehicleId");
  if (!vehicleId) return NextResponse.json({ error: "vehicleId obrigatorio" }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Body invalido" }, { status: 400 }); }

  try {
    if (typeof body.gravame_number === "string") {
      await renaveService.setGravameNumber(vehicleId, body.gravame_number);
    }
    if (typeof body.status === "string") {
      await renaveService.submitStatusChange({
        vehicleId,
        status: body.status as RenaveStatus,
        notes: typeof body.notes === "string" ? body.notes : undefined,
        changedBy: typeof body.changed_by === "string" ? body.changed_by : undefined,
      });
    }
    const status = await renaveService.getStatus(vehicleId);
    return NextResponse.json(status);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
