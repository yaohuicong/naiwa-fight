import Phaser from "phaser";
import type { Box } from "./actor";
import { WORLD_SCALE } from "./assets";
import { BAL, GROUND_Y } from "./config";
import type { World } from "./world";

/** Pickup kinds, matching the frames of 「道具-掉落物-3种」. */
export const enum Item {
  SmallTea = 0,
  BigTea = 1,
  Energy = 2,
}

let nextId = 1;

/**
 * Breakable trash can / cardboard box (「道具-可破坏物-2种」: row 0 can, row 1 box; frames intact → cracked → broken).
 * Light hits crack it, the second hit (or any heavy hit) breaks it and drops `drop`.
 */
export class Breakable {
  readonly id = `prop${nextId++}`;
  private sprite: Phaser.GameObjects.Sprite;
  private hp = 2;
  broken = false;
  private fadeT = 0;
  private shakeT = 0;

  constructor(private world: World, public x: number, private kind: 0 | 1, private drop: Item | null) {
    this.sprite = world.stage.add
      .sprite(x, GROUND_Y + 2, "st_breakables", kind * 3)
      .setOrigin(0.5, 188 / 220)
      .setScale(WORLD_SCALE)
      .setDepth(9);
  }

  hurtbox(): Box {
    return { x: this.x - 24, y: GROUND_Y - 56, w: 48, h: 56 };
  }

  /** Returns true if this hit landed. */
  hit(heavy: boolean, dir: number) {
    if (this.broken) return false;
    this.hp -= heavy ? 2 : 1;
    this.shakeT = 8;
    const w = this.world;
    if (this.hp > 0) {
      this.sprite.setFrame(this.kind * 3 + 1);
      w.audio.sfx("sfx_hit_light", 0.35);
      return true;
    }
    this.broken = true;
    this.sprite.setFrame(this.kind * 3 + 2).setDepth(5);
    w.audio.sfx("sfx_break", 0.7);
    w.fx.dust(this.x, true);
    w.feel.shake(1.5);
    if (this.drop !== null) w.spawnPickup(this.drop, this.x + dir * 18);
    return true;
  }

  update() {
    if (this.shakeT > 0) {
      this.shakeT--;
      this.sprite.x = this.x + (this.shakeT % 2 ? 2 : -2);
    } else this.sprite.x = this.x;
    // 碎片留 4 秒后淡出
    if (this.broken && ++this.fadeT > 240) this.sprite.setAlpha(Math.max(0, 1 - (this.fadeT - 240) / 40));
  }

  get gone() {
    return this.broken && this.fadeT > 280;
  }

  destroy() {
    this.sprite.destroy();
  }
}

/** Ground pickup: bobs gently and glows; collected by walking over it. */
export class Pickup {
  private sprite: Phaser.GameObjects.Sprite;
  private shadow: Phaser.GameObjects.Ellipse;
  private t = 0;
  private vy = -160;
  private y = GROUND_Y - 4;
  taken = false;

  constructor(private world: World, public x: number, readonly item: Item) {
    const s = world.stage;
    this.shadow = s.add.ellipse(x, GROUND_Y + 2, 30, 7, 0x000000, 0.4).setDepth(6);
    this.sprite = s.add.sprite(x, this.y, "st_pickups", item).setOrigin(0.5, 104 / 120).setScale(WORLD_SCALE).setDepth(9.5);
  }

  update() {
    this.t++;
    // 掉出来时先弹一下再落地，之后上下轻轻浮动
    if (this.vy !== 0) {
      this.vy += BAL.world.gravity / 60;
      this.y += this.vy / 60;
      if (this.y >= GROUND_Y - 4) {
        this.y = GROUND_Y - 4;
        this.vy = 0;
      }
    }
    const bob = this.vy === 0 ? Math.sin(this.t * 0.08) * 3 - 3 : 0;
    this.sprite.setPosition(this.x, this.y + bob);
    this.sprite.setAlpha(0.85 + Math.sin(this.t * 0.2) * 0.15);
    const p = this.world.player;
    if (this.vy === 0 && this.t > 20 && !p.dead && Math.abs(p.x - this.x) < 34 && p.height < 40 && this.useful()) this.collect();
  }

  /** 满血不吃奶茶、能量满不吃奶瓶，留着打 Boss 时再回来拿。 */
  private useful() {
    const p = this.world.player;
    return this.item === Item.Energy ? p.energy < BAL.player.energyMax : p.hp < p.maxHp;
  }

  private collect() {
    const w = this.world;
    const p = w.player;
    const P = BAL.pickups;
    this.taken = true;
    w.audio.sfx("sfx_pickup", 0.7, 0);
    if (this.item === Item.Energy) {
      p.energy = Math.min(BAL.player.energyMax, p.energy + P.energy);
      w.fx.popText(this.x, GROUND_Y - 70, `能量 +${P.energy}`, "#7df3ff", 14);
    } else {
      const heal = this.item === Item.BigTea ? P.bigTea : P.smallTea;
      const before = p.hp;
      p.hp = Math.min(p.maxHp, p.hp + heal);
      w.fx.popText(this.x, GROUND_Y - 70, `气血 +${p.hp - before}`, "#8dff9a", 14);
    }
  }

  destroy() {
    this.sprite.destroy();
    this.shadow.destroy();
  }
}
