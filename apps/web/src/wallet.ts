import { apiFetch } from "./api";

export type WalletSummary = {
  balance: string;
  currency: string;
};

export async function getWallet() {
  return apiFetch<WalletSummary>("/wallet");
}

export async function getTransactions() {
  return apiFetch<{ transactions: Array<Record<string, unknown>> }>("/wallet/transactions");
}

export async function requestWithdrawal(amount: number, walletAddress: string) {
  return apiFetch<{ ok: boolean; withdrawalId: string }>("/wallet/withdraw", {
    method: "POST",
    body: JSON.stringify({ amount, walletAddress })
  });
}
