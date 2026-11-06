import { WAVES } from "./config";

type WaveDef = (typeof WAVES.waves)[number];
type SpawnDef = { type: string; side: string; delay: number };

export interface DirectorHost {
  spawnMinion(type: string, side: string, lock: number[]): void;
  aliveEnemies(): number;
  spawnBoss(): void;
  emit(event: string, data?: unknown): void;
}

/** Stage flow (PRD §5.2): explore → wave lock → clear → … → boss arena. */
export class Director {
  phase: "explore" | "wave" | "boss" = "explore";
  nextWave = 0;
  current: WaveDef | null = null;
  lock: number[] | null = null;
  leftLimit = 0;
  checkpoint: { kind: "start" | "wave" | "boss"; index: number } = { kind: "start", index: 0 };
  private pending: (SpawnDef & { at: number })[] = [];
  private t = 0;

  constructor(private host: DirectorHost) {}

  get bounds() {
    return this.lock ? { left: this.lock[0], right: this.lock[1] } : { left: this.leftLimit, right: WAVES.levelWidth };
  }

  get totalWaves() {
    return WAVES.waves.length;
  }

  get pendingCount() {
    return this.pending.length;
  }

  update(playerX: number) {
    this.t++;
    if (this.phase === "wave" && this.lock) {
      while (this.pending.length && this.pending[0].at <= this.t) {
        const s = this.pending.shift()!;
        this.host.spawnMinion(s.type, s.side, this.lock);
      }
      if (!this.pending.length && this.host.aliveEnemies() === 0) this.clearWave();
    } else if (this.phase === "explore") {
      if (this.nextWave < WAVES.waves.length) {
        if (playerX >= WAVES.waves[this.nextWave].trigger) this.startWave(this.nextWave);
      } else if (playerX >= WAVES.boss.trigger) {
        this.startBoss();
      }
    }
  }

  /** Extra spawns during a wave or the boss fight (Boss P2 援军). */
  queue(spawns: SpawnDef[], lock: number[]) {
    for (const s of spawns) this.host.spawnMinion(s.type, s.side, lock);
  }

  startWave(i: number) {
    const w = WAVES.waves[i];
    this.current = w;
    this.lock = w.lock;
    this.phase = "wave";
    this.t = 0;
    this.pending = [...w.spawns].sort((a, b) => a.delay - b.delay).map((s) => ({ ...s, at: s.delay + 20 }));
    this.checkpoint = { kind: "wave", index: i };
    this.host.emit("wave", { label: w.label, index: i + 1, total: WAVES.waves.length });
  }

  private clearWave() {
    const idx = WAVES.waves.indexOf(this.current!);
    this.leftLimit = this.lock![0];
    this.lock = null;
    this.current = null;
    this.phase = "explore";
    this.nextWave = idx + 1;
    this.host.emit("waveClear", { index: idx + 1, last: this.nextWave >= WAVES.waves.length });
  }

  startBoss() {
    this.phase = "boss";
    this.lock = WAVES.boss.lock;
    this.checkpoint = { kind: "boss", index: 0 };
    this.host.spawnBoss();
  }

  /** Reset to the last checkpoint; returns the player's respawn x. */
  restart(): number {
    this.pending = [];
    if (this.checkpoint.kind === "wave") {
      this.startWave(this.checkpoint.index);
      return this.lock![0] + 150;
    }
    if (this.checkpoint.kind === "boss") {
      this.startBoss();
      return this.lock![0] + 160;
    }
    this.phase = "explore";
    return WAVES.playerStartX;
  }
}
