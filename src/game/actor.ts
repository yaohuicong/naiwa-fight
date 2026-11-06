import Phaser from "phaser";
import { ANIMS, AnimDef, meta, render, scaleFor, whiteTex } from "./anims";
import { AttackDef, BAL, GROUND_Y, HitDef, Team } from "./config";
import type { World } from "./world";

export interface Box {
  x: number; // left
  y: number; // top
  w: number;
  h: number;
}

export interface ActiveAttack {
  key: string;
  def: AttackDef;
  t: number;
  hitIds: Set<string>;
}

let nextId = 1;

/** Frame index for an attack timeline at tick t, or -1 once finished. */
export function stepFrame(steps: number[][], t: number): number {
  let acc = 0;
  for (const [f, d] of steps) {
    acc += d;
    if (t < acc) return f;
  }
  return -1;
}

export function stepsLength(steps: number[][]): number {
  return steps.reduce((s, [, d]) => s + d, 0);
}

export function overlap(a: Box, b: Box) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export abstract class Actor {
  readonly id = nextId++;
  abstract readonly team: Team;
  abstract readonly kind: string;
  x = 0;
  y = GROUND_Y;
  vx = 0;
  vy = 0;
  kbVx = 0; // knockback (decays on the ground → readable curve, never a teleport)
  extVx = 0; // external pull (black hole)
  pulled = false;
  facing: 1 | -1 = 1;
  hp = 1;
  maxHp = 1;
  hurtW = 50;
  hurtH = 130;
  /** <1 plays looping/one-shot anims faster (boss phase 3 dance). */
  animDurScale = 1;
  state = "idle";
  stateT = 0;
  invuln = 0;
  armor = false;
  flash = 0;
  vibrate = 0;
  dead = false;
  removeMe = false;
  knockAcc = 0;
  knockThreshold = 100;
  knockDecay = 60;
  hitstun = 0;
  bob = 0;
  alpha = 1;
  attack?: ActiveAttack;

  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  animKey = "";
  anim?: AnimDef;
  animIdx = 0;
  animT = 0;
  animDone = false;
  private texKey = "";
  private shownKey = "";
  private curFrame = 0;
  private flashing = false;

  constructor(protected world: World, x: number, depth: number) {
    const scene = world.stage;
    this.x = x;
    this.shadow = scene.add.ellipse(x, GROUND_Y, 60, 12, 0x000000, 0.45).setDepth(6);
    this.sprite = scene.add.sprite(x, GROUND_Y, "nc_idle", 0).setDepth(depth);
  }

  get onGround() {
    return this.y >= GROUND_Y - 0.5;
  }

  get height() {
    return GROUND_Y - this.y;
  }

  setState(s: string) {
    this.state = s;
    this.stateT = 0;
  }

  play(key: string, restart = false) {
    if (!restart && this.animKey === key) return;
    const a = ANIMS[key];
    if (!a) throw new Error(`anim ${key} missing`);
    this.animKey = key;
    this.anim = a;
    this.animIdx = 0;
    this.animT = 0;
    this.animDone = false;
    this.showFrame(a.tex, a.frames[0]);
  }

  /** Drive the sprite straight from an attack timeline frame. */
  showFrame(tex: string, frame: number) {
    this.curFrame = frame;
    const key = this.flashing ? whiteTex(this.world.stage, tex) : tex;
    if (tex !== this.texKey) {
      const m = meta(tex);
      this.texKey = tex;
      this.sprite.setTexture(key, frame);
      this.sprite.setOrigin(0.5, m.originY);
      this.sprite.setScale(scaleFor(tex));
    } else if (key !== this.shownKey) {
      this.sprite.setTexture(key, frame);
    } else {
      this.sprite.setFrame(frame);
    }
    this.shownKey = key;
  }

  stepAnim() {
    const a = this.anim;
    if (!a || this.attack) return;
    this.animT++;
    const dur = a.dur * this.animDurScale;
    if (this.animT >= dur) {
      this.animT -= dur;
      if (this.animIdx < a.frames.length - 1) this.animIdx++;
      else if (a.loop) this.animIdx = 0;
      else this.animDone = true;
      this.showFrame(a.tex, a.frames[this.animIdx]);
    }
  }

  /** Frame of the current looping/non-looping anim (index into its frames list). */
  get animFrame() {
    return this.anim ? this.anim.frames[this.animIdx] : 0;
  }

  startAttack(key: string, def: AttackDef) {
    this.attack = { key, def, t: 0, hitIds: new Set() };
    this.animKey = "";
    const f = stepFrame(def.steps, 0);
    this.showFrame(ANIMS[def.anim]?.tex ?? def.anim, f);
  }

  /** Advance the attack timeline; returns false when it has finished. */
  stepAttack(): boolean {
    const atk = this.attack;
    if (!atk) return false;
    atk.t++;
    const f = stepFrame(atk.def.steps, atk.t);
    if (f < 0) {
      this.attack = undefined;
      return false;
    }
    this.showFrame(ANIMS[atk.def.anim]?.tex ?? atk.def.anim, f);
    for (const [from, to, speed] of atk.def.move) {
      if (atk.t >= from && atk.t < to) this.x += (this.facing * speed) / 60;
    }
    return true;
  }

  activeHits(): { hit: HitDef; index: number }[] {
    const atk = this.attack;
    if (!atk) return [];
    const out: { hit: HitDef; index: number }[] = [];
    atk.def.hits.forEach((hit, index) => {
      if (atk.t >= hit.from && atk.t < hit.to) out.push({ hit, index });
    });
    return out;
  }

  hitbox(h: HitDef): Box {
    const [fx, fy, w, hh] = h.box;
    const cx = this.x + this.facing * fx;
    const cy = this.y - fy;
    return { x: cx - w / 2, y: cy - hh / 2, w, h: hh };
  }

  hurtbox(): Box {
    return { x: this.x - this.hurtW / 2, y: this.y - this.hurtH, w: this.hurtW, h: this.hurtH };
  }

  canBeHit() {
    return !this.dead && this.invuln <= 0 && this.alpha > 0;
  }

  /** Common physics: gravity, knockback curve, external pull, bounds. */
  physics() {
    const dt = 1 / 60;
    if (!this.onGround || this.vy < 0) {
      this.vy += BAL.world.gravity * dt;
    }
    this.x += (this.vx + this.kbVx + this.extVx) * dt;
    this.y += this.vy * dt;
    if (this.y >= GROUND_Y) {
      this.y = GROUND_Y;
      if (this.vy > 0) this.vy = 0;
    }
    if (this.onGround) this.kbVx *= BAL.feel.groundFriction;
    if (Math.abs(this.kbVx) < 2) this.kbVx = 0;
    if (!this.pulled) this.extVx *= 0.9;
    this.pulled = false;
    if (Math.abs(this.extVx) < 1) this.extVx = 0;
    if (this.knockAcc > 0) this.knockAcc = Math.max(0, this.knockAcc - this.knockDecay / 60);
    const b = this.world.bounds;
    const margin = this.team === "player" ? 24 : 0;
    if (this.team === "player" || (this.state !== "enter" && this.state !== "intro")) {
      this.x = Phaser.Math.Clamp(this.x, b.left + margin, b.right - margin);
    }
  }

  faceToward(x: number) {
    if (Math.abs(x - this.x) > 2) this.facing = x > this.x ? 1 : -1;
  }

  /** Base reaction to a hit. Subclasses decide states; returns true if it caused hitstun. */
  abstract takeHit(h: HitDef, from: Actor | null, dir: number): void;

  /** Damage without reaction (chip): hacker code, black-hole core. */
  chip(dmg: number) {
    if (this.dead || this.invuln > 0) return;
    this.hp = Math.max(0, this.hp - dmg);
    this.flash = 3;
    this.world.fx.damageNumber(this.x, this.y - this.hurtH - 8, dmg, this.team);
    if (this.hp <= 0) this.die(this.facing * -1);
  }

  abstract die(dir: number): void;
  abstract update(): void;

  sync() {
    const s = this.sprite;
    const shakeX = this.vibrate > 0 ? (this.vibrate % 2 === 0 ? 2 : -2) : 0;
    s.x = this.x + shakeX;
    s.y = this.y + this.bob;
    s.setFlipX(this.facing < 0);
    if (render.canvas) {
      const want = this.flash > 0;
      if (want !== this.flashing) {
        this.flashing = want;
        this.showFrame(this.texKey, this.curFrame);
      }
    } else if (this.flash > 0) s.setTintFill(0xffffff);
    else s.clearTint();
    const blink = this.invuln > 0 && !this.dead && this.state !== "down" && this.state !== "lie" && Math.floor(this.invuln / 3) % 2 === 0;
    s.setAlpha(this.alpha * (blink ? 0.55 : 1));
    const h = this.height;
    const k = Phaser.Math.Clamp(1 - h / 260, 0.35, 1);
    this.shadow.setPosition(this.x, GROUND_Y + 2);
    this.shadow.setSize(this.hurtW * 1.5 * k, 12 * k);
    this.shadow.setAlpha(0.45 * k * this.alpha);
  }

  tickTimers() {
    if (this.flash > 0) this.flash--;
    if (this.invuln > 0) this.invuln--;
  }

  destroy() {
    this.sprite.destroy();
    this.shadow.destroy();
  }
}
