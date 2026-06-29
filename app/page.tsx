"use client";

import { useState, useEffect, useRef } from "react";
import { Turnstile } from "@marsidev/react-turnstile";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { useForm } from "react-hook-form";
import Link from "next/link";

type FormData = {
  walletAddress: string;
  username: string; // Honeypot
};

export default function FaucetPage() {
  const [lang, setLang] = useState<"en" | "zh">("en");
  const [initTime, setInitTime] = useState<number>(0);
  const [turnstileToken, setTurnstileToken] = useState<string>("");
  const [hCaptchaToken, setHCaptchaToken] = useState<string>("");
  const [isHumanVerified, setIsHumanVerified] = useState<boolean>(false);
  const [faucetInfo, setFaucetInfo] = useState<{ balance: string; remaining: number } | null>(null);
  const [hasAdBlock, setHasAdBlock] = useState<boolean>(false);
  const [status, setStatus] = useState<{ type: "idle" | "loading" | "success" | "error"; message: string }>({
    type: "idle",
    message: "",
  });
  const hCaptchaRef = useRef<HCaptcha>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>();

  useEffect(() => {
    const savedLang = localStorage.getItem("lang") as "en" | "zh" | null;
    if (savedLang) {
      setLang(savedLang);
    }
    setInitTime(Date.now());

    // 取得水龍頭餘額與可發送次數
    fetch("/api/faucet/info")
      .then(res => res.json())
      .then(data => {
        if (data.balance) {
          setFaucetInfo({ balance: data.balance, remaining: data.remainingClaims });
        }
      })
      .catch(err => console.error("Failed to fetch faucet info:", err));

    // 偵測 AdBlocker
    const checkAdBlock = () => {
      const ad = document.createElement('div');
      ad.className = 'adsbox'; // 常見的廣告攔截特徵 class
      ad.style.height = '1px';
      ad.style.width = '1px';
      ad.style.position = 'absolute';
      ad.style.top = '-1000px';
      document.body.appendChild(ad);

      setTimeout(() => {
        if (ad.offsetHeight === 0) {
          setHasAdBlock(true);
        }
        ad.remove();
      }, 300);
    };
    checkAdBlock();
  }, []);

  const onSubmit = async (data: FormData) => {
    if (hasAdBlock) return;

    if (!turnstileToken || !hCaptchaToken) {
      setStatus({
        type: "error",
        message: lang === "en" ? "Please complete all captcha verifications." : "請完成所有驗證碼。",
      });
      return;
    }

    setStatus({ type: "loading", message: lang === "en" ? "Sending transaction..." : "交易發送中..." });

    try {
      const response = await fetch("/api/faucet/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: data.walletAddress,
          username: data.username,
          initTime,
          turnstileToken,
          hCaptchaToken,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || (lang === "en" ? "Failed to claim." : "領取失敗。"));
      }

      setStatus({
        type: "success",
        message:
          lang === "en"
            ? `Success! TxHash: ${result.txHash}`
            : `成功！交易哈希: ${result.txHash}`,
      });
      
      // 更新餘額
      if (faucetInfo) {
        setFaucetInfo({
          balance: (parseFloat(faucetInfo.balance) - 0.000001).toFixed(6),
          remaining: Math.max(0, faucetInfo.remaining - 1)
        });
      }

      if (hCaptchaRef.current) {
        hCaptchaRef.current.resetCaptcha();
      }
      setHCaptchaToken("");
    } catch (err: any) {
      setStatus({ type: "error", message: err.message });
    }
  };

  // 暫時將驗證狀態設為 true 以方便預覽
  useEffect(() => {
    setIsHumanVerified(true);
    // 開發階段為了能發送 API，也給一個假的 turnstile token
    setTurnstileToken("dummy-token-for-dev");
  }, []);

  return (
    <div className="min-h-screen bg-[#11141c] text-gray-200 flex flex-col font-sans">
      {/* 頂部導覽列（修正：加上 relative z-[100000] 確保 Mining 點擊不被廣告遮擋） */}
      <nav className="relative z-[100000] flex items-center justify-between bg-[#1a1e29] border-b border-gray-800">
        <div className="flex">
          <Link 
            href="/" 
            prefetch={false}
            className="px-6 py-4 bg-blue-600 text-white font-semibold transition"
          >
            Faucet
          </Link>
          <Link 
            href="/mine" 
            prefetch={false}
            className="px-6 py-4 text-gray-300 hover:text-white transition"
          >
            Mining
          </Link>
        </div>
        <div className="px-6">
          <button
            onClick={() => {
              const newLang = lang === "en" ? "zh" : "en";
              setLang(newLang);
              localStorage.setItem("lang", newLang);
            }}
            className="text-sm text-gray-300 hover:text-white transition"
          >
            {lang === "en" ? "切換至中文" : "Switch to English"}
          </button>
        </div>
      </nav>

      {/* 最上方廣告 Banner */}
      <div className="flex justify-center w-full mt-6 px-4">
        {/* Start rollercoin.com code */}
        <a href="https://rollercoin.com/?r=mn67zsfp" target="_blank" rel="noopener noreferrer">
          <img src="https://static.rollercoin.com/static/img/ref/gen2/w970h90.gif" alt="970h90" className="max-w-full h-auto rounded shadow-lg shadow-blue-500/10"/>
        </a>
        {/* End rollercoin.com code */}
      </div>

      {/* 包含左右廣告的 Grid 佈局 */}
      <div className="flex flex-col md:flex-row w-full max-w-7xl mx-auto px-4 py-8 gap-6 flex-grow">
        
        {/* 左側廣告 (修正：移除了 bg-[#1a1e29] 與邊框，使其完全透明不突兀) */}
        <aside className="hidden md:flex w-[160px] lg:w-[300px] items-center justify-center text-gray-600 text-sm overflow-hidden">
          <div
            dangerouslySetInnerHTML={{
              __html: `
<div style="position: absolute; z-index: 99999">
      <input autocomplete="off" type="checkbox" id="aadsstickymqz3a94f" hidden />
      <div style="padding-top: 0; padding-bottom: 0;">
        <div style="width:15%;height:100%;position:fixed;text-align:center;font-size:0;top:50%;transform:translateY(-50%);left:0;min-width:100px">
          <label for="aadsstickymqz3a94f" style="bottom: 24px;margin:0 auto;right:0;left:0;max-width:24px; position: absolute;border-radius: 4px; background: rgba(248, 248, 249, 0.70); padding: 4px;z-index: 99999;cursor:pointer">
            <svg fill="#000000" height="16px" width="16px" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 490 490">
              <polygon points="456.851,0 245,212.564 33.149,0 0.708,32.337 212.669,245.004 0.708,457.678 33.149,490 245,277.443 456.851,490 489.292,457.678 277.331,245.004 489.292,32.337 "/>
            </svg>
          </label>
          <div id="frame" style="width: 100%;margin: auto;position: relative; z-index: 99998;height:100%; display: flex;flex-direction: column; justify-content: center">
                        <iframe data-aa=2446091 src=//acceptable.a-ads.com/2446091/?size=Adaptive&background_color=000000&title_color=0027f2&title_hover_color=ffffff&text_color=NaNNaNNaN style='border:0; padding:0; width:70%; height:70%; overflow:hidden; margin: 0 auto'></iframe>
                    </div>
        </div>
        <style>
      #aadsstickymqz3a94f:checked + div {
        display: none;
      }
    </style>
    </div></div>
`
            }}
          />
        </aside>

        {/* 中央主要內容 */}
        <main className="flex-1 flex flex-col items-center">
          <h1 className="text-5xl md:text-6xl font-bold text-blue-500 mb-6 tracking-wide text-center">
            Base Faucet
          </h1>

          {/* 資訊區塊 */}
          <div className="text-center space-y-2 mb-8 text-gray-300 w-full">
            <p>
              {lang === "en" 
                ? "We are the Base mainnet faucet!" 
                : "我們是 Base 主網水龍頭！"}
            </p>
            <p className="text-blue-400 font-semibold mt-2">
              {lang === "en" 
                ? "This faucet is dedicated to helping new users who don't have gas fees." 
                : "此水龍頭致力於幫助沒有手續費的新手。"}
            </p>
            
            <div className="py-4">
              <p>
                {lang === "en" ? "Donation Address:" : "打賞地址:"}{" "}
                <span className="text-gray-100 font-mono text-sm md:text-base break-all">0x6998C387c2cdAeC57AE48167e2d8CDADA666D178</span>
              </p>
              <p>
                {lang === "en" ? "Reward Amount:" : "獎勵數量:"}{" "}
                <span className="text-gray-100">0.000001 ETH</span>
              </p>
              <p>
                {lang === "en" ? "Claim Time:" : "領取限制:"}{" "}
                <span className="text-gray-100">
                  {lang === "en" 
                    ? "1 Claim per 7 Days per IP/Wallet" 
                    : "每個 IP 與錢包地址每 7 天限領一次"}
                </span>
              </p>
            </div>

            {/* 餘額狀態區塊 */}
            {faucetInfo && (
              <div className="mt-2 p-4 bg-blue-900/10 border border-blue-500/30 rounded-lg inline-block text-left min-w-[280px]">
                <p className="flex justify-between border-b border-blue-500/20 pb-2 mb-2">
                  <span className="text-gray-400">{lang === "en" ? "Faucet Balance:" : "水龍頭餘額:"}</span>
                  <span className="text-white font-mono">{faucetInfo.balance} ETH</span>
                </p>
                <p className="flex justify-between">
                  <span className="text-gray-400">{lang === "en" ? "Remaining Claims:" : "剩餘發送次數:"}</span>
                  <span className="text-blue-400 font-bold">{faucetInfo.remaining}</span>
                </p>
              </div>
            )}
          </div>

          {/* AdBlock 警告 */}
          {hasAdBlock && (
            <div className="w-full max-w-lg mb-6 p-4 rounded-md text-sm bg-red-500/10 text-red-400 border border-red-500/30 text-center font-bold">
              {lang === "en" 
                ? "Ad-blocker detected! Please disable your ad-blocker to claim." 
                : "偵測到廣告攔截器！請關閉廣告攔截器後才能領取水龍頭。"}
            </div>
          )}

          <p className="mb-4 text-gray-300">
            {lang === "en" ? "Enter your wallet address here:" : "請在此輸入您的錢包地址："}
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-lg flex flex-col items-center space-y-6">
            {/* 隱形蜜罐 Honeypot */}
            <div className="opacity-0 absolute pointer-events-none">
              <label htmlFor="username" aria-hidden="true">Username</label>
              <input
                id="username"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                {...register("username")}
              />
            </div>

            <div className="w-full">
              <input
                type="text"
                disabled={hasAdBlock}
                placeholder={lang === "en" ? "Wallet address" : "錢包地址"}
                className={`w-full bg-transparent border-2 ${
                  errors.walletAddress ? "border-red-500" : "border-blue-500"
                } rounded-md px-4 py-3 text-white focus:outline-none focus:border-blue-400 transition ${hasAdBlock ? 'opacity-50 cursor-not-allowed' : ''}`}
                {...register("walletAddress", {
                  required: true,
                  pattern: /^0x[a-fA-F0-9]{40}$/,
                })}
              />
              {errors.walletAddress && (
                <p className="mt-2 text-sm text-red-500 text-center">
                  {lang === "en"
                    ? "Please enter a valid EVM address."
                    : "請輸入有效的 EVM 地址。"}
                </p>
              )}
            </div>

            <div className="flex justify-center w-full">
              <HCaptcha
                sitekey={process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY || "10000000-ffff-ffff-ffff-000000000001"}
                onVerify={(token) => setHCaptchaToken(token)}
                ref={hCaptchaRef}
                theme="dark"
              />
            </div>

            <button
              type="submit"
              disabled={status.type === "loading" || hasAdBlock}
              className={`w-full py-3 rounded-md font-bold transition text-white ${
                status.type === "loading" || hasAdBlock
                  ? "bg-gray-600 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-500"
              }`}
            >
              {status.type === "loading"
                ? lang === "en"
                  ? "Processing..."
                  : "處理中..."
                : lang === "en"
                ? "Claim"
                : "領取"}
            </button>

            {status.message && (
              <div
                className={`w-full p-4 rounded-md text-sm break-all text-center ${
                  status.type === "error"
                    ? "bg-red-500/10 text-red-400 border border-red-500/20"
                    : status.type === "success"
                    ? "bg-green-500/10 text-green-400 border border-green-500/20"
                    : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                }`}
              >
                {status.message}
              </div>
            )}
          </form>
        </main>

        {/* 右側廣告 (修正：移除了 bg-[#1a1e29] 與邊框，使其完全透明不突兀) */}
        <aside className="hidden md:flex w-[160px] lg:w-[300px] items-center justify-center text-gray-600 text-sm overflow-hidden">
          <div
            dangerouslySetInnerHTML={{
              __html: `
<div style="position: absolute; z-index: 99999">
      <input autocomplete="off" type="checkbox" id="aadsstickymqz3rgu0" hidden />
      <div style="padding-top: 0; padding-bottom: 0;">
        <div style="width:15%;height:100%;position:fixed;text-align:center;font-size:0;top:50%;transform:translateY(-50%);right:0;min-width:100px">
          <label for="aadsstickymqz3rgu0" style="bottom: 24px;margin:0 auto;right:0;left:0;max-width:24px; position: absolute;border-radius: 4px; background: rgba(248, 248, 249, 0.70); padding: 4px;z-index: 99999;cursor:pointer">
            <svg fill="#000000" height="16px" width="16px" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 490 490">
              <polygon points="456.851,0 245,212.564 33.149,0 0.708,32.337 212.669,245.004 0.708,457.678 33.149,490 245,277.443 456.851,490 489.292,457.678 277.331,245.004 489.292,32.337 "/>
            </svg>
          </label>
          <div id="frame" style="width: 100%;margin: auto;position: relative; z-index: 99998;height:100%; display: flex;flex-direction: column; justify-content: center">
                        <iframe data-aa=2446093 src=//acceptable.a-ads.com/2446093/?size=Adaptive style='border:0; padding:0; width:70%; height:70%; overflow:hidden; margin: 0 auto'></iframe>
                    </div>
        </div>
        <style>
      #aadsstickymqz3rgu0:checked + div {
        display: none;
      }
    </style>
    </div></div>
`
            }}
          />
        </aside>
      </div>

      {/* 下方廣告 */}
      <div className="w-full max-w-7xl mx-auto px-4 pb-12">
        <div className="w-full bg-[#1a1e29] border border-gray-800 rounded-lg flex items-center justify-center text-gray-600 text-sm h-32">
          {lang === "en" ? "Bottom Ad Space" : "下方廣告版位"}
        </div>
      </div>
    </div>
  );
}
