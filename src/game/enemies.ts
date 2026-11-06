import Phaser from "phaser";
import { Actor, Box } from "./actor";
import { meta, scaleFor } from "./anims";
import { AttackDef, BAL, GROUND_Y, HitDef } from "./config";
import type { World } from "./world";

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Shared minion behaviour: walk-in, hurt, launch, death + fade. */
export abstract class Minion extends Actor {
  readonly team = "enemy" as const;
  protected cooldown = 0;
  private deathT = 0;
  abstract readonly anims: { idle: string; walk: string; hurt: string; death: string; launch?: string };

  constructor(world: World, x: number, protected enterTarget: number) {
    super(world, x, 10);
    this.state = "enter";
  }

  protected walkBob(moving: boolean) {
    // Placeholder walk cycles reuse idle frames — a small hop sells the motion.
    this.bob = moving && this.anim?.placeholder ? -Math.abs(Math.sin(this.stateT * 0.32)) * 4 : 0;
  }

  update() {
    this.stateT++;
    this.tickTimers();
    if (this.cooldown > 0) this.cooldown--;
    switch (this.state) {
      case "enter": {
        const dir = Math.sign(this.enterTarget - this.x) || 1;
        this.facing = dir as 1 | -1;
        this.vx = dir * this.walkSpeed;
        this.play(this.anims.walk);
        this.walkBob(true);
        if (Math.abs(this.enterTarget - this.x) < 6) {
          this.vx = 0;
          this.setState("move");
        }
        break;
      }
      case "hurt":
        this.vx = 0;
        this.bob = 0;
        if (--this.hitstun <= 0) this.setState("move");
        break;
      case "air":
        this.vx = 0;
        if (this.onGround && this.vy >= 0 && this.stateT > 4) {
          this.hitstun = 16;
          this.setState("hurt");
          this.play(this.anims.hurt, true);
        }
        break;
      case "dead":
        this.vx = 0;
        if (this.onGround && this.animDone) {
          this.deathT++;
          if (this.deathT > 30) this.alpha = Math.floor(this.deathT / 3) % 2 ? 0.25 : 0.9;
          if (this.deathT > 52) {
            this.removeMe = true;
            this.world.fx.poof(this.x, this.y - this.hurtH * 0.45);
          }
        }
        break;
      default:
        this.think();
    }
    this.stepAnim();
    this.physics();
  }

  abstract get walkSpeed(): number;
  protected abstract think(): void;

  takeHit(h: HitDef, _from: Actor | null, dir: number) {
    if (this.dead) return;
    this.hp = Math.max(0, this.hp - h.dmg);
    this.flash = BAL.feel.hitFlashTicks;
    this.vibrate = h.hitstop;
    this.attack = undefined;
    this.bob = 0;
    if (this.hp <= 0) return this.die(dir, h);
    this.facing = dir > 0 ? -1 : 1;
    this.knockAcc += h.knock;
    if (this.knockAcc >= this.knockThreshold || (h.kbUp ?? 0) > 0) {
      this.knockAcc = 0;
      this.kbVx = h.kb * dir * 0.9;
      this.vy = -Math.max(h.kbUp ?? 0, 220);
      this.setState("air");
      this.play(this.anims.launch ?? this.anims.hurt, true);
      return;
    }
    this.kbVx = h.kb * dir;
    this.hitstun = h.hitstun;
    this.setState("hurt");
    this.play(this.anims.hurt, true);
  }

  die(dir: number, h?: HitDef) {
    if (this.dead) return;
    this.dead = true;
    this.attack = undefined;
    this.bob = 0;
    this.kbVx = (h ? Math.max(h.kb, 200) : 200) * dir;
    this.vy = -Math.max(h?.kbUp ?? 0, 240);
    this.setState("dead");
    this.play(this.anims.death, true);
    this.world.audio.sfx("sfx_enemy_down", 0.55);
    this.world.onEnemyKilled(this);
  }
}

