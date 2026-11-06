import { Actor } from "./actor";
import { AttackDef, BAL, GROUND_Y, HitDef } from "./config";
import type { World } from "./world";

const P = BAL.player;
const ATK = BAL.attacks;

/** 奶察 — state machine per PRD §4.1 / §4.2. */
export class Player extends Actor {
  readonly team = "player" as const;
  readonly kind = "naicha";
  energy = 0;
  combo = 0;
  comboTimer = 0;
  maxCombo = 0;
  damageTaken = 0;
  private airAttackUsed = false;
  private koTimer = 0;
  private landTimer = 0;
  private dodgeCd = 0;
  private dodgeDir: 1 | -1 = 1;

  constructor(world: World, x: number) {
    super(world, x, 12);
    this.hp = this.maxHp = P.maxHp;
    this.hurtW = P.hurtbox.w;
    this.hurtH = P.hurtbox.h;
    this.knockThreshold = P.knockdownThreshold;
    this.knockDecay = P.knockdownDecayPerSec;
    this.play("nc_idle");
  }

  /** 跳起时收腿：受击框底边抬高 airTuck，让跳跃能躲过低飞的麦克风和贴地水波。 */
  override hurtbox() {
    const tuck = this.state === "jump" && this.height > 4 ? P.airTuck : 0;
    return { x: this.x - this.hurtW / 2, y: this.y - this.hurtH, w: this.hurtW, h: this.hurtH - tuck };
  }

  get attackKey() {
    return this.attack?.key ?? "";
  }

  respawn(x: number) {
    this.x = x;
    this.y = GROUND_Y;
    this.vx = this.vy = this.kbVx = this.extVx = 0;
    this.hp = this.maxHp;
    this.dead = false;
    this.attack = undefined;
    this.knockAcc = 0;
    this.facing = 1;
    this.invuln = 90;
    this.koTimer = 0;
    this.setState("idle");
    this.play("nc_idle", true);
  }

  update() {
    const input = this.world.controls;
    this.stateT++;
    this.tickTimers();
    if (this.comboTimer > 0 && --this.comboTimer === 0) this.combo = 0;
    if (this.dodgeCd > 0) this.dodgeCd--;

    switch (this.state) {
      case "idle":
      case "walk":
      case "run":
        this.neutral();
        break;
      case "land":
        this.vx = 0;
        if (--this.landTimer <= 0) this.setState("idle");
        else this.tryActions(true);
        break;
      case "jump":
        this.air();
        break;
      case "dodge":
        this.dodging();
        break;
      case "attack":
        this.attacking();
        break;
      case "hurt":
        this.vx = 0;
        if (--this.hitstun <= 0) {
          this.setState("idle");
          this.play("nc_idle");
        }
        break;
      case "down":
        this.vx = 0;
        if (this.onGround && this.vy >= 0 && this.stateT > 6 && this.animDone) {
          this.setState("lie");
          this.play("nc_lie");
          this.world.fx.dust(this.x, true);
          this.world.audio.sfx("sfx_land", 0.5);
        }
        break;
      case "lie":
        if (this.stateT >= P.lieTicks) {
          this.setState("getup");
          this.play("nc_getup", true);
        }
        break;
      case "getup":
        if (this.animDone) {
          this.invuln = Math.max(this.invuln, 12);
          this.setState("idle");
          this.play("nc_idle");
        }
        break;
      case "taunt":
        this.vx = 0;
        if (this.stateT > 20 && (input.axis() !== 0 || input.peek("light") || input.peek("heavy") || input.peek("jump"))) {
          this.world.audio.stopVo();
          this.setState("idle");
          this.neutral();
        } else if (this.stateT > 200) {
          this.setState("idle");
        }
        break;
      case "ko":
        this.vx = 0;
        if (this.animDone && this.onGround && ++this.koTimer === 70) this.world.onPlayerKO();
        break;
      case "win":
        this.vx = 0;
        break;
    }

    this.stepAnim();
    this.physics();
  }

  private neutral() {
    const input = this.world.controls;
    if (this.tryActions(false)) return;
    const ax = input.axis();
    if (ax !== 0) {
      this.facing = ax as 1 | -1;
      const run = input.wantsRun();
      this.vx = ax * (run ? P.run : P.walk);
      if (run) {
        if (this.state !== "run") this.setState("run");
        this.play("nc_run");
      } else {
        if (this.state !== "walk") this.setState("walk");
        this.play("nc_walk");
      }
    } else {
      this.vx = 0;
      if (this.state !== "idle") this.setState("idle");
      this.play("nc_idle");
    }
  }

