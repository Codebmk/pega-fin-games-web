import { useEffect, useMemo, useRef, useState } from "react";
import { wsBase } from "./api";

// ─── Types ────────────────────────────────────────────────────────────────────

type GameStatus = "waiting" | "betting" | "running" | "crashed";

type EngineState = {
  status: GameStatus;
  multiplier: number;
  roundId: string | null;
  crashPoint: number | null;
  bettingEndsAt?: number | null;
  history?: number[];
  lastCrashPoint?: number | null;
};

type WsMessage = { type: string; [key: string]: unknown };

type PanelState = {
  id: "A" | "B";
  betAmount: string;
  betId: string | null;
  activeBetAmount: number | null;
  pendingBet: boolean;
  inputDirty: boolean;
  autoBet: boolean;
  autoCash: boolean;
  autoCashValue: string;
};

type GamePanelProps = {
  onCashout?: (payout: number) => void;
  onBetPlaced?: () => void;
  hasFunds: boolean;
  showToast?: (message: string) => void;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const QUICK_AMOUNTS = [1000, 2000, 5000, 10000];

const INITIAL_PANELS: PanelState[] = [
  { id: "A", betAmount: "1.00", betId: null, activeBetAmount: null, pendingBet: false, inputDirty: false, autoBet: false, autoCash: false, autoCashValue: "1.10" },
  { id: "B", betAmount: "1.00", betId: null, activeBetAmount: null, pendingBet: false, inputDirty: false, autoBet: false, autoCash: false, autoCashValue: "1.10" },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Reusable toggle switch */
function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <div
      onClick={onChange}
      className={`relative w-8 h-4 rounded-full cursor-pointer transition-colors flex-shrink-0 ${
        checked ? "bg-emerald-500" : "bg-[#101418]"
      }`}
    >
      <div
        className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </div>
  );
}