/** 豆奶 — ranged: keeps 220–360px away and throws a mic every ~1.6s (PRD §4.3). */
export class Dounai extends Minion {
  readonly kind = "dounai";
  readonly anims = { idle: "dn_idle", walk: "dn_walk", hurt: "dn_hurt", death: "dn_death" };
  private static throwDef: AttackDef = {
    anim: "dn_throw",
    steps: [[0, 8], [1, 10], [2, 10], [7, 12]],
    hits: [],
    move: [],
    cancelFrom: 999,
    cancelInto: [],
  };
  private released = false;

  constructor(world: World, x: number, enterTarget: number) {
    super(world, x, enterTarget);
    const c = BAL.dounai;
    this.hp = this.maxHp = c.maxHp;
    this.hurtW = c.hurtbox.w;
    this.hurtH = c.hurtbox.h;
    this.knockThreshold = c.knockdownThreshold;
    this.cooldown = rand(40, 90);
    this.play("dn_walk");
  }

  get walkSpeed() {
    return BAL.dounai.walk;
  }

  protected think() {
    const c = BAL.dounai;
    const p = this.world.player;
    if (this.state === "throw") {
      this.vx = 0;
      if (!this.released && this.attack && this.attack.t >= 18) {
        this.released = true;
        this.world.spawnMic(this);
        this.world.audio.sfx("sfx_mic", 0.3);
      }
      if (!this.stepAttack()) {
        this.cooldown = c.throwEvery + rand(-15, 30);
        this.setState("move");
        this.play("dn_idle", true);
      }
      return;
    }
    // move
    const dx = p.x - this.x;
    const ad = Math.abs(dx);
    this.faceToward(p.x);
    let want = 0;
    if (!p.dead) {
      if (ad < c.rangeMin) want = -Math.sign(dx);
      else if (ad > c.rangeMax) want = Math.sign(dx);
    }
    const b = this.world.bounds;
    if ((want < 0 && this.x < b.left + 40) || (want > 0 && this.x > b.right - 40)) want = 0;
    this.vx = want * c.walk;
    this.play(want ? "dn_walk" : "dn_idle");
    this.walkBob(want !== 0);
    if (!p.dead && this.cooldown <= 0 && ad < c.rangeMax * 1.25 && ad > 90 && this.world.claimThrow()) {
      this.vx = 0;
      this.bob = 0;
      this.released = false;
      this.setState("throw");
      this.startAttack("throw", Dounai.throwDef);
    }
  }
}

/** 精锐近战（叉腰奶兵）— chases within 400px, ~0.35s wind-up punch (PRD §4.4). */
export class Melee extends Minion {
  readonly kind = "melee";
  readonly anims = { idle: "ml_idle", walk: "ml_walk", hurt: "ml_hurt", death: "ml_death", launch: "ml_launch" };
  private armorShown = false;
  static attackDef(): AttackDef {
    const a = BAL.melee.attack;
    return {
      anim: "ml_attack",
      steps: a.steps,
      hits: [{ from: a.from, to: a.to, dmg: a.dmg, hitstop: a.hitstop, hitstun: a.hitstun, kb: a.kb, knock: a.knock, box: a.box, shake: 1.5 }],
      move: [a.lunge],
      cancelFrom: 999,
      cancelInto: [],
    };
  }

  constructor(world: World, x: number, enterTarget: number) {
    super(world, x, enterTarget);
    const c = BAL.melee;
    this.hp = this.maxHp = c.maxHp;
    this.hurtW = c.hurtbox.w;
    this.hurtH = c.hurtbox.h;
    this.knockThreshold = c.knockdownThreshold;
    this.cooldown = rand(20, 50);
    this.play("ml_walk");
  }

  get walkSpeed() {
    return BAL.melee.walk;
  }

  get isAttacking() {
    return this.state === "attack";
  }

