import Phaser from "phaser";
import type { Actor } from "./actor";
import { meta, scaleFor } from "./anims";
import { oneShot, v2meta, WORLD_SCALE } from "./assets";
import type { Boss } from "./boss";
import { BAL, BOSS, GROUND_Y, HitDef, Team } from "./config";
import type { World } from "./world";

const D = BOSS.dance;

interface Ring {
  x: number;
  r: number;
  speed: number;
  hit: boolean;
  age: number;
  spr: Phaser.GameObjects.Sprite;
}

interface Floater {
  obj: Phaser.GameObjects.Container | Phaser.GameObjects.Text;
  life: number;
  vy: number;
}

const TYPE_LINES = ["sudo rm -rf 奶察", "$ neofetch", "# flex --max", "git push --force", "ping 奶察 -t", "ssh root@奶察"];

/**
 * World-space effects: hit sparks, swing trails, splashes, dust, poofs (Drive「奶娃/FX」),
 * dance rings & warning ring, hacker screen, black hole, bitmap damage numbers, enemy mini bars.
 */
export class Fx {
  rings: Ring[] = [];
  private front: Phaser.GameObjects.Graphics;
  /** Bright outline drawn exactly on each ripple's hit edge, so the jump can be timed even in heavy rain. */
  private ringEdge: Phaser.GameObjects.Graphics;
  private warn?: Phaser.GameObjects.Sprite;
  private warnLife = 0;
  private hackScreen?: Phaser.GameObjects.Sprite;
  private hackT = 0;
  private hole?: { sprite: Phaser.GameObjects.Sprite; x: number; y: number; t: number; dur: number; base: number };
  private floaters: Floater[] = [];
  private aura: Phaser.GameObjects.Sprite;
  private bars = new Map<number, { frame: Phaser.GameObjects.Image; g: Phaser.GameObjects.Graphics }>();
  rain = 0.45;

  constructor(private w: World) {
    const s = w.stage;
    this.front = s.add.graphics().setDepth(28);
    this.ringEdge = s.add.graphics().setDepth(9.25);
    this.aura = s.add.sprite(0, GROUND_Y, "fx_superReady", 0).setOrigin(0.5, 0.92).setScale(WORLD_SCALE * 0.9).setDepth(11).setVisible(false);
    this.aura.play("a_superReady");
  }

  private get scene() {
    return this.w.stage;
  }

  // ── 雨中独舞 ──
  ring(x: number, speed: number) {
    const spr = this.scene.add.sprite(x, GROUND_Y + 3, "fx_ringBeat", 0).setDepth(9.2).setBlendMode(Phaser.BlendModes.ADD);
    this.rings.push({ x, r: 18, speed, hit: false, age: 0, spr });
  }

  warnRing(x: number, p: number) {
    if (!this.warn) {
      this.warn = this.scene.add.sprite(x, GROUND_Y + 3, "fx_warnRing", 0).setDepth(9.2).setBlendMode(Phaser.BlendModes.ADD);
      this.warn.play("a_warnRing");
    }
    this.warn.setPosition(x, GROUND_Y + 3).setScale(WORLD_SCALE * (0.9 + p * 0.9));
    this.warnLife = 2;
  }

  setRain(v: number) {
    this.rain = v;
    this.w.emit("rain", v);
  }

  private ringHit(): HitDef {
    return { from: 0, to: 0, dmg: D.ringDmg, hitstop: 5, hitstun: D.ringHitstun, kb: D.ringKb, knock: D.ringKnock, box: [0, 0, 0, 0], shake: 2 };
  }

