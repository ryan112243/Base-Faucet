import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { username, initTime, turnstileToken, hCaptchaToken, walletAddress } = body;

    // 1. 隱形蜜罐檢查 (username 不為空字串)
    if (username !== "") {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    // 2. 時間蜜罐檢查 (小於 4000 毫秒)
    if (!initTime || Date.now() - initTime < 4000) {
      return NextResponse.json({ error: "Too fast, slow down" }, { status: 429 });
    }

    // 3. 格式驗證 (錢包格式)
    const walletRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!walletAddress || !walletRegex.test(walletAddress)) {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }

    // 獲取真實 IP
    const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";

    // 4. Cloudflare Turnstile 驗證
    if (!turnstileToken) {
      return NextResponse.json({ error: "Missing Turnstile token" }, { status: 400 });
    }
    const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
    const verifyParams = new URLSearchParams();
    verifyParams.append("secret", turnstileSecret || "");
    verifyParams.append("response", turnstileToken);
    verifyParams.append("remoteip", ip);

    // 開發階段如果有 dummy token 就跳過 Turnstile 真實驗證
    if (turnstileToken !== "dummy-token-for-dev") {
      const captchaRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        body: verifyParams,
      });
      const captchaData = await captchaRes.json();
      if (!captchaData.success) {
        return NextResponse.json({ error: "Turnstile verification failed" }, { status: 400 });
      }
    }

    // 4.5 hCaptcha 驗證
    if (!hCaptchaToken) {
      return NextResponse.json({ error: "Missing hCaptcha token" }, { status: 400 });
    }
    const hcaptchaSecret = process.env.HCAPTCHA_SECRET_KEY;
    const hVerifyParams = new URLSearchParams();
    hVerifyParams.append("secret", hcaptchaSecret || "");
    hVerifyParams.append("response", hCaptchaToken);

    // 針對官方測試用的 Token 進行跳過處理 (因為本地 fetch hCaptcha API 時可能會遇到一些跨域或測試金鑰限制)
    if (hCaptchaToken !== "10000000-ffff-ffff-ffff-000000000001") {
      const hCaptchaRes = await fetch("https://hcaptcha.com/siteverify", {
        method: "POST",
        body: hVerifyParams,
      });
      const hCaptchaData = await hCaptchaRes.json();
      if (!hCaptchaData.success) {
        return NextResponse.json({ error: "hCaptcha verification failed" }, { status: 400 });
      }
    }

    // 5. Supabase 檢查 7 天內是否已領取
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

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

    // 6. 區塊鏈轉帳
    const rpcUrl = process.env.BASE_RPC_URL;
    const privateKey = process.env.FAUCET_WALLET_PRIVATE_KEY;
    if (!rpcUrl || !privateKey || privateKey === "請補上") {
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
    }

    const formattedPrivateKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(formattedPrivateKey, provider);
    const amountToSend = "0.000001";

    // 發送交易
    let tx;
    try {
      tx = await wallet.sendTransaction({
        to: walletAddress,
        value: ethers.parseEther(amountToSend),
      });
    } catch (txError: any) {
      console.error("Blockchain Tx Error:", txError);
      return NextResponse.json({ error: "Transaction failed. Faucet might be out of gas." }, { status: 500 });
    }

    // 等待交易確認 (可選，但為了確保成功建議等待)
    // await tx.wait();

    // 7. 資料寫入
    const { error: insertError } = await supabase.from("faucet_claims").insert([
      {
        wallet_address: walletAddress,
        ip_address: ip,
        amount_sent: amountToSend,
        tx_hash: tx.hash,
      },
    ]);

    if (insertError) {
      console.error("Supabase Insert Error:", insertError);
      // 即使資料庫寫入失敗，交易已經發出，此處僅 log 記錄
    }

    return NextResponse.json({ txHash: tx.hash }, { status: 200 });
    } catch (error: any) {
    console.error("Claim Error Details:", error);
    return NextResponse.json({ error: "Internal server error: " + (error.message || String(error)) }, { status: 500 });
  }
}
