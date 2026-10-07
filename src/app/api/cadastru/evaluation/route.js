import { NextResponse } from "next/server";
import { readCadastruEvaluationToken, recordCadastruEvaluationStep } from "@/lib/cadastru-evaluation-tracking";

export async function POST(request) {
  let token;
  try {
    ({ token } = await request.json());
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!readCadastruEvaluationToken(token)) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }
  const recorded = await recordCadastruEvaluationStep(token, "click");
  return NextResponse.json({ recorded });
}