  // ── 终端装逼 ──
  typeBubble(boss: Boss) {
    const line = TYPE_LINES[Math.floor(Math.random() * TYPE_LINES.length)];
    const t = this.scene.add
      .text(boss.x + Phaser.Math.Between(-40, 40), boss.y - 210, line, {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#6dff8f",
        backgroundColor: "#03140acc",
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5)
      .setResolution(2)
      .setDepth(32);
    this.floaters.push({ obj: t, life: 60, vy: -0.5 });
  }

  hackOn(boss: Boss) {
    this.hackOff();
    const m = meta("nh_hack_fx");
    this.hackScreen = this.scene.add
      .sprite(boss.x, GROUND_Y - 245, "nh_hack_fx", 0)
      .setOrigin(m.fxCenter?.[0] ?? 0.5, m.fxCenter?.[1] ?? 0.5)
      .setScale(scaleFor("nh_hack_fx") * 1.9)
      .setDepth(3.5)
      .setAlpha(0.9)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.hackT = 0;
    this.w.emit("coderain", true);
  }

  hackOff() {
    this.hackScreen?.destroy();
    this.hackScreen = undefined;
    this.w.emit("coderain", false);
  }

  holeOn(x: number, y: number, dur: number) {
    this.holeOff(false);
    const m = meta("nh_hole_fx");
    const base = scaleFor("nh_hole_fx") * 1.7;
    const sprite = this.scene.add
      .sprite(x, y, "nh_hole_fx", 0)
      .setOrigin(m.fxCenter?.[0] ?? 0.5, m.fxCenter?.[1] ?? 0.5)
      .setScale(base * 0.5)
      .setDepth(7);
    this.hole = { sprite, x, y, t: 0, dur, base };
  }

  holeOff(blast: boolean) {
    const h = this.hole;
    if (!h) return;
    this.hole = undefined;
    const s = h.sprite;
    this.scene.tweens.add({
      targets: s,
      scale: blast ? s.scale * 2.2 : 0.05,
      alpha: 0,
      duration: blast ? 260 : 220,
      ease: "Quad.easeOut",
      onComplete: () => s.destroy(),
    });
  }

  // ── 打击反馈 ──
  superFlash() {
    this.w.emit("superflash");
  }

  hitSpark(x: number, y: number, heavy: boolean) {
    const s = oneShot(this.scene, x, y, heavy ? "fx_sparkHeavy" : "fx_sparkLight", heavy ? "a_sparkHeavy" : "a_sparkLight", WORLD_SCALE * (heavy ? 1 : 0.9), 31);
    s.setRotation(Phaser.Math.FloatBetween(-0.4, 0.4));
  }

  splash(x: number, y: number) {
    oneShot(this.scene, x, y, "fx_splash", "a_splash", WORLD_SCALE * 0.75, 30).setFlipX(Math.random() < 0.5);
  }

  /** Baton arc in front of the attacker (art: arc centre at the left-middle of each cell). */
  trail(a: Actor, heavy: boolean) {
    const s = oneShot(this.scene, a.x + a.facing * 18, a.y - (heavy ? 70 : 82), "fx_trail", heavy ? "a_trailHeavy" : "a_trailLight", WORLD_SCALE * (heavy ? 0.85 : 0.7), 13);
    s.setOrigin(a.facing > 0 ? 0.08 : 0.92, 0.5).setFlipX(a.facing < 0).setAlpha(0.95);
  }

  dust(x: number, big = false) {
    oneShot(this.scene, x, GROUND_Y + 2, "fx_dust", "a_dust", WORLD_SCALE * (big ? 1 : 0.7), 9).setOrigin(0.5, 0.9);
  }

  poof(x: number, y: number) {
    oneShot(this.scene, x, y, "fx_poof", "a_poof", WORLD_SCALE * 0.75, 15);
  }

  micBreak(x: number, y: number) {
    oneShot(this.scene, x, y, "fx_micBreak", "a_micBreak", WORLD_SCALE * 0.8, 31);
  }

  damageNumber(x: number, y: number, n: number, team: Team, big = false) {
    const row = team === "player" ? 2 : big ? 1 : 0;
    const digits = String(Math.max(0, Math.round(n))).split("");
    const k = WORLD_SCALE * (big ? 1.2 : 0.9);
    const cw = 30 * k;
    // 连段时数字往上错开，不叠成一团
    let top = y;
    for (const f of this.floaters) if (f.life > 20 && Math.abs(f.obj.x - x) < 50 && f.obj.y < top + 16 && f.obj.y > y - 70) top = Math.min(top, f.obj.y - 16);
    const c = this.scene.add.container(x + Phaser.Math.Between(-8, 8), top).setDepth(40);
    digits.forEach((d, i) => {
      c.add(this.scene.add.image((i - (digits.length - 1) / 2) * cw, 0, "ui_dmgDigits", row * 10 + Number(d)).setScale(k).setOrigin(0.5, 1));
    });
    c.setScale(1.5);
    this.scene.tweens.add({ targets: c, scale: 1, duration: 120, ease: "Back.easeOut" });
    this.floaters.push({ obj: c, life: 44, vy: -1 });
  }

  popText(x: number, y: number, str: string, color: string, size = 16) {
    const t = this.scene.add
      .text(x, y, str, { fontFamily: "FusionPixel, sans-serif", fontSize: `${size}px`, color, stroke: "#000000", strokeThickness: 4 })
      .setOrigin(0.5, 1)
      .setResolution(2)
      .setDepth(40);
    this.floaters.push({ obj: t, life: 42, vy: -1.1 });
  }

  /** Sim tick: rings expand + hit the grounded player; fx timelines advance. */
  update() {
    const p = this.w.player;
    const hw = v2meta().fx;
    this.ringEdge.clear();
    for (const r of this.rings) {
      r.age++;
      r.r += r.speed / 60;
      const thick = D.ringThick;
      if (!r.hit && p.height < 8) {
        const d = Math.abs(p.x - r.x);
        const reach = p.hurtW * 0.35;
        if (d > r.r - thick / 2 - reach && d < r.r + thick / 2 + reach) {
          if (p.canBeHit()) {
            r.hit = true;
            this.w.combat.applyHit(null, p, this.ringHit(), Math.sign(p.x - r.x) || 1);
          } else if (p.state === "dodge") r.hit = true; // 翻滚穿过这一圈
        }
      }
      const k = r.r / D.ringMaxR;
      const f = Math.min(7, Math.floor(k * 3) + 2);
      r.spr.setFrame(f).setScale(r.r / hw.ringBeat.halfWidth![f]).setAlpha(1 - k * 0.8);
      const a = Math.max(0.25, 1 - k * 0.7);
      this.ringEdge.lineStyle(6, 0x35d6ff, a * 0.55).strokeEllipse(r.x, GROUND_Y + 3, r.r * 2, r.r * 0.48);
      this.ringEdge.lineStyle(2, 0xeaffff, a).strokeEllipse(r.x, GROUND_Y + 3, r.r * 2, r.r * 0.48);
    }
    for (const r of this.rings) if (r.r >= D.ringMaxR) r.spr.destroy();
    this.rings = this.rings.filter((r) => r.r < D.ringMaxR);
    if (this.warn && --this.warnLife <= 0) {
      this.warn.destroy();
      this.warn = undefined;
    }
    if (this.hackScreen) {
      this.hackT++;
      this.hackScreen.setFrame(Math.floor(this.hackT / 11) % 12);
      this.hackScreen.setAlpha(0.75 + Math.random() * 0.2);
    }
    if (this.hole) {
      const h = this.hole;
      h.t++;
      const k = Math.min(1, h.t / h.dur);
      h.sprite.setFrame(Math.min(11, Math.floor(k * 12)));
      h.sprite.setScale(h.base * (0.5 + k * 0.7));
      h.sprite.rotation += 0.03 + k * 0.05;
    }
    for (const f of this.floaters) {
      f.life--;
      f.obj.y += f.vy;
      if (f.life < 14) f.obj.setAlpha(f.life / 14);
    }
    for (const f of this.floaters) if (f.life <= 0) f.obj.destroy();
    this.floaters = this.floaters.filter((f) => f.life > 0);

    // 雨点落地溅起
    const cam = this.scene.cameras.main.worldView;
    if (Math.random() < this.rain * 1.6) {
      oneShot(this.scene, Phaser.Math.Between(cam.x, cam.right), GROUND_Y + Phaser.Math.Between(-12, 62), "fx_rainSplash", "a_rainSplash", WORLD_SCALE, 9.1).setAlpha(0.8);
    }
  }

  /** Render frame: aura, enemy mini bars, black-hole particles. */
  draw(time: number) {
    const p = this.w.player;
    const ready = p.energy >= BAL.player.energyMax && !p.dead;
    this.aura.setVisible(ready).setPosition(p.x, p.y + 6).setAlpha(p.onGround ? 1 : 0.5);

    for (const e of this.w.enemies) {
      let b = this.bars.get(e.id);
      const show = !e.dead && e.hp < e.maxHp && e.state !== "enter";
      if (!b && show) {
        b = { g: this.scene.add.graphics().setDepth(41), frame: this.scene.add.image(0, 0, "ui_miniBar").setScale(WORLD_SCALE).setDepth(42) };
        this.bars.set(e.id, b);
      }
      if (!b) continue;
      if (!show || e.removeMe) {
        b.g.destroy();
        b.frame.destroy();
        this.bars.delete(e.id);
        continue;
      }
      const x = e.x;
      const y = e.y - e.hurtH - 14;
      b.frame.setPosition(x, y);
      b.g.clear();
      b.g.fillStyle(0x120c18, 1).fillRect(x - 19, y - 2, 38, 4);
      b.g.fillStyle(0xff5a3c, 1).fillRect(x - 19, y - 2, 38 * (e.hp / e.maxHp), 4);
    }

    const f = this.front;
    f.clear();
    if (this.hole) {
      const h = this.hole;
      const k = Math.min(1, h.t / h.dur);
      const R = 120 + 140 * k;
      for (let i = 0; i < 26; i++) {
        const a = i * 2.4 + time / 220;
        const d = ((time / 9 + i * 37) % R) / R;
        const rr = R * (1 - d);
        const x = h.x + Math.cos(a + d * 4) * rr;
        const y = h.y + Math.sin(a + d * 4) * rr * 0.55;
        f.fillStyle(i % 3 === 0 ? 0x9dff6a : 0x3dffb0, 0.55 * d);
        f.fillCircle(x, y, 1.5 + 2 * d);
      }
    }
  }

  clearAll() {
    this.ringEdge.clear();
    for (const r of this.rings) r.spr.destroy();
    this.rings = [];
    this.warn?.destroy();
    this.warn = undefined;
    this.hackOff();
    this.hole?.sprite.destroy();
    this.hole = undefined;
    for (const f of this.floaters) f.obj.destroy();
    this.floaters = [];
    for (const b of this.bars.values()) {
      b.g.destroy();
      b.frame.destroy();
    }
    this.bars.clear();
    this.setRain(0.45);
  }
}
