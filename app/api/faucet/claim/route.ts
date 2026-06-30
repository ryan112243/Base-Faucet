import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { username, initTime, turnstileToken, hCaptchaToken, walletAddress } = body;

    // --- Debug: 檢查接收到的 Token ---
    console.log("Received Token - Turnstile:", turnstileToken);
    console.log("Received Token - hCaptcha:", hCaptchaToken);

    // 1. 隱形蜜罐檢查
    if (username !== "") {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    // 2. 時間蜜罐檢查 (防範腳本)
    if (!initTime || Date.now() - initTime < 4000) {
      return NextResponse.json({ error: "Too fast, slow down" }, { status: 429 });
    }

    // 3. 錢包地址格式
    const walletRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!walletAddress || !walletRegex.test(walletAddress)) {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }

    const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";

    // 4. 正式 Turnstile 驗證
    if (!turnstileToken) {
      return NextResponse.json({ error: "Missing Turnstile token" }, { status: 400 });
    }

    const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
    const tsVerifyParams = new URLSearchParams();
    tsVerifyParams.append("secret", turnstileSecret || "");
    tsVerifyParams.append("response", turnstileToken);
    tsVerifyParams.append("remoteip", ip);

    const tsRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: tsVerifyParams,
    });
    const tsData = await tsRes.json();
    if (!tsData.success) {
      return NextResponse.json({ error: "Turnstile verification failed" }, { status: 400 });
    }

    // 4.5 正式 hCaptcha 驗證
    if (!hCaptchaToken) {
      return NextResponse.json({ error: "Missing hCaptcha token" }, { status: 400 });
    }

    const hcaptchaSecret = process.env.HCAPTCHA_SECRET_KEY;
    const hVerifyParams = new URLSearchParams();
    hVerifyParams.append("secret", hcaptchaSecret || "");
    hVerifyParams.append("response", hCaptchaToken);

    const hCaptchaRes = await fetch("https://hcaptcha.com/siteverify", {
      method: "POST",
      body: hVerifyParams,
    });
    const hCaptchaData = await hCaptchaRes.json();
    if (!hCaptchaData.success) {
      return NextResponse.json({ error: "hCaptcha verification failed" }, { status: 400 });
    }

    // 5. Supabase 處理 (保持不變)
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // 檢查歷史紀錄
    const { data: recentClaims } = await supabase
      .from("faucet_claims")
      .select("id")
      .or(`wallet_address.eq.${walletAddress},ip_address.eq.${ip}`)
      .gte("claimed_at", sevenDaysAgo);

    if (recentClaims && recentClaims.length > 0) {
      return NextResponse.json({ error: "You have already claimed in the last 7 days" }, { status: 429 });
    }

    // 6. 寫入隊列
    const { data: queuedItem, error: insertError } = await supabase
      .from("faucet_queue")
      .insert([{ wallet_address: walletAddress, ip_address: ip, status: "pending", amount_sent: 0.000001 }])
      .select()
      .single();

    if (insertError) return NextResponse.json({ error: "Queue error" }, { status: 500 });

    return NextResponse.json({ success: true, queueId: queuedItem.id }, { status: 200 });

  } catch (error: any) {
    return NextResponse.json({ error: "Server error: " + error.message }, { status: 500 });
  }
}
