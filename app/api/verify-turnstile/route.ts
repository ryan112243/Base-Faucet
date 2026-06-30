import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { turnstileToken } = await req.json();

    if (!turnstileToken) {
      return NextResponse.json({ error: "Missing Turnstile token" }, { status: 400 });
    }

    const ip =
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      "unknown";

    const secret = process.env.TURNSTILE_SECRET_KEY || "";
    const params = new URLSearchParams();
    params.append("secret", secret);
    params.append("response", turnstileToken);
    params.append("remoteip", ip);

    const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: params,
    });
    const verifyData = await verifyRes.json();

    if (!verifyData.success) {
      console.error("Turnstile 驗證失敗:", verifyData);
      return NextResponse.json({ error: "Turnstile verification failed" }, { status: 400 });
    }

    // 驗證成功就結束，不發 Cookie、不記錄任何狀態
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("verify-turnstile 系統錯誤:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}