/** Bet / Auto tab switcher */
function TabSwitcher({
  tab,
  onChange,
}: {
  tab: "bet" | "auto";
  onChange: (t: "bet" | "auto") => void;
}) {
  return (
    <div className="flex items-center rounded-full bg-[#101418] p-1 text-xs">
      {(["bet", "auto"] as const).map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`flex-1 rounded-full py-1.5 transition-all ${
            tab === t
              ? "bg-[#2a3038] text-white font-semibold"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          {t === "bet" ? "Bet" : "Auto"}
        </button>
      ))}
    </div>
  );
}

/** − [input] + stepper */
function AmountStepper({
  value,
  onChange,
  onBlur,
  onDecrement,
  onIncrement,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  onDecrement: () => void;
  onIncrement: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onDecrement}
        disabled={disabled}
        className="h-8 w-8 flex-shrink-0 rounded-full bg-[#101418] text-white flex items-center justify-center text-lg leading-none hover:bg-[#2a3038] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        −
      </button>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        disabled={disabled}
        className="flex-1 min-w-0 rounded-lg bg-[#101418] px-1 py-2 text-center text-sm font-semibold text-white outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
      />
      <button
        onClick={onIncrement}
        disabled={disabled}
        className="h-8 w-8 flex-shrink-0 rounded-full bg-[#101418] text-white flex items-center justify-center text-lg leading-none hover:bg-[#2a3038] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        +
      </button>
    </div>
  );
}

/** 2×2 quick-amount preset grid */
function QuickAmounts({
  onSelect,
  disabled,
}: {
  onSelect: (amount: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {QUICK_AMOUNTS.map((amount) => (
        <button
          key={amount}
          onClick={() => onSelect(amount)}
          disabled={disabled}
          className="rounded-full bg-[#101418] py-1 text-xs text-slate-300 hover:bg-[#2a3038] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {amount.toLocaleString()}
        </button>
      ))}
    </div>
  );
}

/** Green Bet / amber Cash Out button */
function ActionButton({
  canBet,
  canCashout,
  amount,
  onBet,
  onCashout,
  isPendingBet,
  onCancelBet,
}: {
  canBet: boolean;
  canCashout: boolean;
  amount: string;
  onBet: () => void;
  onCashout: () => void;
  isPendingBet: boolean;
  onCancelBet: () => void;
}) {
  if (isPendingBet) {
    return (
      <button
        onClick={onCancelBet}
        className="flex-1 min-w-0 rounded-2xl font-semibold text-white flex flex-col items-center justify-center gap-0.5 py-3 px-2 transition-colors bg-[#3a4148] hover:bg-[#4a525a]"
      >
        <span className="text-sm font-bold leading-tight truncate">Cancel</span>
        <span className="text-xs font-semibold leading-tight truncate">
          {Number(amount).toFixed(2)} USDC
        </span>
      </button>
    );
  }

  return (
    <button
      disabled={!canBet && !canCashout}
      onClick={() => (canCashout ? onCashout() : onBet())}
      className={`flex-1 min-w-0 rounded-2xl font-semibold text-white flex flex-col items-center justify-center gap-0.5 py-3 px-2 transition-colors disabled:opacity-40 ${
        canCashout
          ? "bg-amber-500 hover:bg-amber-400"
          : "bg-[#4CAF50] hover:bg-[#43a047]"
      }`}
    >
      <span className="text-sm font-bold leading-tight truncate">
        {canCashout ? "Cash Out" : "Bet"}
      </span>
      <span className="text-xs font-semibold leading-tight truncate">
        {Number(amount).toFixed(2)} USDC
      </span>
    </button>
  );
}

/** Auto bet / auto cash-out controls row */
function AutoRow({
  panel,
  onToggleAutoBet,
  onToggleAutoCash,
  onAutoCashValueChange,
  onDismiss,
}: {
  panel: PanelState;
  onToggleAutoBet: () => void;
  onToggleAutoCash: () => void;
  onAutoCashValueChange: (v: string) => void;
  onDismiss: () => void;
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap pt-2 border-t border-[#101418]">
      <label className="flex items-center gap-1.5 cursor-pointer select-none">
        <Toggle checked={panel.autoBet} onChange={onToggleAutoBet} />
        Auto bet
      </label>
      <label className="flex items-center gap-1.5 cursor-pointer select-none">
        <Toggle checked={panel.autoCash} onChange={onToggleAutoCash} />
        Auto Cash Out
      </label>
      <input
        className="w-14 rounded bg-[#101418] px-2 py-1 text-white text-center outline-none focus:ring-1 focus:ring-emerald-500"
        value={panel.autoCashValue}
        onChange={(e) => onAutoCashValueChange(e.target.value)}
      />
      <button
        onClick={onDismiss}
        className="ml-auto h-6 w-6 rounded-full bg-[#101418] flex items-center justify-center hover:bg-[#2a3038] transition-colors"
      >
        ×
      </button>
    </div>
  );
}

/** Single betting panel card */
function BetPanel({
  panel,
  tab,
  onTabChange,
  canBet,
  canCashout,
  onBet,
  onCashout,
  onCancelBet,
  onAmountChange,
  onAmountBlur,
  onDecrement,
  onIncrement,
  onQuickAmount,
  onToggleAutoBet,
  onToggleAutoCash,
  onAutoCashValueChange,
  onDismissAutoCash,
  inputLocked,
}: {
  panel: PanelState;
  tab: "bet" | "auto";
  onTabChange: (t: "bet" | "auto") => void;
  canBet: boolean;
  canCashout: boolean;
  onBet: () => void;
  onCashout: () => void;
  onCancelBet: () => void;
  onAmountChange: (v: string) => void;
  onAmountBlur: () => void;
  onDecrement: () => void;
  onIncrement: () => void;
  onQuickAmount: (amount: number) => void;
  onToggleAutoBet: () => void;
  onToggleAutoCash: () => void;
  onAutoCashValueChange: (v: string) => void;
  onDismissAutoCash: () => void;
  inputLocked: boolean;
}) {
  return (
    <div className="rounded-2xl bg-[#20262b] p-3 flex flex-col gap-2 min-w-0 overflow-hidden">
      <TabSwitcher tab={tab} onChange={onTabChange} />

      <div className="flex gap-2 items-stretch">
        {/* Left: amount controls — 45% width, never grows beyond that */}
        <div className="flex flex-col gap-2 flex-shrink-0" style={{ width: "45%" }}>
          <AmountStepper
            value={panel.betAmount}
            onChange={onAmountChange}
            onBlur={onAmountBlur}
            onDecrement={onDecrement}
            onIncrement={onIncrement}
            disabled={inputLocked}
          />
          <QuickAmounts onSelect={onQuickAmount} disabled={inputLocked} />
        </div>

        {/* Right: action button spanning full height */}
        <ActionButton
          canBet={canBet}
          canCashout={canCashout}
          amount={panel.betAmount}
          onBet={onBet}
          onCashout={onCashout}
          isPendingBet={panel.pendingBet}
          onCancelBet={onCancelBet}
        />
      </div>

      {tab === "auto" && (
        <AutoRow
          panel={panel}
          onToggleAutoBet={onToggleAutoBet}
          onToggleAutoCash={onToggleAutoCash}
          onAutoCashValueChange={onAutoCashValueChange}
          onDismiss={onDismissAutoCash}
        />
      )}
    </div>
  );
}

/** Scrolling history pills across top of canvas */
function HistoryBar({
  history,
  expanded,
  onToggle,
}: {
  history: number[];
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`flex justify-between items-start rounded-2xl bg-[#111519] px-4 py-3 shadow-xl ${
        expanded ? "" : "overflow-hidden"
      }`}
    >
      <div
        className={`flex gap-2 text-xs text-slate-300 ${
          expanded ? "flex-wrap" : "flex-nowrap overflow-hidden"
        }`}
      >
        {history.map((val, idx) => (
          <span
            key={`${val}-${idx}`}
            className={val >= 2 ? "text-emerald-400" : "text-rose-400"}
          >
            {val.toFixed(2)}x
          </span>
        ))}
      </div>
      <button
        onClick={onToggle}
        className="ml-3 flex-shrink-0 rounded-full bg-[#1f252b] px-2 py-1 text-xs"
      >
        {expanded ? "×" : "···"}
      </button>
    </div>
  );
}

/** Game canvas showing multiplier */
function GameCanvas({
  status,
  multiplier,
  crashPoint,
  connected,
  bettingProgress,
}: {
  status: GameStatus;
  multiplier: number;
  crashPoint: number | null;
  connected: boolean;
  bettingProgress: number;
}) {
  return (
    <div className="h-full rounded-2xl bg-[radial-gradient(circle_at_top,_#232a30,_#0b0f12)] p-5 flex flex-col">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span className="uppercase tracking-wider">{status}</span>
        <span>{connected ? "WS connected" : "WS disconnected"}</span>
      </div>
      {status === "betting" && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#101418]">
          <div
            className="h-full bg-emerald-400 transition-all"
            style={{ width: `${bettingProgress * 100}%` }}
          />
        </div>
      )}
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="text-xs text-slate-400 mb-1">Multiplier</div>
        <div
          className={`text-5xl font-semibold ${
            status === "crashed" ? "text-rose-500" : "text-emerald-400"
          }`}
        >
          {multiplier.toFixed(2)}x
        </div>
        {status === "crashed" && (
          <div className="mt-2 text-sm text-rose-400">
            Flew away at {crashPoint?.toFixed(2)}x
          </div>
        )}
      </div>
    </div>
  );
}

/** Bets table — shared by desktop sidebar and mobile bottom panel */
function BetsTable({ rows = 8 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between rounded-full bg-[#0f1317] px-1.5 py-1.5 text-xs gap-1">
        <button className="flex-1 whitespace-nowrap rounded-full bg-[#1f252b] px-3 py-1 font-semibold text-center">All Bets</button>
        <button className="flex-1 whitespace-nowrap rounded-full px-3 py-1 text-slate-400 text-center">Previous</button>
        <button className="flex-1 whitespace-nowrap rounded-full px-3 py-1 text-slate-400 text-center">Top</button>
      </div>
      <div className="flex items-center justify-between rounded-xl bg-[#1b2025] px-4 py-3">
        <div>
          <div className="text-xs text-slate-400">Bets</div>
          <div className="text-sm font-semibold">3764/3764</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-400">Total win USDC</div>
          <div className="text-lg font-semibold">0.00</div>
        </div>
      </div>
      <div className="grid grid-cols-[1fr_1fr_0.5fr_1fr] gap-1 text-xs uppercase text-slate-500 px-1">
        <div className="truncate">Player</div>
        <div className="truncate">Bet USDC</div>
        <div className="truncate">X</div>
        <div className="truncate">Win USDC</div>
      </div>
      <div className="space-y-2 text-xs">
        {Array.from({ length: rows }, (_, i) => i + 1).map((row) => (
          <div
            key={row}
            className="grid grid-cols-[1fr_1fr_0.5fr_1fr] items-center gap-1 rounded-lg bg-[#0d1114] px-2 py-2"
          >
            <span className="truncate">b***{row}</span>
            <span className="truncate">{(Math.random() * 200000 + 50000).toFixed(2)}</span>
            <span className="text-emerald-400 truncate">{(Math.random() * 2 + 1).toFixed(2)}x</span>
            <span className="truncate">{(Math.random() * 400000 + 80000).toFixed(2)}</span>
          </div>
        ))}
      </div>
      <div className="text-xs text-slate-500">Provably Fair Game</div>
    </div>
  );
}

// ─── Root Component ───────────────────────────────────────────────────────────

export default function GamePanel({ onCashout, onBetPlaced, hasFunds, showToast }: GamePanelProps) {
  const [status, setStatus] = useState<GameStatus>("waiting");
  const [multiplier, setMultiplier] = useState(1);
  const [crashPoint, setCrashPoint] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [history, setHistory] = useState<number[]>([]);
  const [bettingEndsAt, setBettingEndsAt] = useState<number | null>(null);
  const [historyLimit, setHistoryLimit] = useState(60);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [tab, setTab] = useState<"bet" | "auto">("bet");
  const [panels, setPanels] = useState<PanelState[]>(INITIAL_PANELS);

  const token = useMemo(() => localStorage.getItem("token"), []);
  const socketRef = useRef<WebSocket | null>(null);
  const autoCashTriggered = useRef<Record<string, boolean>>({});
  const pendingBetTimers = useRef<Record<PanelState["id"], number | null>>({ A: null, B: null });
  const optimisticCashouts = useRef<Record<string, number>>({});

  const bettingProgress = bettingEndsAt
    ? Math.max(0, Math.min(1, (bettingEndsAt - Date.now()) / 5000))
    : 0;

  // Responsive history limit
  useEffect(() => {
    const update = () => setHistoryLimit(window.innerWidth >= 1024 ? 60 : 30);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // WebSocket lifecycle
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
        const s = msg.state as EngineState;
        setStatus(s.status);
        setMultiplier(s.multiplier ?? 1);
        setHistory((s.history ?? []).slice(0, historyLimit));
        setCrashPoint(s.lastCrashPoint ?? null);
        return;
      }
      if (msg.type === "round_start") {
        setStatus("betting");
        setCrashPoint(null);
        setBettingEndsAt(Number(msg.bettingEndsAt ?? null));
        autoCashTriggered.current = {};
        clearPendingBets();
        setPanels((prev) => prev.map((p) => ({ ...p, betId: null, activeBetAmount: null })));
        setPanels((prev) =>
          prev.map((p) => {
            if (p.autoBet && hasFunds) handleBet(p.id, p.betAmount);
            return p;
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
        optimisticCashouts.current = {};
        clearPendingBets();
        setPanels((prev) => prev.map((p) => ({ ...p, betId: null, activeBetAmount: null })));
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
        setPanels((prev) =>
          prev.map((p) =>
            p.id === clientTag
              ? { ...p, betId, activeBetAmount: Number(p.betAmount), pendingBet: false }
              : p
          )
        );
        onBetPlaced?.();
        return;
      }
      if (msg.type === "cashout_success") {
        const payout = Number(msg.payout ?? 0);
        const betId = String(msg.betId ?? "");
        const hadOptimistic = optimisticCashouts.current[betId] != null;
        delete optimisticCashouts.current[betId];
        onCashout?.(payout);
        if (!hadOptimistic) {
          showToast?.(`Cashed out ${payout.toFixed(2)} USDC`);
        }
        autoCashTriggered.current[betId] = true;
        setPanels((prev) =>
          prev.map((p) =>
            p.betId === betId ? { ...p, betId: null, activeBetAmount: null } : p
          )
        );
        return;
      }
    };

    return () => {
      clearPendingBets(false);
      ws.close();
    };
  }, [hasFunds, historyLimit, onBetPlaced, onCashout, showToast]);

  // Auto cash-out watcher
  useEffect(() => {
    if (status !== "running") return;
    panels.forEach((p) => {
      if (!p.autoCash || !p.betId || autoCashTriggered.current[p.betId]) return;
      const target = Number(p.autoCashValue);
      if (Number.isFinite(target) && multiplier >= target) {
        autoCashTriggered.current[p.betId] = true;
        handleCashout(p.betId);
      }
    });
  }, [multiplier, panels, status]);

  // RAF ticker to keep bettingProgress live
  useEffect(() => {
    let raf: number;
    const tick = () => {
      if (bettingEndsAt) setBettingEndsAt((prev) => prev);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [bettingEndsAt]);

  // ── Helpers ──

  function sendMessage(payload: object) {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(payload));
  }

  function handleBet(panelId: "A" | "B", amount: string) {
    if (!token) return;
    if (pendingBetTimers.current[panelId]) return;
    setPanels((prev) => prev.map((p) => (p.id === panelId ? { ...p, pendingBet: true } : p)));
    pendingBetTimers.current[panelId] = window.setTimeout(() => {
      pendingBetTimers.current[panelId] = null;
      setPanels((prev) => prev.map((p) => (p.id === panelId ? { ...p, pendingBet: false } : p)));
      sendMessage({ type: "place_bet", amount, token, clientTag: panelId });
    }, 450);
  }

  function handleCashout(betId?: string) {
    if (!token) return;
    if (betId) {
      const panel = panels.find((p) => p.betId === betId);
      if (panel) {
        const amount = panel.activeBetAmount ?? Number(panel.betAmount);
        const payout = Number((amount * multiplier).toFixed(2));
        optimisticCashouts.current[betId] = payout;
        showToast?.(`Cashed out ${payout.toFixed(2)} USDC`);
        setPanels((prev) =>
          prev.map((p) => (p.betId === betId ? { ...p, betId: null, activeBetAmount: null } : p))
        );
      }
    }
    sendMessage({ type: "cash_out", token, betId });
  }

  function cancelPendingBet(panelId: "A" | "B") {
    const timer = pendingBetTimers.current[panelId];
    if (timer) {
      clearTimeout(timer);
      pendingBetTimers.current[panelId] = null;
      setPanels((prev) => prev.map((p) => (p.id === panelId ? { ...p, pendingBet: false } : p)));
      showToast?.("Bet canceled.");
    }
  }

  function clearPendingBets(resetState = true) {
    (Object.keys(pendingBetTimers.current) as PanelState["id"][]).forEach((id) => {
      const timer = pendingBetTimers.current[id];
      if (timer) clearTimeout(timer);
      pendingBetTimers.current[id] = null;
    });
    if (resetState) {
      setPanels((prev) => prev.map((p) => (p.pendingBet ? { ...p, pendingBet: false } : p)));
    }
  }

  function updatePanel(id: "A" | "B", patch: Partial<PanelState>) {
    setPanels((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function addQuickAmount(id: "A" | "B", amount: number) {
    setPanels((prev) =>
      prev.map((p) => {
        if (p.id !== id || p.inputDirty) return p;
        return { ...p, betAmount: (Number(p.betAmount) + amount).toFixed(2) };
      })
    );
  }

  const historyVisible = historyExpanded
    ? history
    : history.slice(0, Math.min(historyLimit, 18));

  // ── Render ──

  return (
    <div className="flex h-full flex-col gap-4 w-full">

      {/* ── Desktop layout ── */}
      <div className="flex flex-1 gap-4 min-h-0 w-full">

        {/* Sidebar: bets table — fixed width, never shrinks or grows */}
        <div className="hidden lg:flex flex-col flex-shrink-0 rounded-2xl bg-[#111519] p-4 overflow-y-auto" style={{ width: "clamp(300px, 26%, 380px)" }}>
          <BetsTable rows={8} />
        </div>

        {/* Main column: history + canvas + panels — takes remaining space */}
        <div className="flex flex-col flex-1 gap-3 min-w-0 min-h-0 overflow-hidden">

          {/* History bar */}
          <div className="flex-shrink-0">
            <HistoryBar
              history={historyVisible}
              expanded={historyExpanded}
              onToggle={() => setHistoryExpanded((v) => !v)}
            />
          </div>

          {/* Canvas — flex-1 fills all remaining vertical space above panels */}
          <div className="flex-1 min-h-[200px]">
            <GameCanvas
              status={status}
              multiplier={multiplier}
              crashPoint={crashPoint}
              connected={connected}
              bettingProgress={bettingProgress}
            />
          </div>

          {/* Betting panels — always fully rendered, never clipped */}
          <div className="flex-shrink-0 rounded-2xl bg-[#1a1f23] p-3">
            <div className="grid grid-cols-2 gap-3 w-full">
              {panels.map((panel) => {
                const canBet =
                  status === "betting" &&
                  hasFunds &&
                  Number(panel.betAmount) > 0 &&
                  !panel.betId &&
                  !panel.pendingBet;
                const canCashout = status === "running" && hasFunds && !!panel.betId;
                const inputLocked = panel.pendingBet;

                return (
                  <BetPanel
                    key={panel.id}
                    panel={panel}
                    tab={tab}
                    onTabChange={setTab}
                    canBet={canBet}
                    canCashout={canCashout}
                    onBet={() => handleBet(panel.id, panel.betAmount)}
                    onCashout={() => handleCashout(panel.betId ?? undefined)}
                    onCancelBet={() => cancelPendingBet(panel.id)}
                    onAmountChange={(v) => updatePanel(panel.id, { betAmount: v, inputDirty: true })}
                    onAmountBlur={() => updatePanel(panel.id, { inputDirty: false })}
                    onDecrement={() =>
                      updatePanel(panel.id, {
                        betAmount: Math.max(0, Number(panel.betAmount) - 1).toFixed(2),
                      })
                    }
                    onIncrement={() =>
                      updatePanel(panel.id, {
                        betAmount: (Number(panel.betAmount) + 1).toFixed(2),
                      })
                    }
                    onQuickAmount={(amount) => addQuickAmount(panel.id, amount)}
                    onToggleAutoBet={() => updatePanel(panel.id, { autoBet: !panel.autoBet })}
                    onToggleAutoCash={() => updatePanel(panel.id, { autoCash: !panel.autoCash })}
                    onAutoCashValueChange={(v) => updatePanel(panel.id, { autoCashValue: v })}
                    onDismissAutoCash={() => updatePanel(panel.id, { autoCash: false })}
                    inputLocked={inputLocked}
                  />
                );
              })}
            </div>
          </div>

        </div>
      </div>

      {/* ── Mobile bets table ── */}
      <div className="block lg:hidden rounded-2xl bg-[#111519] p-4">
        <BetsTable rows={6} />
      </div>

    </div>
  );
}
