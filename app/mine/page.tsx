"use client";

import { useState, useEffect } from "react";
import { Turnstile } from "@marsidev/react-turnstile";
import Link from "next/link";

const miningLinks = [
  {
    name: "unMineable",
    url: "https://unmineable.com/?ref=U-K5L8L9",
    description: {
      en: "Want to mine a specific coin but can't find a pool? Use unMineable! Whether you use CPU or GPU, it converts your hashrate into your favorite crypto.",
      zh: "想挖特定的幣卻找不到礦池？用 unMineable，不管你是用 CPU 還是 GPU，它都能幫你換成你最愛的那個加密貨幣，選擇超多！",
    },
  },
  {
    name: "Kryptex",
    url: "https://www.kryptex.com/?ref=7f260d4b",
    description: {
      en: "Don't want to deal with complex setups? Kryptex is like an automatic money printer for your Windows PC. Just let it run in the background.",
      zh: "不想研究複雜設定？Kryptex 懂你，只要你的電腦是 Windows，它就像個全自動的印鈔機，後台跑一跑，收益自動進帳。",
    },
  },
  {
    name: "RollerCoin",
    url: "https://rollercoin.com/?r=mn67zsfp",
    description: {
      en: "Don't have a good PC? Try this virtual mining game! Build your online mining empire just by playing mini-games.",
      zh: "沒有好的電腦嗎？試試這個虛擬挖礦遊戲，動動手指玩遊戲，就能建立屬於你的線上挖礦帝國！",
    },
  },
];

export default function MinePage() {
  const [lang, setLang] = useState<"en" | "zh">("en");
  const [isHumanVerified, setIsHumanVerified] = useState<boolean>(false);

  useEffect(() => {
    const savedLang = localStorage.getItem("lang") as "en" | "zh" | null;
    if (savedLang) {
      setLang(savedLang);
    }
  }, []);

  useEffect(() => {
    setIsHumanVerified(true);
  }, []);

  return (
    <div className="min-h-screen bg-[#11141c] text-gray-200 flex flex-col font-sans">
      {/* 頂部導覽列 */}
      <nav className="flex items-center justify-between bg-[#1a1e29] border-b border-gray-800">
        <div className="flex">
          <Link 
            href="/" 
            prefetch={false}
            className="px-6 py-4 text-gray-300 hover:text-white transition"
          >
            Faucet
          </Link>
          <Link 
            href="/mine" 
            prefetch={false}
            className="px-6 py-4 bg-blue-600 text-white font-semibold transition"
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
        <a href="https://rollercoin.com/?r=mn67zsfp" target="_blank" rel="noopener noreferrer">
          <img src="https://static.rollercoin.com/static/img/ref/gen2/w970h90.gif" alt="970h90" className="max-w-full h-auto rounded shadow-lg shadow-blue-500/10"/>
        </a>
      </div>

      {/* 包含左右廣告的 Grid 佈局 */}
      <div className="flex flex-col md:flex-row w-full max-w-7xl mx-auto px-4 py-8 gap-6 flex-grow">
        
        {/* 左側廣告 */}
        <aside className="hidden md:flex w-[160px] lg:w-[300px] bg-[#1a1e29] border border-gray-800 rounded-lg items-center justify-center overflow-hidden">
          <iframe 
            data-aa="2446091" 
            src="//acceptable.a-ads.com/2446091/?size=Adaptive&background_color=000000" 
            style={{ border: "0", padding: "0", width: "100%", height: "100%", overflow: "hidden" }}
          />
        </aside>

        {/* 主要內容 */}
        <main className="flex-1 flex flex-col items-center">
          <h1 className="text-4xl font-bold text-blue-500 mb-12">
            Mining
          </h1>
          <div className="flex flex-col gap-6 w-full max-w-3xl">
            {miningLinks.map((link) => (
              <a
                key={link.name}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-6 bg-[#1a1e29] rounded-xl border border-gray-800 hover:border-blue-500 hover:shadow-lg hover:shadow-blue-500/20 transition group"
              >
                <h2 className="text-2xl font-bold mb-3 group-hover:text-blue-400 transition">
                  {link.name}
                </h2>
                <p className="text-gray-400">
                  {link.description[lang]}
                </p>
              </a>
            ))}
          </div>
        </main>

        {/* 右側廣告 */}
        <aside className="hidden md:flex w-[160px] lg:w-[300px] bg-[#1a1e29] border border-gray-800 rounded-lg items-center justify-center overflow-hidden">
          <iframe 
            data-aa="2446093" 
            src="//acceptable.a-ads.com/2446093/?size=Adaptive&background_color=000000" 
            style={{ border: "0", padding: "0", width: "100%", height: "100%", overflow: "hidden" }}
          />
        </aside>
      </div>
    </div>
  );
}