  /** 精锐：出拳蓄力（判定出来之前）硬吃轻击不被打断；重击、冲刺、三段收尾、大招照样打断。 */
  override takeHit(h: HitDef, from: Actor | null, dir: number) {
    const a = this.attack;
    const heavy = (h.hitstop ?? 0) >= 6 || !!h.finisher || !!h.breaksArmor;
    if (BAL.melee.armorWindup && !this.dead && this.state === "attack" && a && a.t < BAL.melee.attack.from && !heavy) {
      this.hp = Math.max(0, this.hp - h.dmg);
      this.flash = BAL.feel.hitFlashTicks;
      this.vibrate = h.hitstop;
      if (this.hp <= 0) return this.die(dir, h);
      if (!this.armorShown) {
        this.armorShown = true;
        this.world.fx.popText(this.x, this.y - this.hurtH - 14, "硬抗！", "#ffb347", 13);
      }
      return;
    }
    super.takeHit(h, from, dir);
  }

  protected think() {
    const c = BAL.melee;
    const p = this.world.player;
    if (this.state === "attack") {
      this.vx = 0;
      if (!this.stepAttack()) {
        this.cooldown = c.cooldown + rand(0, 40);
        this.setState("move");
        this.play("ml_idle", true);
      }
      return;
    }
    const dx = p.x - this.x;
    const ad = Math.abs(dx);
    this.faceToward(p.x);
    let speed = 0;
    if (!p.dead) {
      if (ad > c.chaseRadius) speed = c.walk * 0.45;
      else if (ad > c.attackRange) speed = c.walk;
      else if (ad < 46) speed = -c.walk * 0.6;
    }
    this.vx = Math.sign(dx) * speed;
    this.play(speed !== 0 ? "ml_walk" : "ml_idle");
    this.walkBob(speed !== 0);
    if (!p.dead && ad <= c.attackRange + 6 && this.cooldown <= 0 && p.onGround && this.world.attackersCount() < c.maxAttackers) {
      this.vx = 0;
      this.bob = 0;
      this.setState("attack");
      this.armorShown = false;
      this.startAttack("punch", Melee.attackDef());
    }
  }
}

/** 麦克风投射物 — 4-frame spin, destroyed off-screen or when hit by an attack. */
export class Mic {
  sprite: Phaser.GameObjects.Sprite;
  /** Ground shadow so the player can read the flight height and time the jump. */
  private shadow: Phaser.GameObjects.Ellipse;
  alive = true;
  t = 0;
  readonly hit: HitDef;
  private y0: number;

  constructor(private world: World, public x: number, public y: number, public vx: number) {
    const c = BAL.dounai.throw;
    this.hit = { from: 0, to: 0, dmg: c.dmg, hitstop: c.hitstop, hitstun: c.hitstun, kb: c.kb, knock: c.knock, box: [0, 0, 0, 0], shake: 1 };
    const m = meta("dn_mic");
    this.sprite = world.stage.add
      .sprite(x, y, "dn_mic", 0)
      .setOrigin(0.5, (m.originY * m.frameHeight - m.refHeight / 2) / m.frameHeight)
      .setScale(scaleFor("dn_mic"))
      .setDepth(14)
      .setFlipX(vx < 0);
    this.y0 = y;
    this.shadow = world.stage.add.ellipse(x, GROUND_Y + 2, 26, 7, 0x000000, 0.4).setDepth(6);
  }

  box(): Box {
    return { x: this.x - 15, y: this.y - 15, w: 30, h: 30 };
  }

  update() {
    this.t++;
    this.x += this.vx / 60;
    // 出手在手的高度，12 tick 内落到飞行高度（膝盖到腰），跳起来就能躲开
    const c = BAL.dounai.throw;
    const k = Math.min(1, this.t / c.dropTicks);
    this.y = this.y0 + (GROUND_Y - c.height - this.y0) * k * (2 - k);
    this.sprite.setFrame(Math.floor(this.t / 4) % 4);
    const cam = this.world.stage.cameras.main.worldView;
    if (this.t > 240 || this.x < cam.x - 60 || this.x > cam.right + 60) this.alive = false;
  }

  sync() {
    this.sprite.setPosition(this.x, this.y);
    this.shadow.setPosition(this.x, GROUND_Y + 2);
  }

  destroy() {
    this.sprite.destroy();
    this.shadow.destroy();
  }
}

export const MIC_HEIGHT = () => GROUND_Y - BAL.dounai.throw.height;