  /** Ground actions from neutral/land. Returns true if one started. */
  private tryActions(fromLand: boolean): boolean {
    const input = this.world.controls;
    if (input.take("dodge") && this.startDodge()) return true;
    if (input.take("special") && this.trySpecial()) return true;
    if (input.take("heavy")) return this.begin("H"), true;
    if (input.take("light")) return this.begin(this.state === "run" ? "DASH" : "L1"), true;
    if (!fromLand && input.take("jump")) {
      this.vy = -P.jumpVel;
      this.world.audio.sfx("sfx_jump", 0.45);
      const ax = input.axis();
      this.vx = ax * (input.wantsRun() ? P.run : P.walk);
      if (ax) this.facing = ax as 1 | -1;
      this.airAttackUsed = false;
      this.setState("jump");
      this.play("nc_jump_up", true);
      return true;
    }
    if (input.take("taunt")) {
      this.vx = 0;
      this.setState("taunt");
      this.play("nc_laugh", true);
      this.world.audio.vo("vo_laugh", 0.6);
      return true;
    }
    return false;
  }

  private trySpecial(): boolean {
    const def = ATK.S;
    if (this.energy < (def.cost ?? 100)) {
      this.world.emit("hint", "能量不足");
      return false;
    }
    this.energy -= def.cost ?? 100;
    this.begin("S");
    this.world.feel.superFreeze(BAL.feel.superFreezeTicks);
    this.world.fx.superFlash();
    this.world.audio.vo("vo_skill", 0.85);
    this.world.emit("banner", { text: "奶狗骑乘冲锋！", color: "#ffd84a" });
    return true;
  }

  private begin(key: string) {
    const def = ATK[key] as AttackDef;
    const input = this.world.controls;
    const ax = input.axis();
    if (ax && key !== "AIR") this.facing = ax as 1 | -1;
    this.vx = 0;
    this.setState(key === "AIR" ? "jump" : "attack");
    this.startAttack(key, def);
    if (def.invuln) this.invuln = Math.max(this.invuln, 2);
  }

  private attacking() {
    const input = this.world.controls;
    const atk = this.attack;
    if (!atk) {
      this.setState("idle");
      return;
    }
    if (atk.def.invuln) this.invuln = Math.max(this.invuln, 2);
    // Cancel window: buffered press → next move
    if (atk.t >= atk.def.cancelFrom || atk.t >= 12) {
      // 收招时可以直接翻滚脱身（任何地面招式出招 12 tick 后）
      if (atk.key !== "S" && input.take("dodge") && this.startDodge()) return;
    }
    if (atk.t >= atk.def.cancelFrom) {
      const into = atk.def.cancelInto;
      if (into.includes("S") && input.peek("special") && this.energy >= (ATK.S.cost ?? 100)) {
        input.take("special");
        this.attack = undefined;
        if (this.trySpecial()) return;
      }
      if (into.includes("H") && input.take("heavy")) return this.begin("H");
      const next = into.find((k) => k.startsWith("L"));
      if (next && input.take("light")) return this.begin(next);
    }
    const alive = this.stepAttack();
    this.swingFx();
    if (!alive) {
      this.setState("idle");
      this.play("nc_idle", true);
      this.neutral();
    }
  }

  /** 闪避翻滚：朝按住的方向（没按就朝面向）滚 ~100px，中段无敌，能穿过奶豪的冲撞和水波。 */
  private startDodge(): boolean {
    if (this.dodgeCd > 0 || !this.onGround) return false;
    const ax = this.world.controls.axis();
    if (ax) this.facing = ax as 1 | -1;
    this.dodgeDir = this.facing;
    this.attack = undefined;
    this.vx = 0;
    this.setState("dodge");
    this.play("nc_dodge", true);
    this.world.audio.sfx("sfx_swing", 0.35, 0);
    this.world.fx.dust(this.x);
    return true;
  }

  private dodging() {
    const D = P.dodge;
    const t = this.stateT;
    this.vx = t >= D.move[0] && t <= D.move[1] ? this.dodgeDir * D.speed : 0;
    if (t >= D.invuln[0] && t <= D.invuln[1]) this.invuln = Math.max(this.invuln, 2);
    if (this.animDone) {
      this.dodgeCd = D.cooldown;
      this.setState("idle");
      this.play("nc_idle", true);
      this.neutral();
    }
  }

