import crypto from "crypto";
import { ulid } from "ulid";
import { adjustBalance } from "../db/wallets.js";
import { createRound, finishRound } from "../db/rounds.js";
import { createBet, settleBet } from "../db/bets.js";

export type RoundStatus = "waiting" | "betting" | "running" | "crashed";

export type BetEntry = {
  id: string;
  userId: string;
  amount: number;
  cashedOut: boolean;
  cashoutMultiplier: number | null;
};

export type RoundState = {
  roundId: string | null;
  status: RoundStatus;
  multiplier: number;
  crashPoint: number | null;
  serverSeedHash: string | null;
  serverSeed: string | null;
  clientSeed: string;
  nonce: number;
  startedAt: number | null;
  bettingEndsAt: number | null;
  lastCrashPoint: number | null;
  history: number[];
};

export type BroadcastFn = (message: unknown) => void;

export class GameEngine {
  private broadcast: BroadcastFn;
  private state: RoundState;
  private bets: Map<string, BetEntry>;
  private running = false;
  private history: number[] = [];

  constructor(broadcast: BroadcastFn) {
    this.broadcast = broadcast;
    this.state = {
      roundId: null,
      status: "waiting",
      multiplier: 1,
      crashPoint: null,
      serverSeedHash: null,
      serverSeed: null,
      clientSeed: "public-seed",
      nonce: 0,
      startedAt: null,
      bettingEndsAt: null,
      lastCrashPoint: null,
      history: []
    };
    this.bets = new Map();
  }

  getState() {
    return { ...this.state, history: [...this.history] };
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.loop();
  }

  stop() {
    this.running = false;
  }

  async placeBet(userId: string, amount: number) {
    if (this.state.status !== "betting") {
      throw new Error("betting_closed");
    }
    if (amount <= 0) {
      throw new Error("invalid_amount");
    }

    await adjustBalance({
      userId,
      amount: -amount,
      type: "bet",
      status: "completed"
    });

    const betId = ulid();
    this.bets.set(betId, {
      id: betId,
      userId,
      amount,
      cashedOut: false,
      cashoutMultiplier: null
    });

    if (this.state.roundId) {
      await createBet({
        id: betId,
        userId,
        roundId: this.state.roundId,
        amount
      });
    }

    return betId;
  }

  async cashOut(userId: string, betId?: string) {
    if (this.state.status !== "running") {
      throw new Error("round_not_running");
    }
    const multiplier = this.state.multiplier;

    const bet = betId
      ? this.bets.get(betId)
      : Array.from(this.bets.values()).find(
          (entry) => entry.userId === userId && !entry.cashedOut
        );
    if (!bet) {
      throw new Error("bet_not_found");
    }
    if (bet.userId !== userId) {
      throw new Error("bet_not_found");
    }
    if (bet.cashedOut) {
      throw new Error("bet_already_cashed");
    }

    bet.cashedOut = true;
    bet.cashoutMultiplier = multiplier;

    const payout = Number((bet.amount * multiplier).toFixed(2));

    await adjustBalance({
      userId,
      amount: payout,
      type: "win",
      status: "completed"
    });

    await settleBet({
      betId: bet.id,
      result: "won",
      cashoutMultiplier: multiplier
    });

    return { betId: bet.id, payout, multiplier };
  }

  private async loop() {
    while (this.running) {
      await this.bettingPhase();
      await this.runningPhase();
      await this.crashPhase();
      await this.sleep(3000);
    }
  }

  private async bettingPhase() {
    this.bets.clear();
    this.state.status = "betting";
    this.state.multiplier = 1;
    this.state.startedAt = null;
    this.state.nonce += 1;

    const serverSeed = crypto.randomBytes(32).toString("hex");
    const serverSeedHash = crypto
      .createHash("sha256")
      .update(serverSeed)
      .digest("hex");

    const crashPoint = this.computeCrashPoint(serverSeed, this.state.clientSeed, this.state.nonce);

    this.state.serverSeed = serverSeed;
    this.state.serverSeedHash = serverSeedHash;
    this.state.crashPoint = crashPoint;
    this.state.roundId = ulid();
    this.state.bettingEndsAt = Date.now() + 5000;

    await createRound({
      id: this.state.roundId,
      crashPoint,
      serverSeedHash,
      clientSeed: this.state.clientSeed,
      nonce: this.state.nonce
    });

    this.broadcast({
      type: "server_seed_hash",
      roundId: this.state.roundId,
      hash: serverSeedHash
    });

    this.broadcast({
      type: "round_start",
      roundId: this.state.roundId,
      startsAt: new Date().toISOString(),
      bettingEndsAt: this.state.bettingEndsAt
    });

    await this.sleep(5000);
  }

  private async runningPhase() {
    this.state.status = "running";
    this.state.startedAt = Date.now();
    const crashPoint = this.state.crashPoint ?? 1;

    while (this.state.multiplier < crashPoint && this.running) {
      const elapsedMs = Date.now() - (this.state.startedAt ?? Date.now());
      const elapsedSeconds = elapsedMs / 1000;
      const growthRate = 0.06;
      const nextMultiplier = Math.max(1, Math.exp(growthRate * elapsedSeconds));
      this.state.multiplier = Number(nextMultiplier.toFixed(2));

      this.broadcast({
        type: "multiplier_update",
        multiplier: this.state.multiplier
      });

      await this.sleep(100);
    }
  }

  private async crashPhase() {
    this.state.status = "crashed";
    const roundId = this.state.roundId;
    const crashPoint = this.state.crashPoint ?? 1;

    this.state.lastCrashPoint = crashPoint;
    this.history.unshift(crashPoint);
    this.history = this.history.slice(0, 60);

    this.broadcast({
      type: "round_crash",
      roundId,
      crashPoint
    });

    this.broadcast({
      type: "round_history",
      history: this.history
    });

    // settle losing bets
    for (const bet of this.bets.values()) {
      if (!bet.cashedOut) {
        await settleBet({
          betId: bet.id,
          result: "lost",
          cashoutMultiplier: null
        });
      }
    }

    if (roundId && this.state.serverSeed) {
      await finishRound({
        id: roundId,
        endTime: new Date(),
        serverSeedReveal: this.state.serverSeed
      });

      this.broadcast({
        type: "server_seed_reveal",
        roundId,
        seed: this.state.serverSeed
      });
    }

    this.state.status = "waiting";
  }

  private computeCrashPoint(serverSeed: string, clientSeed: string, nonce: number) {
    const hmac = crypto
      .createHmac("sha256", serverSeed)
      .update(`${clientSeed}:${nonce}`)
      .digest("hex");

    const max = BigInt("0x" + hmac.slice(0, 13));
    const numerator = BigInt(100) * (BigInt(2) ** BigInt(52));
    const crash = Number(numerator / (max + BigInt(1))) / 100;
    const rounded = Math.max(1, Math.min(100, Number(crash.toFixed(2))));
    return rounded;
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
