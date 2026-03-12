export type GameState = {
  roundId: string | null;
  status: "waiting" | "betting" | "running" | "crashed";
  multiplier: number;
};

export const initialGameState: GameState = {
  roundId: null,
  status: "waiting",
  multiplier: 1
};
