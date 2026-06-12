import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "paynet_disabled",
      message: "Paynet is not used by CatDai. Use Paddle payment routes.",
    },
    { status: 410 }
  );
}
