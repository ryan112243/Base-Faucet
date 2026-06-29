import { NextResponse } from "next/server";
import { ethers } from "ethers";

export async function GET() {
  try {
    const rpcUrl = process.env.BASE_RPC_URL;
    const privateKey = process.env.FAUCET_WALLET_PRIVATE_KEY;

    // 尚未設定環境變數或私鑰格式錯誤時，回傳預設的 0 以便前端排版預覽
    if (!rpcUrl || !privateKey || privateKey === "請補上" || privateKey.length < 64) {
      return NextResponse.json({
        balance: "0.000000",
        remainingClaims: 0,
        warning: "Invalid or missing EVM Private Key. Make sure it starts with 0x and is 66 characters long."
      }, { status: 200 });
    }

    // 確保 privateKey 包含 0x 前綴
    const formattedPrivateKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(formattedPrivateKey, provider);

    const balanceWei = await provider.getBalance(wallet.address);
    const balanceEth = parseFloat(ethers.formatEther(balanceWei));

    const reservedEth = 0.00005; // 保留作為手續費
    const rewardEth = 0.000001;  // 每次發放獎勵

    let remainingClaims = 0;
    if (balanceEth > reservedEth) {
      remainingClaims = Math.floor((balanceEth - reservedEth) / rewardEth);
    }

    return NextResponse.json({
      balance: balanceEth.toFixed(6),
      remainingClaims
    }, { status: 200 });
  } catch (error) {
    console.error("Info Error:", error);
    return NextResponse.json({ error: "Failed to fetch info" }, { status: 500 });
  }
}
