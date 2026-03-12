import { useState } from "react";
import { apiFetch } from "./api";

type View = "register" | "login" | "kyc" | "admin";

type AdminUser = {
  id: string;
  phone: string;
  email: string | null;
  country: string;
  nationality: string;
  kycStatus: string;
  createdAt: string;
};

export default function App() {
  const [view, setView] = useState<View>("register");
  const [message, setMessage] = useState("");
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);

  async function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      const res = await apiFetch<{ token: string }>("/auth/register", {
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
      localStorage.setItem("token", res.token);
      setMessage("Registration complete. Upload KYC images.");
      setView("kyc");
      form.reset();
    } catch (err) {
      setMessage(String(err));
    }
  }

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
      setMessage("Login successful.");
      setView("kyc");
      form.reset();
    } catch (err) {
      setMessage(String(err));
    }
  }

  async function handleKyc(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    try {
      await apiFetch("/kyc/upload", {
        method: "POST",
        body: formData
      });
      setMessage("KYC uploaded. Awaiting approval.");
      form.reset();
    } catch (err) {
      setMessage(String(err));
    }
  }

  async function loadAdminUsers() {
    try {
      const data = await apiFetch<{ users: AdminUser[] }>("/admin/users");
      setAdminUsers(data.users);
      setMessage("Admin users loaded.");
    } catch (err) {
      setMessage(String(err));
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-semibold">PegaFin Crash</h1>
          <div className="flex gap-3 text-sm">
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
            <button
              className={`px-3 py-1 rounded border ${view === "kyc" ? "border-white" : "border-slate-700"}`}
              onClick={() => setView("kyc")}
            >
              KYC Upload
            </button>
            <button
              className={`px-3 py-1 rounded border ${view === "admin" ? "border-white" : "border-slate-700"}`}
              onClick={() => setView("admin")}
            >
              Admin
            </button>
          </div>
        </div>

        {message && (
          <div className="mt-4 rounded border border-slate-700 bg-slate-900 px-4 py-2 text-sm">
            {message}
          </div>
        )}

        {view === "register" && (
          <form className="mt-8 grid gap-4" onSubmit={handleRegister}>
            <input name="phone" placeholder="Phone" className="rounded bg-slate-900 px-3 py-2" required />
            <input name="password" type="password" placeholder="Password" className="rounded bg-slate-900 px-3 py-2" required />
            <input name="email" type="email" placeholder="Email (optional)" className="rounded bg-slate-900 px-3 py-2" />
            <input name="dob" type="date" className="rounded bg-slate-900 px-3 py-2" required />
            <input name="country" placeholder="Country" className="rounded bg-slate-900 px-3 py-2" required />
            <input name="nationality" placeholder="Nationality" className="rounded bg-slate-900 px-3 py-2" required />
            <input name="govIdNumber" placeholder="Government ID Number" className="rounded bg-slate-900 px-3 py-2" required />
            <button className="rounded bg-emerald-500 px-4 py-2 font-semibold text-slate-950">Create Account</button>
          </form>
        )}

        {view === "login" && (
          <form className="mt-8 grid gap-4" onSubmit={handleLogin}>
            <input name="phone" placeholder="Phone" className="rounded bg-slate-900 px-3 py-2" required />
            <input name="password" type="password" placeholder="Password" className="rounded bg-slate-900 px-3 py-2" required />
            <button className="rounded bg-emerald-500 px-4 py-2 font-semibold text-slate-950">Login</button>
          </form>
        )}

        {view === "kyc" && (
          <form className="mt-8 grid gap-4" onSubmit={handleKyc}>
            <div className="text-sm text-slate-400">
              Upload front and back images of the government ID.
            </div>
            <input name="front" type="file" accept="image/*" className="rounded bg-slate-900 px-3 py-2" required />
            <input name="back" type="file" accept="image/*" className="rounded bg-slate-900 px-3 py-2" required />
            <button className="rounded bg-emerald-500 px-4 py-2 font-semibold text-slate-950">Upload KYC</button>
          </form>
        )}

        {view === "admin" && (
          <div className="mt-8 grid gap-4">
            <button
              className="w-fit rounded bg-amber-400 px-4 py-2 font-semibold text-slate-950"
              onClick={loadAdminUsers}
            >
              Load Users
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
