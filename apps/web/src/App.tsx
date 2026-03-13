import { useEffect, useState } from "react";
import { apiFetch } from "./api";
import { getTransactions, getWallet, requestWithdrawal } from "./wallet";
import GamePanel from "./GamePanel";

type View = "register" | "login" | "kyc" | "admin" | "dashboard" | "statement" | "funds";

type AdminUser = {
  id: string;
  phone: string;
  email: string | null;
  country: string;
  nationality: string;
  kycStatus: string;
  createdAt: string;
};

type Transaction = {
  id: string;
  type: string;
  amount: string;
  status: string;
  created_at: string;
};

type MeResponse = {
  userId: string;
  isAdmin: boolean;
  kycStatus: string;
};

export default function App() {
  const [view, setView] = useState<View>("register");
  const [message, setMessage] = useState("");
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [walletBalance, setWalletBalance] = useState<string>("0");
  const [walletCurrency, setWalletCurrency] = useState<string>("USDC");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [accountOpen, setAccountOpen] = useState(false);
  const [loading, setLoading] = useState({
    register: false,
    login: false,
    kyc: false,
    wallet: false,
    withdrawal: false,
    admin: false
  });

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setAuthChecking(false);
      return;
    }
    apiFetch<MeResponse>("/me")
      .then((data) => {
        setMe(data);
        setView("dashboard");
        loadWallet();
      })
      .catch(() => {
        localStorage.removeItem("token");
      })
      .finally(() => setAuthChecking(false));
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 4000);
    return () => clearTimeout(timer);
  }, [message]);

  async function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading((prev) => ({ ...prev, register: true }));
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      await apiFetch("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          phone: data.phone,
          password: data.password,
          email: data.email || undefined,
          dob: data.dob,
          country: data.country,
          nationality: data.nationality,
          govIdNumber: data.govIdNumber
        })
      });
      setMessage("Registration complete. Please login to continue.");
      setView("login");
      form.reset();
    } catch (err) {
      setMessage(String(err));
    } finally {
      setLoading((prev) => ({ ...prev, register: false }));
    }
  }

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading((prev) => ({ ...prev, login: true }));
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      const res = await apiFetch<{ token: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          phone: data.phone,
          password: data.password
        })
      });
      localStorage.setItem("token", res.token);
      const profile = await apiFetch<MeResponse>("/me");
      setMe(profile);
      setMessage("Login successful.");
      setView("dashboard");
      loadWallet();
      form.reset();
    } catch (err) {
      setMessage(String(err));
    } finally {
      setLoading((prev) => ({ ...prev, login: false }));
    }
  }

  async function handleKyc(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading((prev) => ({ ...prev, kyc: true }));
    const form = e.currentTarget;
    const formData = new FormData(form);
    try {
      await apiFetch("/kyc/upload", {
        method: "POST",
        body: formData
      }, 20000);
      setMessage("KYC uploaded. Awaiting approval.");
      form.reset();
      const profile = await apiFetch<MeResponse>("/me");
      setMe(profile);
      setView("dashboard");
    } catch (err) {
      setMessage(String(err));
    } finally {
      setLoading((prev) => ({ ...prev, kyc: false }));
    }
  }

  async function loadAdminUsers() {
    setLoading((prev) => ({ ...prev, admin: true }));
    try {
      const data = await apiFetch<{ users: AdminUser[] }>("/admin/users");
      setAdminUsers(data.users);
      setMessage("Admin users loaded.");
    } catch (err) {
      setMessage(String(err));
    } finally {
      setLoading((prev) => ({ ...prev, admin: false }));
    }
  }

  async function loadWallet() {
    setLoading((prev) => ({ ...prev, wallet: true }));
    try {
      const wallet = await getWallet();
      setWalletBalance(wallet.balance);
      setWalletCurrency(wallet.currency);
      const txs = await getTransactions();
      setTransactions(txs.transactions as Transaction[]);
    } catch (err) {
      setMessage(String(err));
    } finally {
      setLoading((prev) => ({ ...prev, wallet: false }));
    }
  }

  async function handleWithdrawal(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading((prev) => ({ ...prev, withdrawal: true }));
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      await requestWithdrawal(Number(data.amount), String(data.walletAddress));
      setMessage("Withdrawal request submitted.");
      form.reset();
      await loadWallet();
    } catch (err) {
      setMessage(String(err));
    } finally {
      setLoading((prev) => ({ ...prev, withdrawal: false }));
    }
  }

  const showKycChip = !!me && me.kycStatus !== "approved";
  const isLoggedIn = !!me;
  const hasFunds = Number(walletBalance) > 0;

  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-700 border-t-emerald-400" />
          <div className="text-sm text-slate-400">Checking session...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a1f23] text-slate-100">
      <div className="mx-auto flex h-screen max-w-7xl flex-col px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="text-2xl font-semibold text-rose-500">PegaFin</div>
            {showKycChip && (
              <button
                className="rounded-full border border-amber-400 px-3 py-1 text-xs text-amber-300"
                onClick={() => setView("kyc")}
              >
                Complete KYC
              </button>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm">
            {isLoggedIn && (
              <div className="flex items-center gap-2 rounded-full border border-slate-700 bg-[#111519] px-3 py-1">
                <span className="text-slate-400">Balance</span>
                <span className="font-semibold">{walletBalance} {walletCurrency}</span>
                <button
                  className="rounded-full bg-emerald-400 px-3 py-1 text-xs font-semibold text-slate-950"
                  onClick={() => setView("funds")}
                >
                  Deposit
                </button>
              </div>
            )}
            {!isLoggedIn && (
              <>
                <button
                  className={`px-3 py-1 rounded border ${view === "register" ? "border-white" : "border-slate-700"}`}
                  onClick={() => setView("register")}
                >
                  Register
                </button>
                <button
                  className={`px-3 py-1 rounded border ${view === "login" ? "border-white" : "border-slate-700"}`}
                  onClick={() => setView("login")}
                >
                  Login
                </button>
              </>
            )}
            {isLoggedIn && (
              <>
                <button
                  className={`px-3 py-1 rounded border ${view === "dashboard" ? "border-white" : "border-slate-700"}`}
                  onClick={() => setView("dashboard")}
                >
                  Dashboard
                </button>
                <button
                  className={`px-3 py-1 rounded border ${view === "admin" ? "border-white" : "border-slate-700"}`}
                  onClick={() => setView("admin")}
                >
                  Admin
                </button>
                <button
                  className="px-3 py-1 rounded border border-slate-700"
                  onClick={() => setAccountOpen(true)}
                >
                  Account
                </button>
              </>
            )}
          </div>
        </div>

        {message && (
          <div className="mt-4 rounded border border-slate-700 bg-[#111519] px-4 py-2 text-sm">
            {message}
          </div>
        )}

        <div className="mt-4 flex-1 overflow-hidden">
          {view === "register" && (
            <form className="grid gap-4" onSubmit={handleRegister}>
              <input name="phone" placeholder="Phone" className="rounded bg-[#111519] px-3 py-2" required />
              <input name="password" type="password" placeholder="Password" className="rounded bg-[#111519] px-3 py-2" required />
              <input name="email" type="email" placeholder="Email (optional)" className="rounded bg-[#111519] px-3 py-2" />
              <input name="dob" type="date" className="rounded bg-[#111519] px-3 py-2" required />
              <input name="country" placeholder="Country" className="rounded bg-[#111519] px-3 py-2" required />
              <input name="nationality" placeholder="Nationality" className="rounded bg-[#111519] px-3 py-2" required />
              <input name="govIdNumber" placeholder="Government ID Number" className="rounded bg-[#111519] px-3 py-2" required />
              <button className="rounded bg-emerald-500 px-4 py-2 font-semibold text-slate-950" disabled={loading.register}>
                {loading.register ? "Creating..." : "Create Account"}
              </button>
            </form>
          )}

          {view === "login" && (
            <form className="grid gap-4" onSubmit={handleLogin}>
              <input name="phone" placeholder="Phone" className="rounded bg-[#111519] px-3 py-2" required />
              <input name="password" type="password" placeholder="Password" className="rounded bg-[#111519] px-3 py-2" required />
              <button className="rounded bg-emerald-500 px-4 py-2 font-semibold text-slate-950" disabled={loading.login}>
                {loading.login ? "Signing in..." : "Login"}
              </button>
            </form>
          )}

          {view === "kyc" && (
            <form className="grid gap-4" onSubmit={handleKyc}>
              <div className="text-sm text-slate-400">
                Upload front and back images of the government ID.
              </div>
              <input name="front" type="file" accept="image/*" className="rounded bg-[#111519] px-3 py-2" required />
              <input name="back" type="file" accept="image/*" className="rounded bg-[#111519] px-3 py-2" required />
              <button className="rounded bg-emerald-500 px-4 py-2 font-semibold text-slate-950" disabled={loading.kyc}>
                {loading.kyc ? "Uploading..." : "Upload KYC"}
              </button>
            </form>
          )}

          {view === "dashboard" && (
            <div className="h-full overflow-hidden lg:overflow-hidden">
              <GamePanel
                onCashout={() => loadWallet()}
                onBetPlaced={() => loadWallet()}
                hasFunds={hasFunds}
                showToast={(text) => setMessage(text)}
              />
            </div>
          )}

          {view === "funds" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-800 bg-[#111519] p-6">
                <div className="text-lg font-semibold">Deposit</div>
                <div className="mt-4 text-sm text-slate-400">Deposit flow coming soon.</div>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-[#111519] p-6">
                <div className="text-lg font-semibold">Withdraw</div>
                <form className="mt-4 grid gap-3" onSubmit={handleWithdrawal}>
                  <input name="amount" type="number" step="0.01" placeholder="Amount" className="rounded bg-[#0d1114] px-3 py-2" required />
                  <input name="walletAddress" placeholder="Base wallet address" className="rounded bg-[#0d1114] px-3 py-2" required />
                  <button className="rounded bg-emerald-500 px-4 py-2 font-semibold text-slate-950" disabled={loading.withdrawal}>
                    {loading.withdrawal ? "Submitting..." : "Submit"}
                  </button>
                </form>
              </div>
            </div>
          )}

          {view === "statement" && (
            <div className="rounded-2xl border border-slate-800 bg-[#111519] p-6">
              <div className="text-center text-2xl font-semibold">STATEMENT</div>
              <div className="mt-6 divide-y divide-slate-800">
                {transactions.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between py-4 text-sm">
                    <div>
                      <div className="font-semibold">Casino Bet #{tx.id.slice(0, 12)}</div>
                      <div className="text-slate-400">Aviator</div>
                      <div className="text-slate-400">{new Date(tx.created_at).toLocaleString()}</div>
                    </div>
                    <div className="text-right">
                      <div className={tx.type === "bet" ? "text-rose-400" : "text-emerald-400"}>
                        {tx.type === "bet" ? "-" : "+"}{walletCurrency} {tx.amount}
                      </div>
                      <div className="text-slate-400">Balance: {walletCurrency} {walletBalance}</div>
                    </div>
                  </div>
                ))}
                {transactions.length === 0 && (
                  <div className="py-6 text-center text-slate-400">No statements yet.</div>
                )}
              </div>
            </div>
          )}

          {view === "admin" && (
            <div className="grid gap-4">
              <button
                className="w-fit rounded bg-amber-400 px-4 py-2 font-semibold text-slate-950"
                onClick={loadAdminUsers}
                disabled={loading.admin}
              >
                {loading.admin ? "Loading..." : "Load Users"}
              </button>
              <div className="overflow-auto rounded border border-slate-800">
                <table className="min-w-full text-sm">
                  <thead className="bg-[#111519] text-slate-300">
                    <tr>
                      <th className="px-3 py-2 text-left">Phone</th>
                      <th className="px-3 py-2 text-left">Email</th>
                      <th className="px-3 py-2 text-left">Country</th>
                      <th className="px-3 py-2 text-left">Nationality</th>
                      <th className="px-3 py-2 text-left">KYC</th>
                      <th className="px-3 py-2 text-left">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminUsers.map((user) => (
                      <tr key={user.id} className="border-t border-slate-800">
                        <td className="px-3 py-2">{user.phone}</td>
                        <td className="px-3 py-2">{user.email ?? "-"}</td>
                        <td className="px-3 py-2">{user.country}</td>
                        <td className="px-3 py-2">{user.nationality}</td>
                        <td className="px-3 py-2">{user.kycStatus}</td>
                        <td className="px-3 py-2">{new Date(user.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {accountOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setAccountOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-sm bg-[#111519] p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">Account</div>
              <button
                className="rounded-full border border-slate-700 px-2 py-1"
                onClick={() => setAccountOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="mt-6 rounded-2xl bg-[#1a1f23] p-4">
              <div className="text-sm text-slate-400">{me?.userId ?? ""}</div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <button
                  className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-slate-950"
                  onClick={() => {
                    setAccountOpen(false);
                    setView("funds");
                  }}
                >
                  Deposit
                </button>
                <button
                  className="rounded-lg border border-slate-700 px-4 py-2 font-semibold"
                  onClick={() => {
                    setAccountOpen(false);
                    setView("funds");
                  }}
                >
                  Withdraw
                </button>
              </div>
            </div>

            <div className="mt-6 text-xs uppercase text-slate-400">My Account</div>
            <div className="mt-2 divide-y divide-slate-800 rounded-2xl border border-slate-800 bg-[#1a1f23]">
              <button className="flex w-full items-center justify-between px-4 py-3 text-left">
                Notifications <span>›</span>
              </button>
              <button className="flex w-full items-center justify-between px-4 py-3 text-left">
                Manage account <span>›</span>
              </button>
              <button
                className="flex w-full items-center justify-between px-4 py-3 text-left"
                onClick={() => {
                  setAccountOpen(false);
                  setView("statement");
                }}
              >
                Statement <span>›</span>
              </button>
            </div>

            <div className="mt-6 text-xs uppercase text-slate-400">General</div>
            <div className="mt-2 divide-y divide-slate-800 rounded-2xl border border-slate-800 bg-[#1a1f23]">
              <button className="flex w-full items-center justify-between px-4 py-3 text-left">
                Help Center <span>›</span>
              </button>
              <button className="flex w-full items-center justify-between px-4 py-3 text-left">
                More on PegaFin <span>›</span>
              </button>
            </div>

            <button
              className="mt-6 w-full rounded-xl border border-rose-400 px-4 py-2 text-rose-400"
              onClick={() => {
                localStorage.removeItem("token");
                setMe(null);
                setView("login");
                setAccountOpen(false);
              }}
            >
              Log Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
