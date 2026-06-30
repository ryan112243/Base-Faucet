import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getPendingCount, processQueue } from "../../../lib/processQueue";

const BATCH_SIZE = 15;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, initTime, hCaptchaToken, walletAddress } = body;

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

    const ip =
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      "unknown";

    // 4. hCaptcha 驗證（每次點擊「領取」都要重新驗證；Turnstile 已在進站時驗證過，這裡不再需要）
    if (!hCaptchaToken) {
      return NextResponse.json({ error: "Missing hCaptcha token" }, { status: 400 });
    }

    const hcaptchaSecret = process.env.HCAPTCHA_SECRET_KEY || "";
    const hVerifyParams = new URLSearchParams();
    hVerifyParams.append("secret", hcaptchaSecret);
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

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 5. IP 黑名單檢查（若尚未建立 blocked_ips 表，會自動忽略不阻擋）
    try {
      const { data: blocked } = await supabase
        .from("blocked_ips")
        .select("ip_address")
        .eq("ip_address", ip)
        .maybeSingle();

      if (blocked) {
        return NextResponse.json({ error: "Your IP has been blocked" }, { status: 403 });
      }
    } catch (e) {
      console.warn("blocked_ips 表查詢失敗（可能尚未建立），略過此檢查:", e);
    }

    // 6. 7 天內是否已經成功領取過
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: recentClaims, error: dbError } = await supabase
      .from("faucet_claims")
      .select("id")
      .or(`wallet_address.eq.${walletAddress},ip_address.eq.${ip}`)
      .gte("claimed_at", sevenDaysAgo);

    if (dbError) {
      console.error("查詢 faucet_claims 失敗:", dbError);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
    if (recentClaims && recentClaims.length > 0) {
      return NextResponse.json({ error: "Already claimed within 7 days" }, { status: 429 });
    }

    // 7. 是否已經在隊列中、尚未處理完成
    const { data: pendingDuplicate } = await supabase
      .from("faucet_queue")
      .select("id")
      .or(`wallet_address.eq.${walletAddress},ip_address.eq.${ip}`)
      .in("status", ["pending", "processing"]);

    if (pendingDuplicate && pendingDuplicate.length > 0) {
      return NextResponse.json({ error: "Your claim is already in the queue" }, { status: 429 });
    }

    // 8. 寫入隊列
    const { data: queuedItem, error: insertQueueError } = await supabase
      .from("faucet_queue")
      .insert([
        {
          wallet_address: walletAddress,
          ip_address: ip,
          status: "pending",
          amount_sent: 0.000001,
        },
      ])
      .select()
      .single();

    if (insertQueueError) {
      console.error("寫入隊列失敗:", insertQueueError);
      return NextResponse.json({ error: "Failed to queue" }, { status: 500 });
    }

    // 9. 滿 15 筆就立即觸發批次發送；未滿則交給 Cron Job 在 1 小時內處理
    const pendingCount = await getPendingCount();
    if (pendingCount >= BATCH_SIZE) {
      await processQueue();
    }

    // 10. 回查這筆紀錄目前狀態，回傳對應結果給前端
    const { data: finalItem } = await supabase
      .from("faucet_queue")
      .select("status, tx_hash")
      .eq("id", queuedItem.id)
      .single();

    if (finalItem?.status === "sent") {
      return NextResponse.json(
        { success: true, txHash: finalItem.tx_hash, message: "Success!" },
        { status: 200 }
      );
    }

    if (finalItem?.status === "failed") {
      return NextResponse.json(
        { error: "Failed to send transaction. Please try again later." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        queueId: queuedItem.id,
        queued: true,
        message: "Queued. It will be sent automatically (every 15 claims or within 1 hour).",
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("系統錯誤:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
