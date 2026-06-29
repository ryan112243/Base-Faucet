"use client";

import { useState, useEffect, useRef } from "react";
import { Turnstile } from "@marsidev/react-turnstile";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { useForm } from "react-hook-form";
import Link from "next/link";
import Script from "next/script";

type FormData = {
  walletAddress: string;
  username: string;
};

export default function FaucetPage() {
  const [lang, setLang] = useState<"en" | "zh">("en");
  const [initTime, setInitTime] = useState<number>(0);
  const [turnstileToken, setTurnstileToken] = useState<string>("");
  const [hCaptchaToken, setHCaptchaToken] = useState<string>("");
  const [faucetInfo, setFaucetInfo] = useState<{ balance: string; remaining: number } | null>(null);
  const [hasAdBlock, setHasAdBlock] = useState<boolean>(false);
  const [isCheckingAdBlock, setIsCheckingAdBlock] = useState<boolean>(true);
  const [status, setStatus] = useState<{ type: "idle" | "loading" | "success" | "error"; message: string }>({
    type: "idle",
    message: "",
  });
  
  const hCaptchaRef = useRef<HCaptcha>(null);
  const bannerRef = useRef<HTMLDivElement>(null);

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

    fetch("/api/faucet/info")
      .then(res => res.json())
      .then(data => {
        if (data.balance) {
          setFaucetInfo({ balance: data.balance, remaining: data.remainingClaims });
        }
      })
      .catch(err => console.error("Failed to fetch faucet info:", err));

    const checkAdBlock = () => {
      const ad = document.createElement('div');
      ad.className = 'adsbox';
      ad.style.height = '1px';
      ad.style.width = '1px';
      ad.style.position = 'absolute';
      ad.style.top = '-1000px';
      document.body.appendChild(ad);

      setTimeout(() => {
        if (ad.offsetHeight === 0) {
          setHasAdBlock(true);
        } else {
          setHasAdBlock(false);
        }
        ad.remove();
        setIsCheckingAdBlock(false);
      }, 500);
    };
    checkAdBlock();
  }, []);

  useEffect(() => {
    if (bannerRef.current) {
        (window as any).atOptions = {
            'key' : 'e3e91465d5025ecf8016d35a4e7cb47e',
            'format' : 'iframe',
            'height' : 90,
            'width' : 728,
            'params' : {}
        };
        const script = document.createElement('script');
        script.src = 'https://www.highperformanceformat.com/e3e91465d5025ecf8016d35a4e7cb47e/invoke.js';
        script.async = true;
        bannerRef.current.innerHTML = '';
        bannerRef.current.appendChild(script);
    }
  }, []);

  const onSubmit = async (data: FormData) => {
    if (hasAdBlock) return;

    if (!turnstileToken && !hCaptchaToken) {
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
        message: lang === "en" ? `Success! TxHash: ${result.txHash}` : `成功！交易哈希: ${result.txHash}`,
      });
      
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

  if (!isCheckingAdBlock && hasAdBlock) {
    return (
      <div className="min-h-screen bg-[#11141c] flex items-center justify-center text-center p-6">
        <div className="bg-[#1a1e29] border border-red-500/50 p-8 rounded-xl shadow-2xl max-w-md w-full">
          <h1 className="text-3xl font-bold text-red-500 mb-4">AdBlocker Detected</h1>
          <p className="text-gray-300 mb-6">
            {lang === "en" 
              ? "Please disable your ad-blocker to access this site. We rely on ads to keep this faucet running." 
              : "請關閉廣告攔截器以繼續使用本網站。我們需要廣告收入來維持水龍頭運作。"}
          </p>
          <button onClick={() => window.location.reload()} className="bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-6 rounded-lg transition">
            {lang === "en" ? "Retry" : "重試"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#11141c] text-gray-200 flex flex-col font-sans relative">
      <Script src="https://pl30126738.effectivecpmnetwork.com/ca/2f/d7/ca2fd7301eb71fa1a4a9cd38a2e875d9.js" strategy="afterInteractive" />
      <Script src="https://pl30126739.effectivecpmnetwork.com/57/d4/23/57d4234a5a64fee8d0b62c5126ececce.js" strategy="afterInteractive" />

      <div dangerouslySetInnerHTML={{ __html: `
        <div style="position: absolute; z-index: 99999">
          <div style="width:15%;height:100%;position:fixed;text-align:center;font-size:0;top:50%;transform:translateY(-50%);left:0;min-width:100px">
            <div id="frame" style="width: 100%;margin: auto;position: relative; z-index: 99998;height:100%; display: flex;flex-direction: column; justify-content: center">
              <iframe data-aa=2446098 src=//acceptable.a-ads.com/2446098/?size=Adaptive&background_color=000000 style='border:0; padding:0; width:70%; height:70%; overflow:hidden; margin: 0 auto'></iframe>
            </div>
          </div>
        </div>
        <div style="position: absolute; z-index: 99999">
          <div style="width:15%;height:100%;position:fixed;text-align:center;font-size:0;top:50%;transform:translateY(-50%);right:0;min-width:100px">
            <div id="frame" style="width: 100%;margin: auto;position: relative; z-index: 99998;height:100%; display: flex;flex-direction: column; justify-content: center">
              <iframe data-aa=2446099 src=//acceptable.a-ads.com/2446099/?size=Adaptive&background_color=000000 style='border:0; padding:0; width:70%; height:70%; overflow:hidden; margin: 0 auto'></iframe>
            </div>
          </div>
        </div>
      `}} />

      <nav className="relative z-[100000] flex items-center justify-between bg-[#1a1e29] border-b border-gray-800">
        <div className="flex">
          <Link href="/" prefetch={false} className="px-6 py-4 bg-blue-600 text-white font-semibold transition">Faucet</Link>
          <Link href="/mine" prefetch={false} className="px-6 py-4 text-gray-300 hover:text-white transition">Mining</Link>
        </div>
        <div className="px-6">
          <button onClick={() => { const newLang = lang === "en" ? "zh" : "en"; setLang(newLang); localStorage.setItem("lang", newLang); }} className="text-sm text-gray-300 hover:text-white transition">
            {lang === "en" ? "切換至中文" : "Switch to English"}
          </button>
        </div>
      </nav>

      <div className="flex justify-center w-full mt-6 px-4">
        <a href="https://rollercoin.com/?r=mn67zsfp" target="_blank" rel="noopener noreferrer">
          <img src="https://static.rollercoin.com/static/img/ref/gen2/w970h90.gif" alt="970h90" className="max-w-full h-auto rounded shadow-lg shadow-blue-500/10"/>
        </a>
      </div>

      <div className="flex flex-col w-full max-w-3xl mx-auto px-4 py-8 flex-grow">
        <main className="flex-1 flex flex-col items-center">
          <h1 className="text-5xl md:text-6xl font-bold text-blue-500 mb-6 tracking-wide text-center">Base Mainnet Faucet</h1>
          
          <div className="text-center space-y-2 mb-8 text-gray-300 w-full">
            <p>{lang === "en" ? "We are the Base mainnet faucet!" : "我們是 Base 主網水龍頭！"}</p>
            <p className="text-blue-400 font-semibold mt-2">{lang === "en" ? "This faucet is dedicated to helping new users who don't have gas fees." : "此水龍頭致力於幫助沒有手續費的新手。"}</p>
            <div className="py-4">
              <p>{lang === "en" ? "Donation Address:" : "打賞地址:"} <span className="text-gray-100 font-mono text-sm md:text-base break-all">0x6998C387c2cdAeC57AE48167e2d8CDADA666D178</span></p>
              <p>{lang === "en" ? "Reward Amount:" : "獎勵數量:"} <span className="text-gray-100">0.000001 ETH</span></p>
              <p>{lang === "en" ? "Claim Time:" : "領取限制:"} <span className="text-gray-100">{lang === "en" ? "1 Claim per 7 Days per IP/Wallet" : "每個 IP 與錢包地址每 7 天限領一次"}</span></p>
            </div>

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

          <p className="mb-4 text-gray-300">{lang === "en" ? "Enter your wallet address here:" : "請在此輸入您的錢包地址："}</p>

          <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-lg flex flex-col items-center space-y-6">
            <div className="opacity-0 absolute pointer-events-none">
              <label htmlFor="username" aria-hidden="true">Username</label>
              <input id="username" type="text" tabIndex={-1} autoComplete="off" {...register("username")} />
            </div>

            <div className="w-full">
              <input
                type="text"
                disabled={hasAdBlock}
                placeholder={lang === "en" ? "Wallet address" : "錢包地址"}
                className={`w-full bg-transparent border-2 ${errors.walletAddress ? "border-red-500" : "border-blue-500"} rounded-md px-4 py-3 text-white focus:outline-none focus:border-blue-400 transition`}
                {...register("walletAddress", { required: true, pattern: /^0x[a-fA-F0-9]{40}$/ })}
              />
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
              className={`w-full py-3 rounded-md font-bold transition text-white ${status.type === "loading" || hasAdBlock ? "bg-gray-600 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-500"}`}
            >
              {status.type === "loading" ? (lang === "en" ? "Processing..." : "處理中...") : (lang === "en" ? "Claim" : "領取")}
            </button>

            {status.message && (
              <div className={`w-full p-4 rounded-md text-sm break-all text-center ${status.type === "error" ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-400"}`}>
                {status.message}
              </div>
            )}
          </form>
        </main>
      </div>

      <div className="w-full max-w-3xl mx-auto px-4 pb-12 flex flex-col items-center gap-6">
        <div ref={bannerRef} className="w-full flex justify-center min-h-[90px]"></div>
      </div>
    </div>
  );
}
