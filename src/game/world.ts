import type Phaser from "phaser";
import type { Actor } from "./actor";
import type { AudioBus } from "./audio";
import type { Boss } from "./boss";
import type { Combat, Feel } from "./combat";
import type { Mic } from "./enemies";
import type { Fx } from "./fx";
import type { Input } from "./input";
import type { Player } from "./player";
import type { Breakable, Item } from "./props";

/** What actors and systems can see of the running stage. */
export interface World {
  stage: Phaser.Scene;
  fx: Fx;
  feel: Feel;
  audio: AudioBus;
  controls: Input;
  combat: Combat;
  player: Player;
  enemies: Actor[];
  boss: Boss | null;
  mics: Mic[];
  props: Breakable[];
  bounds: { left: number; right: number };
  tick: number;
  debug: boolean;
  emit(event: string, data?: unknown): void;
  spawnMic(owner: Actor): void;
  spawnPickup(item: Item, x: number): void;
  claimThrow(): boolean;
  attackersCount(): number;
  onEnemyKilled(a: Actor): void;
  onPlayerKO(): void;
  onBossKO(): void;
}
