import balanceJson from "../config/balance.json";
import wavesJson from "../config/waves.json";
import bossJson from "../config/boss.json";

/** One hit inside an attack. box = [forward offset, height of centre above feet, w, h]. */
export interface HitDef {
  from: number;
  to: number;
  dmg: number;
  hitstop: number;
  hitstun: number;
  kb: number;
  kbUp?: number;
  knock: number;
  box: number[];
  shake?: number;
  energy?: number;
  finisher?: boolean;
  breaksArmor?: boolean;
}

export interface AttackDef {
  anim: string;
  steps: number[][]; // [frameIndex, ticks]
  hits: HitDef[];
  move: number[][]; // [fromTick, toTick, forwardSpeed]
  cancelFrom: number;
  cancelInto: string[];
  invuln?: boolean;
  cost?: number;
}

export const BAL = balanceJson as typeof balanceJson & {
  attacks: Record<string, AttackDef>;
};
export const WAVES = wavesJson;
export const BOSS = bossJson;

export const TICK_MS = 1000 / 60;
export const GROUND_Y = BAL.world.groundY;
export const VIEW_W = 960;
export const VIEW_H = 540;

export type Team = "player" | "enemy";
