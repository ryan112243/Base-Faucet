"use client";

import { useState, useEffect, useRef } from "react";
import { Turnstile } from "@marsidev/react-turnstile";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { useForm } from "react-hook-form";
import Link from "next/link";

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
  const [status, setStatus] = useState<{ type: "idle" | "loading" | "success" | "error"; message: string }>({
    type: "idle",
    message: "",
  });
  const hCaptchaRef = useRef<HCaptcha>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>();

  useEffect(() => {
    const savedLang = localStorage.getItem("lang") as "en" | "zh" | null;
    if (savedLang) setLang(savedLang);
    setInitTime(Date.now());

    fetch("/api/faucet/info")
      .then(res => res.json())
      .then(data => {
        if (data.balance) setFaucetInfo({ balance: data.balance, remaining: data.remainingClaims });
      })
      .catch(err => console.error("Info fetch error:", err));

    // --- 強化版防 AdBlocker 邏輯 ---
    const checkAdBlock = () => {
      const randomId = `box_${Math.random().toString(36).substring(7)}`;
      const ad = document.createElement('div');
      ad.id = randomId;
      ad.style.height = '1px';
      ad.style.width = '1px';
      ad.style.position = 'absolute';
      ad.style.top = '-9999px';
      document.body.appendChild(ad);

      setTimeout(() => {
        const isBlocked = ad.offsetParent === null || ad.offsetHeight === 0 || ad.offsetWidth === 0;
        setHasAdBlock(isBlocked);
        ad.remove();
      }, 500);
    };

    checkAdBlock();
    const interval = setInterval(checkAdBlock, 3000); // 每 3 秒循環檢查
    return () => clearInterval(interval);
  }, []);

  const onSubmit = async (data: FormData) => {
    if (hasAdBlock) {
      alert(lang === "en" ? "Please disable AdBlocker to claim." : "請關閉廣告攔截器後再領取。");
      return;
    }

    if (!turnstileToken || !hCaptchaToken) {
      setStatus({ type: "error", message: lang === "en" ? "Complete all captcha." : "請完成所有驗證碼。" });
      return;
    }

    setStatus({ type: "loading", message: lang === "en" ? "Sending..." : "處理中..." });

    try {
      const res = await fetch("/api/faucet/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, initTime, turnstileToken, hCaptchaToken }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      
      setStatus({ type: "success", message: `${lang === "en" ? "Success! Tx:" : "成功！交易:"} ${result.txHash}` });
      if (hCaptchaRef.current) hCaptchaRef.current.resetCaptcha();
      setHCaptchaToken("");
    } catch (err: any) {
      setStatus({ type: "error", message: err.message });
    }
  };

  return (
    <div className="min-h-screen bg-[#11141c] text-gray-200 flex flex-col font-sans">
      <nav className="flex items-center justify-between bg-[#1a1e29] border-b border-gray-800">
        <div className="flex">
          <Link href="/" className="px-6 py-4 bg-blue-600 text-white font-semibold">Faucet</Link>
          <Link href="/mine" className="px-6 py-4 text-gray-300 hover:text-white">Mining</Link>
        </div>
      </nav>

      <div className="flex flex-col md:flex-row w-full max-w-7xl mx-auto px-4 py-8 gap-6 flex-grow">
        <aside className="hidden md:flex w-[300px] bg-[#1a1e29] border border-gray-800 rounded-lg items-center justify-center">
          {lang === "en" ? "Ad Partner Space" : "廣告合作夥伴"}
        </aside>

        <main className="flex-1 flex flex-col items-center">
          <h1 className="text-5xl font-bold text-blue-500 mb-6">Base Faucet</h1>
          
          {hasAdBlock && (
            <div className="w-full max-w-lg mb-6 p-4 bg-red-500/10 text-red-400 border border-red-500/30 text-center font-bold animate-pulse">
              {lang === "en" ? "Please disable Ad-blocker to support us!" : "偵測到廣告攔截，請關閉以支持站點運作！"}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-lg flex flex-col items-center space-y-6">
            <input 
              {...register("walletAddress", { required: true, pattern: /^0x[a-fA-F0-9]{40}$/ })}
              placeholder={lang === "en" ? "Wallet address" : "錢包地址"}
              className="w-full bg-transparent border-2 border-blue-500 rounded-md px-4 py-3 text-white"
            />
            
            <HCaptcha 
              sitekey={process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY || "10000000-ffff-ffff-ffff-000000000001"}
              onVerify={(t) => setHCaptchaToken(t)}
              ref={hCaptchaRef}
              theme="dark"
            />

            <button 
              type="submit" 
              disabled={status.type === "loading" || hasAdBlock}
              className={`w-full py-3 rounded-md font-bold text-white ${hasAdBlock ? "bg-gray-600 cursor-not-allowed" : "bg-blue-600"}`}
            >
              {status.type === "loading" ? "Processing..." : "Claim"}
            </button>
          </form>
        </main>
      </div>
    </div>
  );
}
