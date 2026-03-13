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

const QUICK_AMOUNTS = [1000, 2000, 5000, 10000];

export default function GamePanel({ onCashout, onBetPlaced, hasFunds, showToast }: Props) {
  const [status, setStatus] = useState<EngineState["status"]>("waiting");
  const [multiplier, setMultiplier] = useState(1);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [crashPoint, setCrashPoint] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [history, setHistory] = useState<number[]>([]);
  const [bettingEndsAt, setBettingEndsAt] = useState<number | null>(null);
  const [historyLimit, setHistoryLimit] = useState(60);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [rowRatio, setRowRatio] = useState("55% 45%");
  const [tab, setTab] = useState<"bet" | "auto">("bet");
  const [panels, setPanels] = useState([
    { id: "A" as const, betAmount: "1.00", betId: null as string | null, inputDirty: false, autoBet: false, autoCash: false, autoCashValue: "1.10" },
    { id: "B" as const, betAmount: "1.00", betId: null as string | null, inputDirty: false, autoBet: false, autoCash: false, autoCashValue: "1.10" }
  ]);

  const token = useMemo(() => localStorage.getItem("token"), []);
  const socketRef = useRef<WebSocket | null>(null);
  const autoCashTriggered = useRef<Record<string, boolean>>({});

  const bettingProgress = bettingEndsAt
    ? Math.max(0, Math.min(1, (bettingEndsAt - Date.now()) / 5000))
    : 0;

  useEffect(() => {
    const updateLimit = () => {
      setHistoryLimit(window.innerWidth >= 1024 ? 60 : 30);
      setRowRatio(window.innerWidth >= 1024 ? "55% 45%" : "50% 50%");
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
        autoCashTriggered.current = {};
        setPanels((prev) => prev.map((panel) => ({ ...panel, betId: null })));
        setLog((prev) => ["Round started", ...prev].slice(0, 5));

        setPanels((prev) =>
          prev.map((panel) => {
            if (panel.autoBet && hasFunds) {
              handleBet(panel.id, panel.betAmount);
            }
            return panel;
          })
        );
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
        autoCashTriggered.current = {};
        setPanels((prev) => prev.map((panel) => ({ ...panel, betId: null })));
        setLog((prev) => ["Round crashed", ...prev].slice(0, 5));
        return;
      }
      if (msg.type === "round_history") {
        const list = Array.isArray(msg.history) ? (msg.history as number[]) : [];
        setHistory(list.slice(0, historyLimit));
        return;
      }
      if (msg.type === "bet_confirmed") {
        const betId = String(msg.betId ?? "");
        const clientTag = String(msg.clientTag ?? "");
        setPanels((prev) => prev.map((panel) => (panel.id === clientTag ? { ...panel, betId } : panel)));
        onBetPlaced?.();
        setLog((prev) => ["Bet confirmed", ...prev].slice(0, 5));
        return;
      }
      if (msg.type === "cashout_success") {
        const payout = Number(msg.payout ?? 0);
        const betId = String(msg.betId ?? "");
        onCashout?.(payout);
        showToast?.(`Cashed out ${payout.toFixed(2)} USDC`);
        autoCashTriggered.current[betId] = true;
        setPanels((prev) => prev.map((panel) => (panel.betId === betId ? { ...panel, betId: null } : panel)));
        setLog((prev) => [`Cashed out ${payout}`, ...prev].slice(0, 5));
        return;
      }
      if (msg.type === "error") {
        setLog((prev) => [`Error: ${String(msg.message ?? "unknown")}`, ...prev].slice(0, 5));
      }
    };

    return () => ws.close();
  }, [hasFunds, historyLimit, onBetPlaced, onCashout, showToast]);

  useEffect(() => {
    if (status !== "running") return;
    panels.forEach((panel) => {
      if (!panel.autoCash || !panel.betId) return;
      if (autoCashTriggered.current[panel.betId]) return;
      const target = Number(panel.autoCashValue);
      if (Number.isFinite(target) && multiplier >= target) {
        autoCashTriggered.current[panel.betId] = true;
        handleCashout(panel.betId);
      }
    });
  }, [multiplier, panels, status]);

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

  function handleBet(panelId: "A" | "B", amount: string) {
    if (!token) return;
    sendMessage({ type: "place_bet", amount, token, clientTag: panelId });
  }

  function handleCashout(betId?: string) {
    if (!token) return;
    sendMessage({ type: "cash_out", token, betId });
  }

  function addQuickAmount(panelId: "A" | "B", amount: number) {
    setPanels((prev) =>
      prev.map((panel) => {
        if (panel.id !== panelId) return panel;
        if (panel.inputDirty) return panel;
        const current = Number(panel.betAmount) || 0;
        return { ...panel, betAmount: (current + amount).toFixed(2) };
      })
    );
  }

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

        <div className="relative grid h-full gap-1" style={{ gridTemplateRows: rowRatio }}>
          <div className="absolute left-0 right-0 top-0 z-20">
            <div className={`flex justify-between items-start rounded-2xl bg-[#111519] px-4 py-3 shadow-xl ${historyExpanded ? "" : "overflow-hidden"}`}>
              <div className={historyExpanded ? "mt-2 flex flex-wrap gap-2 text-xs text-slate-300" : "mt-2 flex flex-nowrap gap-2 text-xs text-slate-300 overflow-hidden"}>
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

          <div className="rounded-2xl bg-[#1a1f23]">
            <div className="grid gap-4 lg:grid-cols-2">
              {panels.map((panel) => {
                const canBet = status === "betting" && hasFunds && Number(panel.betAmount) > 0 && !panel.betId;
                const canCashout = status === "running" && hasFunds && !!panel.betId;

                return (
                  <div key={panel.id} className="rounded-2xl bg-[#20262b] p-4">
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

                    <div className="mt-4 grid gap-3">
                      <div className="flex items-center gap-3">
                        <button
                          className="h-7 w-7 rounded-full bg-[#101418]"
                          onClick={() =>
                            setPanels((prev) =>
                              prev.map((p) =>
                                p.id === panel.id
                                  ? { ...p, betAmount: (Math.max(0, Number(p.betAmount) - 1)).toFixed(2) }
                                  : p
                              )
                            )
                          }
                        >
                          -
                        </button>
                        <input
                          value={panel.betAmount}
                          onChange={(e) =>
                            setPanels((prev) =>
                              prev.map((p) =>
                                p.id === panel.id ? { ...p, betAmount: e.target.value, inputDirty: true } : p
                              )
                            )
                          }
                          onBlur={() =>
                            setPanels((prev) =>
                              prev.map((p) => (p.id === panel.id ? { ...p, inputDirty: false } : p))
                            )
                          }
                          className="w-20 rounded bg-[#101418] px-3 py-2 text-center text-lg"
                        />
                        <button
                          className="h-7 w-7 rounded-full bg-[#101418]"
                          onClick={() =>
                            setPanels((prev) =>
                              prev.map((p) =>
                                p.id === panel.id
                                  ? { ...p, betAmount: (Number(p.betAmount) + 1).toFixed(2) }
                                  : p
                              )
                            )
                          }
                        >
                          +
                        </button>

                        <button
                          className="ml-auto rounded-2xl bg-[#4CAF50] px-4 py-3 text-lg font-semibold text-white disabled:opacity-50"
                          onClick={() => {
                            if (canCashout) return handleCashout(panel.betId ?? undefined);
                            if (canBet) return handleBet(panel.id, panel.betAmount);
                          }}
                          disabled={!canBet && !canCashout}
                        >
                          <div>Bet</div>
                          <div className="text-sm font-semibold">{Number(panel.betAmount).toFixed(2)} USDC</div>
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
                        {QUICK_AMOUNTS.map((amount) => (
                          <button
                            key={amount}
                            className="rounded-full bg-[#101418] px-2 py-1"
                            onClick={() => addQuickAmount(panel.id, amount)}
                          >
                            {amount.toLocaleString()}
                          </button>
                        ))}
                      </div>
                    </div>

                    {tab === "auto" && (
                      <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={panel.autoBet}
                            onChange={(e) =>
                              setPanels((prev) =>
                                prev.map((p) => (p.id === panel.id ? { ...p, autoBet: e.target.checked } : p))
                              )
                            }
                          />
                          Auto bet
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={panel.autoCash}
                            onChange={(e) =>
                              setPanels((prev) =>
                                prev.map((p) => (p.id === panel.id ? { ...p, autoCash: e.target.checked } : p))
                              )
                            }
                          />
                          Auto Cash Out
                        </label>
                        <input
                          className="w-14 rounded bg-[#101418] px-2 py-1"
                          value={panel.autoCashValue}
                          onChange={(e) =>
                            setPanels((prev) =>
                              prev.map((p) => (p.id === panel.id ? { ...p, autoCashValue: e.target.value } : p))
                            )
                          }
                        />
                        <button
                          className="rounded-full bg-[#101418] px-2 py-1"
                          onClick={() =>
                            setPanels((prev) =>
                              prev.map((p) => (p.id === panel.id ? { ...p, autoCash: false } : p))
                            )
                          }
                        >
                          ×
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
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
