import { Actor } from "./actor";
import { AttackDef, BAL, BOSS, GROUND_Y, HitDef } from "./config";
import type { World } from "./world";

const D = BOSS.dance;
const T = BOSS.terminal;
const K = BOSS.kick;
const CH = BOSS.charge;

const SKILL_STATES = new Set(["danceWarn", "dance", "type", "hack", "hole", "charge"]);
const DANCE_STATES = new Set(["danceWarn", "dance"]);
const TERM_STATES = new Set(["type", "hack", "hole"]);

/** 奶豪 — Boss of stage 1 (PRD §4.5, §5.2, §5.3). */
export class Boss extends Actor {
  readonly team = "enemy" as const;
  readonly kind = "naihao";
  phase = 1;
  danceCd: number = D.firstWithin;
  termCd: number = T.cooldown;
  kickCd = 60;
  chargeCd: number = CH.firstAfter;
  private chargeTaught = false;
  private gap = 40;
  private lastSkill = "";
  private hitLog: number[] = [];
  private counterKick = false;
  private danceFrame = -1;
  ready = false;

  static chargeDef(): AttackDef {
    return {
      anim: CH.anim,
      steps: CH.steps,
      hits: [{ ...CH.hit, to: CH.hit.to }],
      move: [CH.dash],
      cancelFrom: 999,
      cancelInto: [],
    };
  }

  static kickDef(): AttackDef {
    return {
      anim: K.anim,
      steps: K.steps,
      hits: [{ from: K.from, to: K.to, dmg: K.dmg, hitstop: K.hitstop, hitstun: K.hitstun, kb: K.kb, knock: K.knock, box: K.box, shake: 2 }],
      move: [K.lunge],
      cancelFrom: 999,
      cancelInto: [],
    };
  }

  constructor(world: World, x: number, private standX: number) {
    super(world, x, 10);
    this.hp = this.maxHp = BOSS.maxHp;
    this.hurtW = BOSS.hurtbox.w;
    this.hurtH = BOSS.hurtbox.h;
    this.knockThreshold = BOSS.knockdownThreshold;
    this.knockDecay = BOSS.knockdownDecayPerSec;
    this.facing = -1;
    this.invuln = 99999;
    this.state = "intro";
    this.play("nh_walk");
  }

  get inSkill() {
    return SKILL_STATES.has(this.state);
  }

  get skillName() {
    if (DANCE_STATES.has(this.state)) return "雨中独舞";
    if (TERM_STATES.has(this.state)) return "终端装逼";
    return "";
  }

  private holeX = 0;

  /** Black-hole centre while active (opened toward the player, kept inside the arena). */
  get holeCenter() {
    return { x: this.holeX, y: GROUND_Y - T.hole.height };
  }

  private placeHole() {
    const p = this.world.player;
    const dir = Math.sign(p.x - this.x) || this.facing;
    this.facing = dir as 1 | -1;
    const b = this.world.bounds;
    this.holeX = Math.max(b.left + 110, Math.min(b.right - 110, this.x + dir * T.hole.offset));
  }

