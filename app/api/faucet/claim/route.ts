import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { username, initTime, turnstileToken, hCaptchaToken, walletAddress } = body;

    // --- 【除錯用】請查看你的伺服器終端機日誌 ---
    console.log("後端接收到的數據:", { 
      hasTurnstile: !!turnstileToken, 
      hasHCaptcha: !!hCaptchaToken,
      wallet: walletAddress 
    });

    // 1. 隱形蜜罐檢查
    if (username !== "") {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    // 2. 時間蜜罐檢查 (必須大於 4 秒)
    if (!initTime || Date.now() - initTime < 4000) {
      return NextResponse.json({ error: "Too fast, slow down" }, { status: 429 });
    }

    // 3. 錢包地址驗證
    const walletRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!walletAddress || !walletRegex.test(walletAddress)) {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }

    const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";

    // 4. Cloudflare Turnstile 驗證
    if (!turnstileToken) {
      console.error("驗證失敗: turnstileToken 為空");
      return NextResponse.json({ error: "Missing Turnstile token" }, { status: 400 });
    }

    const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
    const verifyParams = new URLSearchParams();
    verifyParams.append("secret", turnstileSecret || "");
    verifyParams.append("response", turnstileToken);
    verifyParams.append("remoteip", ip);

    const captchaRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: verifyParams,
    });
    const captchaData = await captchaRes.json();
    
    if (!captchaData.success) {
      console.error("Turnstile 驗證 API 錯誤:", captchaData);
      return NextResponse.json({ error: "Turnstile verification failed" }, { status: 400 });
    }

    // 4.5 hCaptcha 驗證
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
      console.error("hCaptcha 驗證 API 錯誤:", hCaptchaData);
      return NextResponse.json({ error: "hCaptcha verification failed" }, { status: 400 });
    }

    // 5. Supabase 處理
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: recentClaims, error: dbError } = await supabase
      .from("faucet_claims")
      .select("id")
      .or(`wallet_address.eq.${walletAddress},ip_address.eq.${ip}`)
      .gte("claimed_at", sevenDaysAgo);

    if (dbError) return NextResponse.json({ error: "Database error" }, { status: 500 });
    if (recentClaims && recentClaims.length > 0) return NextResponse.json({ error: "Already claimed" }, { status: 429 });

    // 6. 寫入隊列
    const { data: queuedItem, error: insertQueueError } = await supabase
      .from("faucet_queue")
      .insert([{ wallet_address: walletAddress, ip_address: ip, status: "pending", amount_sent: 0.000001 }])
      .select()
      .single();

    if (insertQueueError) return NextResponse.json({ error: "Failed to queue" }, { status: 500 });

    return NextResponse.json({ success: true, queueId: queuedItem.id }, { status: 200 });

  } catch (error: any) {
    console.error("系統錯誤:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
