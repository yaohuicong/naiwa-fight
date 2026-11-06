import Phaser from "phaser";
import { Actor, overlap } from "./actor";
import { GROUND_Y, HitDef } from "./config";
import type { World } from "./world";

/** Hit feel: hitstop, super-freeze, slow-mo and a custom camera shake (logical px). */
export class Feel {
  hitstop = 0;
  freeze = 0;
  private slowTicks = 0;
  private slowScale = 1;
  private shakeAmp = 0;
  private shakeT = 0;
  shakeX = 0;
  shakeY = 0;

  addHitstop(n: number) {
    this.hitstop = Math.max(this.hitstop, Math.round(n));
  }

  superFreeze(n: number) {
    this.freeze = Math.max(this.freeze, n);
  }

  slowmo(ticks: number, scale: number) {
    this.slowTicks = ticks;
    this.slowScale = scale;
  }

  shake(px: number) {
    if (px <= 0) return;
    this.shakeAmp = Math.max(this.shakeAmp * (this.shakeT > 0 ? 1 : 0), px);
    this.shakeT = Math.round(8 + px * 3);
  }

  timeScale() {
    return this.slowTicks > 0 ? this.slowScale : 1;
  }

  /** Called once per sim tick, including hitstop ticks. */
  step() {
    if (this.slowTicks > 0) this.slowTicks--;
    if (this.shakeT > 0) {
      this.shakeT--;
      const a = this.shakeAmp * (this.shakeT / (this.shakeT + 4));
      this.shakeX = Phaser.Math.FloatBetween(-a, a);
      this.shakeY = Phaser.Math.FloatBetween(-a, a) * 0.7;
      if (this.shakeT === 0) this.shakeAmp = 0;
    } else {
      this.shakeX = this.shakeY = 0;
    }
  }
}

/** AABB resolution: each attack instance hits each target once per hit index (hitId). */
export class Combat {
  constructor(private w: World) {}

  resolve() {
    const w = this.w;
    const p = w.player;
    const foes: Actor[] = w.boss ? [...w.enemies, w.boss] : [...w.enemies];

    // 奶察 → 敌人 / 麦克风
    if (p.attack && !p.dead) {
      for (const { hit, index } of p.activeHits()) {
        const box = p.hitbox(hit);
        for (const e of foes) {
          if (!e.canBeHit()) continue;
          const id = `${e.id}:${index}`;
          if (p.attack.hitIds.has(id)) continue;
          if (overlap(box, e.hurtbox())) {
            p.attack.hitIds.add(id);
            this.applyHit(p, e, hit, Math.sign(e.x - p.x) || p.facing);
            if (!p.attack) break;
          }
        }
        if (!p.attack) break;
        for (const b of w.props) {
          const id = `${b.id}:${index}`;
          if (b.broken || p.attack.hitIds.has(id) || !overlap(box, b.hurtbox())) continue;
          p.attack.hitIds.add(id);
          if (b.hit((hit.hitstop ?? 0) >= 6 || !!hit.finisher, p.facing)) {
            w.feel.addHitstop(3);
            w.fx.hitSpark(b.x, GROUND_Y - 30, false);
          }
        }
        for (const m of w.mics) {
          if (m.alive && overlap(box, m.box())) {
            m.alive = false;
            w.feel.addHitstop(3);
            w.fx.micBreak(m.x, m.y);
            w.audio.sfx("sfx_mic", 0.5);
          }
        }
        if (!p.attack) break;
      }
    }

    // 敌人 → 奶察
    for (const e of foes) {
      if (!e.attack || e.dead) continue;
      for (const { hit, index } of e.activeHits()) {
        const id = `${p.id}:${index}`;
        if (e.attack.hitIds.has(id)) continue;
        if (!p.canBeHit()) {
          // 翻滚无敌时被判定扫到 = 这一招已经被闪掉，不会在无敌结束后再补一下
          if (p.state === "dodge" && overlap(e.hitbox(hit), p.hurtbox())) {
            e.attack.hitIds.add(id);
            w.fx.popText(p.x, p.y - p.hurtH - 10, "闪！", "#9ff7ff", 13);
          }
          continue;
        }
        if (overlap(e.hitbox(hit), p.hurtbox())) {
          e.attack.hitIds.add(id);
          this.applyHit(e, p, hit, Math.sign(p.x - e.x) || e.facing);
        }
      }
    }

    // 麦克风 → 奶察
    for (const m of w.mics) {
      if (!m.alive || !p.canBeHit()) continue;
      if (overlap(m.box(), p.hurtbox())) {
        m.alive = false;
        this.applyHit(null, p, m.hit, Math.sign(m.vx) || 1);
      }
    }
  }

  applyHit(att: Actor | null, vic: Actor, h: HitDef, dir: number) {
    const w = this.w;
    const before = vic.hp;
    vic.takeHit(h, att, dir);
    const dealt = before - vic.hp;
    w.feel.addHitstop(h.hitstop);
    w.feel.shake(h.shake ?? 1);
    const hb = vic.hurtbox();
    const sx = att ? Phaser.Math.Clamp(att.x + att.facing * (h.box[0] + h.box[2] * 0.25), hb.x, hb.x + hb.w) : vic.x;
    const sy = att ? Phaser.Math.Clamp(att.y - h.box[1], hb.y + 10, hb.y + hb.h - 10) : vic.y - vic.hurtH * 0.6;
    w.fx.hitSpark(sx, sy, (h.hitstop ?? 0) >= 6);
    if (dealt > 0) w.fx.splash(sx + dir * 6, sy);
    if (dealt > 0) w.fx.damageNumber(vic.x, vic.y - vic.hurtH - 6, dealt, vic.team, h.dmg >= 80);
    if (att === w.player) w.player.onHitLanded(h);
  }
}