  update() {
    this.stateT++;
    this.tickTimers();
    if (this.danceCd > 0) this.danceCd--;
    if (this.termCd > 0) this.termCd--;
    if (this.kickCd > 0) this.kickCd--;
    if (this.chargeCd > 0) this.chargeCd--;
    this.updatePhase();
    const w = this.world;
    const p = w.player;

    switch (this.state) {
      case "intro":
        this.vx = -BOSS.walk;
        this.play("nh_walk");
        if (this.x <= this.standX) {
          this.vx = 0;
          this.invuln = 0;
          this.ready = true;
          this.setState("idle");
          this.play("nh_idle");
          w.emit("bossReady");
        }
        break;
      case "idle":
      case "walk":
      case "run":
        this.think();
        break;
      case "kick":
        this.vx = 0;
        if (this.attack?.t === K.from) w.audio.sfx("sfx_swing", 0.6);
        this.armor = this.counterKick && (this.attack?.t ?? 99) < K.from;
        if (!this.stepAttack()) {
          this.counterKick = false;
          this.armor = false;
          this.gap = 40;
          this.setState("idle");
          this.play("nh_idle", true);
        }
        break;
      // ── 肚皮冲撞 ──
      case "charge": {
        this.vx = 0;
        const t = this.attack?.t ?? 999;
        if (t < CH.dash[0]) this.faceToward(p.x); // 蓄力时一直盯着玩家，冲出去就不回头
        if (t === CH.dash[0]) w.audio.sfx("sfx_dash", 0.8, 0);
        if (t === CH.dash[1] + 8) {
          w.fx.dust(this.x + this.facing * 30, true);
          w.audio.sfx("sfx_land", 0.6);
        }
        if (!this.stepAttack()) {
          this.armor = false;
          this.chargeCd = CH.cooldown;
          this.gap = 30;
          this.setState("idle");
          this.play("nh_idle", true);
        }
        break;
      }
      case "hurt":
        this.vx = 0;
        if (--this.hitstun <= 0) {
          if (this.poiseBroken()) this.startKick(true);
          else {
            this.gap = 10;
            this.setState("idle");
            this.play("nh_idle", true);
          }
        }
        break;
      case "down":
        this.vx = 0;
        if (this.onGround && this.vy >= 0 && this.stateT > 6 && this.animDone) {
          this.setState("lie");
          this.play("nh_lie");
          w.fx.dust(this.x, true);
          w.audio.sfx("sfx_land", 0.6);
        }
        break;
      case "lie":
        if (this.stateT >= BOSS.lieTicks) {
          this.setState("getup");
          this.play("nh_getup", true);
        }
        break;
      case "getup":
        if (this.animDone) {
          this.invuln = 24;
          this.gap = 8;
          this.setState("idle");
          this.play("nh_idle", true);
        }
        break;

      // ── 技能1 雨中独舞 ──
      case "danceWarn":
        this.vx = 0;
        w.fx.warnRing(this.x, this.stateT / D.warnTicks);
        if (this.stateT >= D.warnTicks) {
          this.setState("dance");
          this.animDurScale = this.phase >= 3 ? D.p3.animScale : 1;
          this.play("nh_dance", true);
          this.danceFrame = -1;
        }
        break;
      case "dance": {
        this.vx = 0;
        const f = this.animFrame;
        if (f !== this.danceFrame) {
          this.danceFrame = f;
          // 只在两次落地（第 8、20 帧）踩出水波：间隔约 1.3 秒，跳一次就能躲过一圈
          if (D.beatFrames.includes(f)) {
            w.fx.ring(this.x, this.phase >= 3 ? D.p3.ringSpeed : D.ringSpeed);
            w.audio.sfx("sfx_ripple", 0.7);
            w.feel.shake(BAL.feel.shakeBeat);
          }
        }
        if (this.stateT >= (this.phase >= 3 ? D.p3.durationTicks : D.durationTicks)) {
          this.armor = false;
          w.fx.setRain(0.45);
          this.setState("danceRecover");
          this.play("nh_idle", true);
        }
        break;
      }
      case "danceRecover":
        if (this.stateT >= D.recoverTicks) {
          this.danceCd = Math.round(D.cooldown * (this.phase >= 3 ? D.p3CooldownMult : 1));
          this.lastSkill = "dance";
          this.gap = 30;
          this.setState("idle");
        }
        break;

      // ── 技能2 终端装逼：打字 → 黑客屏 → 黑洞吸附 ──
      case "type":
        this.vx = 0;
        if (this.stateT % 24 === 1) w.fx.typeBubble(this);
        if (this.stateT >= T.typeTicks) {
          this.setState("hack");
          this.play("nh_hack", true);
          w.audio.loop("sfx_typing", false);
          w.audio.loop("sfx_hacker", true, 0.4);
          w.fx.hackOn(this);
          w.emit("callout", "黑客屏");
        }
        break;
      case "hack":
        this.vx = 0;
        if (this.stateT % T.hack.every === 0 && !p.dead && Math.abs(p.x - this.x) < T.hack.radius) {
          p.chip(T.hack.dmg);
          w.feel.shake(0.8);
        }
        if (this.stateT >= T.hackTicks) {
          this.setState("hole");
          this.play("nh_hole", true);
          w.audio.loop("sfx_hacker", false);
          w.audio.sfx("sfx_blackhole", 0.75, 0);
          w.fx.hackOff();
          this.placeHole();
          const c = this.holeCenter;
          w.fx.holeOn(c.x, c.y, T.holeTicks);
          w.emit("callout", "黑洞吸附");
        }
        break;
      case "hole":
        this.vx = 0;
        this.pull();
        if (this.stateT >= T.holeTicks) {
          w.fx.holeOff(true);
          w.feel.shake(4);
          w.emit("flash", T.blastTicks);
          this.armor = false;
          this.setState("termRecover");
          this.play("nh_idle", true);
        }
        break;
      case "termRecover":
        if (this.stateT >= T.recoverTicks) {
          this.termCd = T.cooldown;
          this.lastSkill = "term";
          this.gap = 30;
          this.setState("idle");
        }
        break;

      case "ko":
        this.vx = 0;
        // 倒飞（借用倒地的翻滚帧）落地后：冒星星 → 躺平
        if (this.animKey === "nh_ko" && this.animDone && this.onGround) {
          this.play("nh_ko_end", true);
          w.fx.dust(this.x, true);
        }
        break;
      case "win":
        this.vx = 0;
        this.play("nh_win");
        break;
    }
    this.stepAnim();
    this.physics();
  }

