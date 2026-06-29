import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { username, initTime, turnstileToken, hCaptchaToken, walletAddress } = body;

    // 1. 隱形蜜罐檢查 (Bot 通常會填寫隱藏欄位)
    if (username !== "") {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    // 2. 時間蜜罐檢查 (防範腳本光速提交，必須大於 4 秒)
    if (!initTime || Date.now() - initTime < 4000) {
      return NextResponse.json({ error: "Too fast, slow down" }, { status: 429 });
    }

    // 3. 錢包地址格式驗證
    const walletRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!walletAddress || !walletRegex.test(walletAddress)) {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }

    // 獲取真實用戶 IP
    const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";

    // 4. Cloudflare Turnstile 安全驗證 (進站/防護第一關)
    if (!turnstileToken) {
      return NextResponse.json({ error: "Missing Turnstile token" }, { status: 400 });
    }
    if (turnstileToken !== "dummy-token-for-dev") {
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
        return NextResponse.json({ error: "Turnstile verification failed" }, { status: 400 });
      }
    }

    // 4.5 hCaptcha 驗證 (點擊領取防護第二關)
    if (!hCaptchaToken) {
      return NextResponse.json({ error: "Missing hCaptcha token" }, { status: 400 });
    }
    if (hCaptchaToken !== "10000000-ffff-ffff-ffff-000000000001") {
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
    }

    // 5. 初始化 Supabase (使用最高權限 service_role 金鑰以繞过 RLS 的 public 限制)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // 5.1 檢查歷史總表 (faucet_claims) 是否在 7 天內已成功領取過
    const { data: recentClaims, error: dbError } = await supabase
      .from("faucet_claims")
      .select("id")
      .or(`wallet_address.eq.${walletAddress},ip_address.eq.${ip}`)
      .gte("claimed_at", sevenDaysAgo);

    if (dbError) {
      console.error("Supabase DB Error:", dbError);
      return NextResponse.json({ error: "Database error: " + dbError.message }, { status: 500 });
    }

    if (recentClaims && recentClaims.length > 0) {
      return NextResponse.json({ error: "You have already claimed in the last 7 days" }, { status: 429 });
    }

    // 5.2 檢查目前是否正處於「排隊隊列中」
    // 避免使用者在第一筆交易還沒打出去之前，利用網頁重整重複送出造成資料重複塞入
    const { data: pendingClaims, error: queueCheckError } = await supabase
      .from("faucet_queue")
      .select("id")
      .or(`wallet_address.eq.${walletAddress},ip_address.eq.${ip}`)
      .eq("status", "pending");

    if (queueCheckError) {
      console.error("Queue Check Error:", queueCheckError);
      return NextResponse.json({ error: "Database verification failed" }, { status: 500 });
    }

    if (pendingClaims && pendingClaims.length > 0) {
      return NextResponse.json({ error: "You are already in the queue. Please wait for dispatch." }, { status: 429 });
    }

    // 6. 省錢核心核心：將請求寫入您的 faucet_queue 資料表
    const amountToSend = 0.000001;
    const { data: queuedItem, error: insertQueueError } = await supabase
      .from("faucet_queue")
      .insert([
        {
          wallet_address: walletAddress,
          ip_address: ip,
          status: "pending",
          amount_sent: amountToSend
        }
      ])
      .select()
      .single();

    if (insertQueueError) {
      console.error("Supabase Queue Insert Error:", insertQueueError);
      return NextResponse.json({ error: "Failed to queue your request" }, { status: 500 });
    }

    // 7. 動態觸發自動批次發送 (最省手續費做法)
    // 檢查目前資料庫中有多少個正在 pending 的人
    const { count } = await supabase
      .from("faucet_queue")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

    // 只要積累滿 10 人，就自動在後台異步呼叫 process-queue 進行一網打盡式批量發送
    // 這裡使用非同步 fetch，不 await 它，不會卡住當前使用者的回應速度
    if (count && count >= 10) {
      const baseUrl = new URL(req.url).origin;
      fetch(`${baseUrl}/api/faucet/process-queue`, { 
        method: "POST" 
      }).catch((err) => console.error("Background queue process trigger failed:", err));
    }

    // 返回成功排隊的狀態
    return NextResponse.json({ 
      success: true, 
      message: "Successfully added to dispatch queue.", 
      queueId: queuedItem.id 
    }, { status: 200 });

  } catch (error: any) {
    console.error("Claim Error Details:", error);
    return NextResponse.json({ error: "Internal server error: " + (error.message || String(error)) }, { status: 500 });
  }
}
