import { useEffect, useState } from "react";
import { apiFetch } from "./api";
import { getTransactions, getWallet, requestWithdrawal } from "./wallet";

type View = "register" | "login" | "kyc" | "admin" | "dashboard";

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
      setMessage("Wallet loaded.");
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

  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-700 border-t-emerald-400" />
          <div className="text-sm text-slate-400">Loading games...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-semibold">PegaFin Crash</h1>
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
              <div className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1">
                <span className="text-slate-400">Balance</span>
                <span className="font-semibold">{walletBalance} {walletCurrency}</span>
                <button
                  className="rounded-full bg-emerald-400 px-3 py-1 text-xs font-semibold text-slate-950"
                  onClick={() => setMessage("Deposit flow coming soon.")}
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
              </>
            )}
          </div>
        </div>

        {message && (
          <div className="mt-4 rounded border border-slate-700 bg-slate-900 px-4 py-2 text-sm">
            {message}
          </div>
        )}

        {!authChecking && view === "register" && (
          <form className="mt-8 grid gap-4" onSubmit={handleRegister}>
            <input name="phone" placeholder="Phone" className="rounded bg-slate-900 px-3 py-2" required />
            <input name="password" type="password" placeholder="Password" className="rounded bg-slate-900 px-3 py-2" required />
            <input name="email" type="email" placeholder="Email (optional)" className="rounded bg-slate-900 px-3 py-2" />
            <input name="dob" type="date" className="rounded bg-slate-900 px-3 py-2" required />
            <input name="country" placeholder="Country" className="rounded bg-slate-900 px-3 py-2" required />
            <input name="nationality" placeholder="Nationality" className="rounded bg-slate-900 px-3 py-2" required />
            <input name="govIdNumber" placeholder="Government ID Number" className="rounded bg-slate-900 px-3 py-2" required />
            <button className="rounded bg-emerald-500 px-4 py-2 font-semibold text-slate-950" disabled={loading.register}>
              {loading.register ? "Creating..." : "Create Account"}
            </button>
          </form>
        )}

        {!authChecking && view === "login" && (
          <form className="mt-8 grid gap-4" onSubmit={handleLogin}>
            <input name="phone" placeholder="Phone" className="rounded bg-slate-900 px-3 py-2" required />
            <input name="password" type="password" placeholder="Password" className="rounded bg-slate-900 px-3 py-2" required />
            <button className="rounded bg-emerald-500 px-4 py-2 font-semibold text-slate-950" disabled={loading.login}>
              {loading.login ? "Signing in..." : "Login"}
            </button>
          </form>
        )}

        {!authChecking && view === "kyc" && (
          <form className="mt-8 grid gap-4" onSubmit={handleKyc}>
            <div className="text-sm text-slate-400">
              Upload front and back images of the government ID.
            </div>
            <input name="front" type="file" accept="image/*" className="rounded bg-slate-900 px-3 py-2" required />
            <input name="back" type="file" accept="image/*" className="rounded bg-slate-900 px-3 py-2" required />
            <button className="rounded bg-emerald-500 px-4 py-2 font-semibold text-slate-950" disabled={loading.kyc}>
              {loading.kyc ? "Uploading..." : "Upload KYC"}
            </button>
          </form>
        )}

        {!authChecking && view === "dashboard" && (
          <div className="mt-8 grid gap-6">
            <div className="rounded border border-slate-800 bg-slate-900 p-4">
              <div className="text-lg font-semibold">Request Withdrawal</div>
              <form className="mt-4 grid gap-3" onSubmit={handleWithdrawal}>
                <input name="amount" type="number" step="0.01" placeholder="Amount" className="rounded bg-slate-950 px-3 py-2" required />
                <input name="walletAddress" placeholder="Base wallet address" className="rounded bg-slate-950 px-3 py-2" required />
                <button className="rounded bg-emerald-500 px-4 py-2 font-semibold text-slate-950" disabled={loading.withdrawal}>
                  {loading.withdrawal ? "Submitting..." : "Submit"}
                </button>
              </form>
            </div>

            <div className="rounded border border-slate-800 bg-slate-900 p-4">
              <div className="text-lg font-semibold">Transactions</div>
              <div className="mt-3 overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-950 text-slate-400">
                    <tr>
                      <th className="px-3 py-2 text-left">Type</th>
                      <th className="px-3 py-2 text-left">Amount</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx) => (
                      <tr key={tx.id} className="border-t border-slate-800">
                        <td className="px-3 py-2">{tx.type}</td>
                        <td className="px-3 py-2">{tx.amount}</td>
                        <td className="px-3 py-2">{tx.status}</td>
                        <td className="px-3 py-2">{new Date(tx.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {!authChecking && view === "admin" && (
          <div className="mt-8 grid gap-4">
            <button
              className="w-fit rounded bg-amber-400 px-4 py-2 font-semibold text-slate-950"
              onClick={loadAdminUsers}
              disabled={loading.admin}
            >
              {loading.admin ? "Loading..." : "Load Users"}
            </button>
            <div className="overflow-auto rounded border border-slate-800">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-900 text-slate-300">
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
  );
}