  private updatePhase() {
    if (!this.ready || this.dead) return;
    const r = this.hp / this.maxHp;
    const ph = r > BOSS.phases.p2 ? 1 : r > BOSS.phases.p3 ? 2 : 3;
    if (ph <= this.phase) return;
    this.phase = ph;
    if (ph === 2) this.termCd = Math.min(this.termCd, 150);
    if (ph === 3) this.danceCd = Math.round(this.danceCd * D.p3CooldownMult);
    this.world.emit("bossPhase", ph);
  }

  private think() {
    const p = this.world.player;
    if (p.dead) {
      this.vx = 0;
      this.play("nh_idle");
      return;
    }
    this.faceToward(p.x);
    const dx = p.x - this.x;
    const ad = Math.abs(dx);
    if (this.gap > 0) this.gap--;
    if (this.gap <= 0) {
      const s = this.chooseSkill();
      if (s === "dance") return this.startDance();
      if (s === "term") return this.startTerminal();
      if (ad <= K.range && this.kickCd <= 0) return this.startKick(false);
      // 玩家拉开距离 → 有概率肚皮冲撞（没抽中就过 1 秒再抽）
      if (ad > CH.minDist && this.chargeCd <= 0 && p.onGround) {
        if (Math.random() < CH.chance) return this.startCharge();
        this.chargeCd = 60;
      }
    }
    let speed = 0;
    if (ad > K.range * 0.8) speed = ad > BOSS.runIfFartherThan ? BOSS.run : BOSS.walk;
    else if (ad < 64) speed = -BOSS.walk * 0.6;
    this.vx = Math.sign(dx) * speed;
    if (speed === 0) {
      this.setStateIf("idle");
      this.play("nh_idle");
    } else if (Math.abs(speed) > BOSS.walk) {
      this.setStateIf("run");
      this.play("nh_run");
    } else {
      this.setStateIf("walk");
      this.play("nh_walk");
    }
  }

  private setStateIf(s: string) {
    if (this.state !== s) this.setState(s);
  }

  private chooseSkill(): "dance" | "term" | null {
    const dance = this.danceCd <= 0;
    const term = this.termCd <= 0;
    if (this.phase === 1) return dance ? "dance" : null;
    if (this.phase === 2) {
      if (this.lastSkill === "dance") return term ? "term" : null;
      if (this.lastSkill === "term") return dance ? "dance" : null;
      return dance ? "dance" : term ? "term" : null;
    }
    return term ? "term" : dance ? "dance" : null;
  }

  private startKick(counter: boolean) {
    this.counterKick = counter;
    this.hitLog = [];
    this.kickCd = K.cooldown;
    this.vx = 0;
    this.setState("kick");
    this.startAttack("kick", Boss.kickDef());
  }

  private startCharge() {
    const w = this.world;
    this.armor = true;
    this.vx = 0;
    this.setState("charge");
    this.startAttack("charge", Boss.chargeDef());
    w.fx.popText(this.x, this.y - this.hurtH - 24, "！", "#ff5a5a", 30);
    w.audio.sfx("sfx_swing", 0.5, 0);
    if (!this.chargeTaught) {
      this.chargeTaught = true;
      w.emit("hint", "肚皮冲撞来了！按 S（手柄 LB）翻滚穿过去");
    }
  }

  private startDance() {
    this.armor = D.armor;
    this.vx = 0;
    this.setState("danceWarn");
    this.play("nh_idle", true);
    this.world.fx.setRain(1);
    this.world.emit("banner", { text: "雨中独舞", sub: "奶豪落地就踩出水波 · 看准时机跳起来躲！", color: "#7df3ff" });
  }

