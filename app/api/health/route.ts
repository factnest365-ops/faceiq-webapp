import { NextResponse } from "next/server";

export async function GET(): Promise<Response> {
  return NextResponse.json({
    service: "faceiq-webapp",
    status: "ok",
    ts: new Date().toISOString(),
  });
}