  private air() {
    const input = this.world.controls;
    const ax = input.axis();
    if (this.attack) {
      this.stepAttack();
      this.swingFx();
    } else {
      if (ax) this.facing = ax as 1 | -1;
      if (!this.airAttackUsed && input.take("light")) {
        this.airAttackUsed = true;
        this.begin("AIR");
      } else if (this.vy > 0 && this.animKey === "nc_jump_up" && this.animDone) {
        this.play("nc_jump_fall");
      } else if (this.vy > 60) {
        this.play("nc_jump_fall");
      }
    }
    const target = ax * (input.wantsRun() ? P.run : P.walk);
    this.vx += (target - this.vx) * 0.15 * P.airControl;
    if (this.onGround && this.vy >= 0 && this.stateT > 2) {
      this.attack = undefined;
      this.vx = 0;
      this.landTimer = 6;
      this.world.fx.dust(this.x);
      this.world.audio.sfx("sfx_land", 0.4);
      this.setState("land");
      this.play("nc_land", true);
    }
  }

  takeHit(h: HitDef, _from: Actor | null, dir: number) {
    if (this.dead) return;
    this.hp = Math.max(0, this.hp - h.dmg);
    this.damageTaken += h.dmg;
    this.flash = BAL.feel.hitFlashTicks;
    this.vibrate = h.hitstop;
    this.energy = Math.min(P.energyMax, this.energy + P.energyOnHurt);
    this.combo = 0;
    this.comboTimer = 0;
    this.attack = undefined;
    this.world.audio.sfx("sfx_hurt");
    if (this.hp <= 0) return this.die(dir);
    this.knockAcc += h.knock;
    this.facing = dir > 0 ? -1 : 1;
    if (this.knockAcc >= this.knockThreshold || (h.kbUp ?? 0) > 0) {
      this.knockAcc = 0;
      this.kbVx = h.kb * dir * 0.8;
      this.vy = -Math.max(h.kbUp ?? 0, 260);
      this.invuln = 999;
      this.setState("down");
      this.play("nc_down", true);
      return;
    }
    this.kbVx = h.kb * dir;
    this.hitstun = h.hitstun;
    this.setState("hurt");
    this.play("nc_hurt", true);
  }

  /** Finished lying/getting up → limited invulnerability (起身前半段无敌). */
  override setState(s: string) {
    if (this.state === "getup" && s !== "getup") this.invuln = Math.min(this.invuln, P.getupInvulnTicks);
    if (s === "getup") this.invuln = P.getupInvulnTicks + 30;
    super.setState(s);
  }

  die(dir: number) {
    if (this.dead) return;
    this.dead = true;
    this.attack = undefined;
    this.kbVx = 200 * dir;
    this.vy = -260;
    this.setState("ko");
    this.play("nc_ko", true);
    this.world.feel.slowmo(60, 0.35);
    this.world.emit("playerDown");
  }

  onHitLanded(h: HitDef) {
    this.energy = Math.min(P.energyMax, this.energy + (h.energy ?? 0));
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.comboTimer = BAL.feel.comboResetTicks;
    const k = this.attackKey;
    if (h.finisher && k !== "S") this.world.audio.vo("vo_heavy");
    else if (k === "L1" && this.combo <= 2) this.world.audio.vo("vo_light", 0.6);
    else if (k === "L2" || k === "AIR") this.world.audio.vo("vo_combo", 0.6);
    this.world.audio.sfx(h.finisher ? "sfx_hit_heavy" : "sfx_hit_light");
  }

  /** Baton trail + whoosh on the first tick of each hit window. */
  private swingFx() {
    const atk = this.attack;
    if (!atk || atk.key === "S") return;
    atk.def.hits.forEach((h, i) => {
      if (atk.t !== h.from) return;
      const heavy = !!h.finisher || (atk.key === "H" && i > 0);
      this.world.fx.trail(this, heavy);
      this.world.audio.sfx("sfx_swing", heavy ? 0.6 : 0.45);
    });
  }

  victory() {
    this.attack = undefined;
    this.vx = 0;
    this.setState("win");
    this.play("nc_win", true);
  }
}