  private startTerminal() {
    this.armor = T.armor;
    this.vx = 0;
    this.setState("type");
    this.play("nh_type", true);
    this.world.audio.loop("sfx_typing", true, 0.5);
    this.world.emit("banner", { text: "终端装逼", sub: "打字时霸体 · 趁机输出！", color: "#7dff9a" });
  }

  /** Black hole suction (PRD §5.3 C): pulls player + minions, core deals damage. */
  private pull() {
    const c = this.holeCenter;
    const w = this.world;
    const targets: Actor[] = [w.player, ...w.enemies];
    for (const a of targets) {
      if (a.dead && a !== w.player) continue;
      const dir = Math.sign(c.x - a.x);
      const accel = T.hole.accel * (a.onGround ? 1 : T.hole.airMult);
      a.extVx = Math.max(-T.hole.maxPull, Math.min(T.hole.maxPull, a.extVx + (dir * accel) / 60));
      a.pulled = true;
    }
    const p = w.player;
    if (this.stateT % T.hole.coreEvery === 0 && !p.dead && Math.abs(p.x - c.x) < T.hole.coreRadius && p.height < 120) {
      p.chip(T.hole.coreDmg);
      w.feel.shake(1);
    }
  }

  private poiseBroken() {
    const now = this.world.tick;
    this.hitLog = this.hitLog.filter((t) => now - t <= BOSS.poiseWindow);
    return this.hitLog.length >= BOSS.poiseHits;
  }

  private interruptSkill(silent = false) {
    const w = this.world;
    if (DANCE_STATES.has(this.state)) {
      this.danceCd = Math.round(D.cooldown * T.interruptRefund);
      w.fx.setRain(0.45);
    }
    if (TERM_STATES.has(this.state)) {
      this.termCd = Math.round(T.cooldown * T.interruptRefund);
      w.fx.hackOff();
      w.fx.holeOff(false);
    }
    if (this.state === "charge") this.chargeCd = CH.cooldown;
    this.armor = false;
    w.audio.loop("sfx_typing", false);
    w.audio.loop("sfx_hacker", false);
    if (!silent) w.emit("callout", "打断！");
  }

  takeHit(h: HitDef, _from: Actor | null, dir: number) {
    if (this.dead || !this.ready) return;
    this.hp = Math.max(0, this.hp - h.dmg);
    this.flash = 5;
    this.vibrate = h.hitstop;
    if (this.hp <= 0) return this.die(dir);
    if (this.armor) {
      if (h.breaksArmor && this.inSkill) {
        this.interruptSkill();
        this.knockdown(h, dir);
      }
      return; // 霸体：吃伤害不硬直
    }
    this.hitLog.push(this.world.tick);
    this.knockAcc += h.knock;
    if (this.knockAcc >= this.knockThreshold || h.breaksArmor) return this.knockdown(h, dir);
    this.attack = undefined;
    this.counterKick = false;
    this.kbVx = h.kb * dir * 0.5;
    this.hitstun = Math.max(6, Math.round(h.hitstun * BOSS.hitstunScale));
    this.setState("hurt");
    this.play("nh_hurt", true);
  }

  private knockdown(h: HitDef, dir: number) {
    this.knockAcc = 0;
    this.attack = undefined;
    this.armor = false;
    this.counterKick = false;
    this.kbVx = h.kb * dir * 0.6;
    this.vy = -Math.max(h.kbUp ?? 0, 240);
    this.invuln = 9999;
    this.setState("down");
    this.play("nh_down", true);
  }

  override setState(s: string) {
    if (this.state === "getup" && s !== "getup") this.invuln = Math.min(this.invuln, 24);
    if (this.state === "dance" && s !== "dance") this.animDurScale = 1; // 被打断/结束都恢复正常动画速度
    super.setState(s);
  }

  die(dir: number) {
    if (this.dead) return;
    if (this.inSkill) this.interruptSkill(true);
    this.dead = true;
    this.armor = false;
    this.attack = undefined;
    this.kbVx = 160 * dir;
    this.vy = -240;
    this.setState("ko");
    this.play("nh_ko", true);
    this.world.onBossKO();
  }

  gloat() {
    if (this.dead) return;
    if (this.inSkill) this.interruptSkill(true);
    this.attack = undefined;
    this.vx = 0;
    this.setState("win");
  }
}

