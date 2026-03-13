import { useEffect, useMemo, useRef, useState } from "react";
import { wsBase } from "./api";

type EngineState = {
  status: "waiting" | "betting" | "running" | "crashed";
  multiplier: number;
  roundId: string | null;
  crashPoint: number | null;
  bettingEndsAt?: number | null;
  history?: number[];
  lastCrashPoint?: number | null;
};

type WsMessage = {
  type: string;
  [key: string]: unknown;
};

type Props = {
  onCashout?: (payout: number) => void;
  onBetPlaced?: () => void;
  hasFunds: boolean;
  showToast?: (message: string) => void;
};

const QUICK_AMOUNTS = [1, 2, 5, 10];

export default function GamePanel({ onCashout, onBetPlaced, hasFunds, showToast }: Props) {
  const [status, setStatus] = useState<EngineState["status"]>("waiting");
  const [multiplier, setMultiplier] = useState(1);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [crashPoint, setCrashPoint] = useState<number | null>(null);
  const [betAmount, setBetAmount] = useState("1");
  const [connected, setConnected] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [history, setHistory] = useState<number[]>([]);
  const [bettingEndsAt, setBettingEndsAt] = useState<number | null>(null);
  const [activeBet, setActiveBet] = useState(false);
  const [tab, setTab] = useState<"bet" | "auto">("bet");
  const [autoBet, setAutoBet] = useState(false);
  const [autoCash, setAutoCash] = useState(false);
  const [autoCashValue, setAutoCashValue] = useState("1.10");
  const [historyLimit, setHistoryLimit] = useState(60);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  const token = useMemo(() => localStorage.getItem("token"), []);
  const socketRef = useRef<WebSocket | null>(null);
  const autoCashTriggered = useRef(false);
  const inputDirty = useRef(false);

  const bettingProgress = bettingEndsAt
    ? Math.max(0, Math.min(1, (bettingEndsAt - Date.now()) / 5000))
    : 0;

  useEffect(() => {
    const updateLimit = () => {
      setHistoryLimit(window.innerWidth >= 1024 ? 60 : 30);
    };
    updateLimit();
    window.addEventListener("resize", updateLimit);
    return () => window.removeEventListener("resize", updateLimit);
  }, []);

  useEffect(() => {
    const ws = new WebSocket(wsBase);
    socketRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ type: "join_round" }));
    };

    ws.onclose = () => setConnected(false);

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data) as WsMessage;
      if (msg.type === "state" && msg.state) {
        const state = msg.state as EngineState;
        setStatus(state.status);
        setMultiplier(state.multiplier ?? 1);
        setRoundId(state.roundId ?? null);
        setHistory((state.history ?? []).slice(0, historyLimit));
        setCrashPoint(state.lastCrashPoint ?? null);
        return;
      }
      if (msg.type === "round_start") {
        setStatus("betting");
        setRoundId(String(msg.roundId ?? ""));
        setCrashPoint(null);
        setBettingEndsAt(Number(msg.bettingEndsAt ?? null));
        setActiveBet(false);
        autoCashTriggered.current = false;
        setLog((prev) => ["Round started", ...prev].slice(0, 5));

        if (autoBet && hasFunds) {
          handleBet();
        }
        return;
      }
      if (msg.type === "multiplier_update") {
        setStatus("running");
        setMultiplier(Number(msg.multiplier ?? 1));
        return;
      }
      if (msg.type === "round_crash") {
        setStatus("crashed");
        setCrashPoint(Number(msg.crashPoint ?? 1));
        setBettingEndsAt(null);
        setActiveBet(false);
        autoCashTriggered.current = false;
        setLog((prev) => ["Round crashed", ...prev].slice(0, 5));
        return;
      }
      if (msg.type === "round_history") {
        const list = Array.isArray(msg.history) ? (msg.history as number[]) : [];
        setHistory(list.slice(0, historyLimit));
        return;
      }
      if (msg.type === "bet_confirmed") {
        setActiveBet(true);
        onBetPlaced?.();
        setLog((prev) => ["Bet confirmed", ...prev].slice(0, 5));
        return;
      }
      if (msg.type === "cashout_success") {
        const payout = Number(msg.payout ?? 0);
        onCashout?.(payout);
        showToast?.(`Cashed out ${payout.toFixed(2)} USDC`);
        setActiveBet(false);
        autoCashTriggered.current = false;
        setLog((prev) => [`Cashed out ${payout}`, ...prev].slice(0, 5));
        return;
      }
      if (msg.type === "error") {
        setLog((prev) => [`Error: ${String(msg.message ?? "unknown")}`, ...prev].slice(0, 5));
      }
    };

    return () => ws.close();
  }, [autoBet, hasFunds, historyLimit, onBetPlaced, onCashout, showToast]);

  useEffect(() => {
    if (!autoCash || !activeBet || status !== "running") return;
    if (autoCashTriggered.current) return;
    const target = Number(autoCashValue);
    if (Number.isFinite(target) && multiplier >= target) {
      autoCashTriggered.current = true;
      handleCashout();
    }
  }, [autoCash, autoCashValue, activeBet, multiplier, status]);

  useEffect(() => {
    let raf: number;
    const tick = () => {
      if (bettingEndsAt) {
        setBettingEndsAt((prev) => prev ?? null);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [bettingEndsAt]);

  function sendMessage(payload: object) {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(payload));
  }

  function handleBet() {
    if (!token) return;
    sendMessage({ type: "place_bet", amount: betAmount, token });
  }

  function handleCashout() {
    if (!token) return;
    sendMessage({ type: "cash_out", token });
  }

  function addQuickAmount(amount: number) {
    if (inputDirty.current) return;
    const current = Number(betAmount) || 0;
    const next = current + amount;
    setBetAmount(next.toFixed(2));
  }

  const canBet = status === "betting" && hasFunds && Number(betAmount) > 0 && !activeBet;
  const canCashout = status === "running" && hasFunds && activeBet;
  const runningPayout = (Number(betAmount) || 0) * multiplier;
  const historyVisible = historyExpanded ? history : history.slice(0, Math.min(historyLimit, 18));

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="grid flex-1 gap-4 lg:grid-cols-[320px_1fr]">
        <div className="hidden h-full rounded-2xl bg-[#111519] p-4 lg:block">
          <div className="flex items-center justify-between rounded-full bg-[#0f1317] px-2 py-2 text-sm">
            <button className="rounded-full bg-[#1f252b] px-5 py-1 font-semibold">All Bets</button>
            <button className="rounded-full px-5 py-1 text-slate-400">Previous</button>
            <button className="rounded-full px-5 py-1 text-slate-400">Top</button>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-xl bg-[#1b2025] px-4 py-3">
            <div>
              <div className="text-xs text-slate-400">Bets</div>
              <div className="text-sm font-semibold">3764/3764</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-400">Total win USDC</div>
              <div className="text-lg font-semibold">0.00</div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-[1fr_1fr_0.6fr_1fr] gap-2 text-xs uppercase text-slate-500">
            <div>Player</div>
            <div>Bet USDC</div>
            <div>X</div>
            <div>Win USDC</div>
          </div>

          <div className="mt-2 space-y-2 text-sm">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((row) => (
              <div key={row} className="grid grid-cols-[1fr_1fr_0.6fr_1fr] items-center gap-2 rounded-lg bg-[#0d1114] px-3 py-2">
                <span>b***{row}</span>
                <span>{(Math.random() * 200000 + 50000).toFixed(2)}</span>
                <span className="text-emerald-400">{(Math.random() * 2 + 1).toFixed(2)}x</span>
                <span>{(Math.random() * 400000 + 80000).toFixed(2)}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 text-xs text-slate-500">Provably Fair Game</div>
        </div>

        <div className="relative grid h-full gap-4" style={{ gridTemplateRows: "55% 45%" }}>
          <div className="absolute left-0 right-0 top-0 z-20">
            <div className="flex justify-between items-start rounded-2xl bg-[#111519] px-4 py-3 shadow-xl">
              <div className="flex flex-wrap gap-2 text-xs text-slate-300">
                {historyVisible.map((val, idx) => (
                  <span key={`${val}-${idx}`} className={val >= 2 ? "text-emerald-400" : "text-rose-400"}>
                    {val.toFixed(2)}x
                  </span>
                ))}
              </div>
              <button
                className="rounded-full bg-[#1f252b] px-2 py-1 text-xs"
                onClick={() => setHistoryExpanded((prev) => !prev)}
              >
                {historyExpanded ? "×" : "···"}
              </button>
            </div>
          </div>

          <div className="rounded-2xl bg-[radial-gradient(circle_at_top,_#232a30,_#0b0f12)] p-6 pt-20">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="uppercase tracking-wider">{status}</span>
              <span>{connected ? "WS connected" : "WS disconnected"}</span>
            </div>

            {status === "betting" && (
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#101418]">
                <div className="h-full bg-emerald-400" style={{ width: `${bettingProgress * 100}%` }} />
              </div>
            )}

            <div className="mt-8 text-center">
              <div className="text-xs text-slate-400">Multiplier</div>
              <div className={`text-6xl font-semibold ${status === "crashed" ? "text-rose-500" : "text-emerald-400"}`}>
                {multiplier.toFixed(2)}x
              </div>
              {status === "crashed" && (
                <div className="mt-2 text-sm text-rose-400">Flew away at {crashPoint?.toFixed(2)}x</div>
              )}
            </div>
          </div>

          <div className="rounded-2xl bg-[#1a1f23] p-4">
            <div className="flex items-center justify-between rounded-full bg-[#101418] p-1 text-xs">
              <button
                className={`w-1/2 rounded-full py-1 ${tab === "bet" ? "bg-[#1f252b]" : "text-slate-400"}`}
                onClick={() => setTab("bet")}
              >
                Bet
              </button>
              <button
                className={`w-1/2 rounded-full py-1 ${tab === "auto" ? "bg-[#1f252b]" : "text-slate-400"}`}
                onClick={() => setTab("auto")}
              >
                Auto
              </button>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[auto_1fr_160px]">
              <div className="flex items-center gap-2">
                <button
                  className="h-7 w-7 rounded-full bg-[#101418]"
                  onClick={() => setBetAmount((prev) => (Math.max(0, Number(prev) - 1)).toFixed(2))}
                >
                  -
                </button>
                <input
                  value={betAmount}
                  onChange={(e) => {
                    inputDirty.current = true;
                    setBetAmount(e.target.value);
                  }}
                  onBlur={() => {
                    inputDirty.current = false;
                  }}
                  className="w-20 rounded bg-[#101418] px-3 py-2 text-center text-lg"
                />
                <button
                  className="h-7 w-7 rounded-full bg-[#101418]"
                  onClick={() => setBetAmount((prev) => (Number(prev) + 1).toFixed(2))}
                >
                  +
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
                {QUICK_AMOUNTS.map((amount) => (
                  <button
                    key={amount}
                    className="rounded-full bg-[#101418] px-2 py-1"
                    onClick={() => addQuickAmount(amount)}
                  >
                    {amount.toFixed(2)}
                  </button>
                ))}
              </div>

              <button
                className="rounded-2xl bg-emerald-500 px-4 py-3 text-lg font-semibold text-slate-950 disabled:opacity-50"
                onClick={() => {
                  if (canCashout) return handleCashout();
                  if (canBet) return handleBet();
                }}
                disabled={!canBet && !canCashout}
              >
                {canCashout ? "Cash Out" : "Bet"}
              </button>
            </div>

            {tab === "auto" && (
              <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={autoBet} onChange={(e) => setAutoBet(e.target.checked)} />
                  Auto bet
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={autoCash} onChange={(e) => setAutoCash(e.target.checked)} />
                  Auto Cash Out
                </label>
                <input
                  className="w-16 rounded bg-[#101418] px-2 py-1"
                  value={autoCashValue}
                  onChange={(e) => setAutoCashValue(e.target.value)}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="block rounded-2xl bg-[#111519] p-4 lg:hidden">
        <div className="flex items-center justify-between rounded-full bg-[#0f1317] px-2 py-2 text-sm">
          <button className="rounded-full bg-[#1f252b] px-5 py-1 font-semibold">All Bets</button>
          <button className="rounded-full px-5 py-1 text-slate-400">Previous</button>
          <button className="rounded-full px-5 py-1 text-slate-400">Top</button>
        </div>
        <div className="mt-4 flex items-center justify-between rounded-xl bg-[#1b2025] px-4 py-3">
          <div>
            <div className="text-xs text-slate-400">Bets</div>
            <div className="text-sm font-semibold">3764/3764</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-400">Total win USDC</div>
            <div className="text-lg font-semibold">0.00</div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-[1fr_1fr_0.6fr_1fr] gap-2 text-xs uppercase text-slate-500">
          <div>Player</div>
          <div>Bet USDC</div>
          <div>X</div>
          <div>Win USDC</div>
        </div>
        <div className="mt-2 space-y-2 text-sm">
          {[1, 2, 3, 4, 5, 6].map((row) => (
            <div key={row} className="grid grid-cols-[1fr_1fr_0.6fr_1fr] items-center gap-2 rounded-lg bg-[#0d1114] px-3 py-2">
              <span>b***{row}</span>
              <span>{(Math.random() * 200000 + 50000).toFixed(2)}</span>
              <span className="text-emerald-400">{(Math.random() * 2 + 1).toFixed(2)}x</span>
              <span>{(Math.random() * 400000 + 80000).toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
