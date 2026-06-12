import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ResultCode: "ERROR",
      ResultMessage: "Paynet is not used by CatDai. Use Paddle webhooks.",
    },
    { status: 410 }
  );
}
