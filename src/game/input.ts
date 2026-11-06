import Phaser from "phaser";
import { BAL } from "./config";

export type Action = "left" | "right" | "jump" | "light" | "heavy" | "special" | "dodge" | "taunt" | "run" | "pause" | "confirm" | "debug";

const KEYMAP: Record<string, Action> = {
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  KeyW: "jump",
  Space: "jump",
  KeyK: "jump",
  ArrowUp: "jump",
  KeyJ: "light",
  KeyI: "heavy",
  KeyU: "heavy",
  KeyL: "special",
  KeyO: "special",
  KeyS: "dodge",
  ArrowDown: "dodge",
  Semicolon: "taunt",
  ShiftLeft: "run",
  ShiftRight: "run",
  Escape: "pause",
  KeyP: "pause",
  Enter: "confirm",
  NumpadEnter: "confirm",
  F1: "debug",
  Backquote: "debug",
};

/** Standard-mapping gamepad: A 跳 · X 轻击 · Y 重击 · B 大招 · LB 翻滚 · RB/RT 跑 · LT 狂笑 · Start/Back 暂停 · 左摇杆/十字键 移动. */
const PAD: [number, Action[]][] = [
  [0, ["jump", "confirm"]],
  [2, ["light"]],
  [3, ["heavy"]],
  [1, ["special"]],
  [5, ["run"]],
  [7, ["run"]],
  [4, ["dodge"]],
  [6, ["taunt"]],
  [9, ["pause"]],
  [8, ["pause"]],
];

function activePad(): Gamepad | undefined {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) if (p && p.connected) return p;
  return undefined;
}

/** Any gamepad button newly pressed since the last call with the same `state` (title / credits screens). */
export function padAnyPressed(state: { held: boolean }) {
  const p = activePad();
  const down = !!p && p.buttons.some((b) => b.pressed);
  const edge = down && !state.held;
  state.held = down;
  return edge;
}

/** Keyboard + gamepad with held state + a short press buffer (PRD §6.3: 6–10 帧). */
export class Input {
  private held = new Set<Action>();
  private buffer: { action: Action; ticks: number }[] = [];
  private lastTap: Partial<Record<Action, number>> = {};
  private tick = 0;
  runLatch = false; // set by double-tap, cleared on release
  readonly presses: Action[] = [];

  constructor(scene: Phaser.Scene) {
    const kb = scene.input.keyboard!;
    kb.addCapture("SPACE,UP,DOWN,LEFT,RIGHT,F1");
    const down = (e: KeyboardEvent) => {
      const a = KEYMAP[e.code];
      if (!a || e.repeat) return;
      this.press(a);
    };
    const up = (e: KeyboardEvent) => {
      const a = KEYMAP[e.code];
      if (a) this.release(a);
    };
    kb.on("keydown", down);
    kb.on("keyup", up);
    const blur = () => {
      this.held.clear();
      this.runLatch = false;
    };
    window.addEventListener("blur", blur);
    scene.events.once("shutdown", () => {
      kb.off("keydown", down);
      kb.off("keyup", up);
      window.removeEventListener("blur", blur);
    });
  }

  private press(a: Action) {
    if ((a === "left" || a === "right") && !this.held.has(a)) {
      const last = this.lastTap[a];
      if (last !== undefined && this.tick - last <= BAL.player.doubleTapTicks) this.runLatch = true;
      this.lastTap[a] = this.tick;
    }
    this.held.add(a);
    this.buffer.push({ action: a, ticks: BAL.feel.inputBufferTicks });
    this.presses.push(a);
  }

  private release(a: Action) {
    this.held.delete(a);
    if ((a === "left" || a === "right") && !this.held.has("left") && !this.held.has("right")) this.runLatch = false;
  }

  private padHeld = new Set<Action>();

  /** Read the first connected gamepad and turn button edges into presses. Call once per frame. */
  pollPad() {
    const p = activePad();
    const now = new Set<Action>();
    if (p) {
      const b = (i: number) => !!p.buttons[i]?.pressed;
      for (const [i, acts] of PAD) if (b(i)) acts.forEach((a) => now.add(a));
      const ax = p.axes[0] ?? 0;
      if (b(14) || ax < -0.45) now.add("left");
      if (b(15) || ax > 0.45) now.add("right");
      if (Math.abs(ax) > 0.92) now.add("run"); // 摇杆推到底 = 跑
    }
    for (const a of now) if (!this.padHeld.has(a)) this.press(a);
    for (const a of this.padHeld) if (!now.has(a)) this.release(a);
    this.padHeld = now;
  }

  isDown(a: Action) {
    return this.held.has(a);
  }

  /** Horizontal intent: -1, 0, 1 */
  axis(): number {
    return (this.held.has("right") ? 1 : 0) - (this.held.has("left") ? 1 : 0);
  }

  wantsRun() {
    return this.held.has("run") || this.runLatch;
  }

  /** Consume a buffered press if present. */
  take(a: Action): boolean {
    const i = this.buffer.findIndex((b) => b.action === a);
    if (i < 0) return false;
    this.buffer.splice(i, 1);
    return true;
  }

  peek(a: Action): boolean {
    return this.buffer.some((b) => b.action === a);
  }

  /** Age the buffer — call once per simulated tick (not during hitstop, so presses survive it). */
  step() {
    this.tick++;
    for (const b of this.buffer) b.ticks--;
    this.buffer = this.buffer.filter((b) => b.ticks > 0);
  }

  /** UI-level presses since last frame (pause, confirm…), independent of the sim. */
  drainPresses(): Action[] {
    const p = this.presses.splice(0);
    return p;
  }

  clearBuffer() {
    this.buffer = [];
  }
}
