import Phaser from "phaser";
import { placeholderList, render } from "../game/anims";
import { screenCam, FONT_STACK, v2meta } from "../game/assets";
import { BAL, BOSS, VIEW_W } from "../game/config";
import type { StageScene } from "./StageScene";

const W = 1920;
const H = 1080;
const M = 24; // screen margin

type TextStyle = Phaser.Types.GameObjects.Text.TextStyle;
const style = (size: number, color = "#ffffff", stroke = 0): TextStyle => ({
  fontFamily: FONT_STACK,
  fontSize: `${size}px`,
  color,
  stroke: "#06060c",
  strokeThickness: stroke,
});

/** A bar that fills a frame's dark groove with a texture strip (crop = value). */
class GrooveBar {
  private trail: Phaser.GameObjects.Image;
  private fill: Phaser.GameObjects.Image;
  private trailV = 1;
  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, fillKey: string, private rtl = false) {
    const mk = (key: string) =>
      scene.add
        .image(rtl ? x + w : x, y, key)
        .setOrigin(rtl ? 1 : 0, 0)
        .setDisplaySize(w, h)
        .setDepth(11.5);
    this.trail = mk("ui_fillTrail").setAlpha(0.85);
    this.fill = mk(fillKey);
  }
  set(v: number, dt: number) {
    this.trailV = Math.max(v, this.trailV - dt * 0.35);
    const crop = (img: Phaser.GameObjects.Image, k: number) => {
      const fw = img.frame.width;
      if (this.rtl) img.setCrop(fw * (1 - k), 0, fw * k, img.frame.height);
      else img.setCrop(0, 0, fw * k, img.frame.height);
    };
    crop(this.fill, Phaser.Math.Clamp(v, 0, 1));
    crop(this.trail, Phaser.Math.Clamp(this.trailV, 0, 1));
  }
  reset() {
    this.trailV = 1;
  }
  setVisible(v: boolean) {
    this.fill.setVisible(v);
    this.trail.setVisible(v);
  }
}

/**
 * HUD（Drive「奶娃/UI」）：
 * 左上 关卡面板 · 右上 连击/大招面板 · 中上 Boss 血条 · 左下 奶察血条 · 右下 目标提示。
 * 另含雨、代码雨、闪白、横幅与暂停 / K.O. / 通关面板。
 */
export class UIScene extends Phaser.Scene {
  private stage!: StageScene;
  private rainBack!: Phaser.GameObjects.TileSprite;
  private rainFront!: Phaser.GameObjects.TileSprite;
  private rainLevel = 0.45;
  private rainTarget = 0.45;
  private codeTex!: Phaser.Textures.CanvasTexture;
  private codeImg!: Phaser.GameObjects.Image;
  private codeOn = false;
  private codeCols: number[] = [];
  private codeTick = 0;
  private flash!: Phaser.GameObjects.Rectangle;
  private dim!: Phaser.GameObjects.Rectangle;
  private t: Record<string, Phaser.GameObjects.Text> = {};
  private hpBar!: GrooveBar;
  private bossBar!: GrooveBar;
  private energyBar!: GrooveBar;
  private bossGroup!: Phaser.GameObjects.Container;
  private bossIcons: Phaser.GameObjects.Image[] = [];
  private bossMarks!: Phaser.GameObjects.Graphics;
  private nodes: Phaser.GameObjects.Image[] = [];
  private nodeLabels: Phaser.GameObjects.Text[] = [];
  private comboDigits!: Phaser.GameObjects.Container;
  private comboShown = -1;
  private goArrow!: Phaser.GameObjects.Sprite;
  private banner!: Phaser.GameObjects.Container;
  private panel!: Phaser.GameObjects.Container;
  private hintT = 0;
  private waveInfo: { label: string; index: number; total: number } | null = null;
  private goT = 0;
  private bossActive = false;
  private bossShown = 0;
  private bossPhase = 1;
  private cleared = 0;
  private elapsed = 0;
  private listeners: [string, (...a: never[]) => void][] = [];

  constructor() {
    super("UI");
  }

  create() {
    screenCam(this);
    this.stage = this.scene.get("Stage") as StageScene;
    this.rainLevel = this.rainTarget = 0.45;
    this.bossActive = false;
    this.bossShown = 0;
    this.bossPhase = 1;
    this.waveInfo = null;
    this.codeOn = false;
    this.elapsed = 0;
    this.goT = 0;
    this.cleared = 0;
    this.comboShown = -1;
    this.nodes = [];
    this.nodeLabels = [];
    this.bossIcons = [];
    const ui = v2meta().ui;

    // ── overlays ──
    this.rainBack = this.add.tileSprite(0, 0, W, H, "fx_rainBack").setOrigin(0).setDepth(0).setAlpha(0.35).setTileScale(1.3);
    this.rainFront = this.add.tileSprite(0, 0, W, H, "fx_rainFront").setOrigin(0).setDepth(0.5).setAlpha(0.3);
    this.rainBack.setVisible(!render.canvas); // Canvas 回退：只保留一层雨，省一次全屏绘制
    if (!this.textures.exists("coderain")) this.textures.createCanvas("coderain", 480, 270);
    this.codeTex = this.textures.get("coderain") as Phaser.Textures.CanvasTexture;
    this.codeImg = this.add.image(W / 2, H / 2, "coderain").setScale(4).setDepth(1).setAlpha(0);
    this.codeCols = Array.from({ length: 60 }, () => Math.random() * 30);
    this.dim = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0).setDepth(2);
    this.flash = this.add.rectangle(W / 2, H / 2, W, H, 0xffffff, 0).setDepth(50);

    // ── 左上：关卡面板 ──
    const sp = { x: M, y: M - 4, k: 1.2 };
    this.add.image(sp.x, sp.y, "ui_stagePanel").setOrigin(0).setScale(sp.k).setDepth(10);
    this.t.stageName = this.add.text(sp.x + 34, sp.y + 26, "第一关 · 黑雨死巷", style(36, "#ffe9a8", 6)).setDepth(11);
    this.t.stageSub = this.add.text(sp.x + 36, sp.y + 70, "豆奶出没 · 奶豪守关", style(24, "#9fb6e0", 4)).setDepth(11);
    const ny = sp.y + 150;
    const nx = [sp.x + 70, sp.x + 192, sp.x + 314];
    const line = this.add.graphics().setDepth(10.5);
    line.lineStyle(4, 0x4a6aa8, 1).lineBetween(nx[0], ny, nx[2], ny);
    ["一", "二", "王"].forEach((s, i) => {
      this.nodes.push(this.add.image(nx[i], ny, "ui_nodes", 0).setDepth(11));
      this.nodeLabels.push(this.add.text(nx[i], ny, s, style(24, "#c8d4f0", 4)).setOrigin(0.5).setDepth(12));
    });

    // ── 右上：连击 / 大招面板 ──
    const cpW = ui.comboPanel.w!;
    const cp = { x: W - M - cpW, y: M - 6 };
    this.add.image(cp.x, cp.y, "ui_comboPanel").setOrigin(0).setDepth(10);
    this.comboDigits = this.add.container(cp.x + cpW / 2, cp.y + 60).setDepth(11);
    this.t.comboLbl = this.add.text(cp.x + cpW / 2, cp.y + 98, "连击", style(24, "#ffd9a0", 4)).setOrigin(0.5, 0).setDepth(11);
    const eg = { x: cp.x + 46, y: cp.y + 130, w: cpW - 92, h: 14 };
    this.add.rectangle(eg.x - 3, eg.y - 3, eg.w + 6, eg.h + 6, 0x070b16, 1).setOrigin(0).setStrokeStyle(2, 0x5a7ab8).setDepth(10.2);
    this.energyBar = new GrooveBar(this, eg.x, eg.y, eg.w, eg.h, "ui_fillEnergy");
    this.t.energy = this.add.text(cp.x + 46, eg.y + 20, "奶狗冲锋", style(24, "#9feaff", 4)).setDepth(11);
    this.t.energyNum = this.add.text(cp.x + cpW - 46, eg.y + 20, "0%", style(24, "#ffffff", 4)).setOrigin(1, 0).setDepth(11);
    // 提示放在画面下方正中（左右两角是血条和目标框），长句也放得下
    this.t.hint = this.add.text(W / 2, 925, "", style(30, "#ffd27d", 6)).setOrigin(0.5, 0).setDepth(11);

    // ── 左下：头像 + 奶察血条 ──
    const hp = ui.hpFrame;
    const hk = 1.3;
    const pY = H - M - 128;
    this.add.image(M, pY, "ui_portraitNc").setOrigin(0).setDepth(10);
    const fx = M + 136;
    const fy = H - M - 64 - (hp.h! * hk) / 2;
    this.add.image(fx, fy, "ui_hpFrame").setOrigin(0).setScale(hk).setDepth(11);
    const [gx, gy, gw, gh] = hp.groove!;
    this.hpBar = new GrooveBar(this, fx + gx * hk, fy + gy * hk, gw * hk, gh * hk, "ui_fillHp");
    this.t.hpLbl = this.add.text(fx + gx * hk, fy - 6, "气血", style(24, "#ffe0b0", 5)).setOrigin(0, 1).setDepth(11);
    this.t.hpNum = this.add.text(fx + (gx + gw) * hk, fy - 6, "", style(24, "#ffffff", 5)).setOrigin(1, 1).setDepth(11);

    // ── 中上：Boss 血条 ──
    const bf = ui.bossFrame;
    const bk = 1.35;
    const bx = W / 2 - (bf.w! * bk) / 2;
    const by = M + 2;
    this.bossGroup = this.add.container(0, 0).setDepth(10).setAlpha(0);
    this.bossGroup.add(this.add.image(bx, by, "ui_bossFrame").setOrigin(0).setScale(bk));
    const [bgx, bgy, bgw, bgh] = bf.groove!;
    this.bossBar = new GrooveBar(this, bx + bgx * bk, by + bgy * bk, bgw * bk, bgh * bk, "ui_fillHp");
    this.bossBar.setVisible(false);
    this.bossMarks = this.add.graphics().setDepth(11);
    for (const p of [BOSS.phases.p2, BOSS.phases.p3]) {
      this.bossMarks.fillStyle(0xffffff, 0.9).fillRect(bx + (bgx + bgw * p) * bk - 2, by + bgy * bk - 4, 4, bgh * bk + 8);
    }
    this.bossMarks.setVisible(false);
    this.t.bossName = this.add.text(W / 2, by + bf.h! * bk + 4, "奶豪", style(36, "#e2b8ff", 6)).setOrigin(0.5, 0).setDepth(11).setAlpha(0);
    this.bossIcons = [0, 1, 2].map((f) => this.add.image(0, by + bf.h! * bk + 24, "ui_bossIcons", f).setDepth(11).setVisible(false));

    // ── 右下：目标提示 ──
    const gb = ui.goalBar;
    const gbx = W - M - gb.w!;
    const gby = H - M - gb.h!;
    this.add.image(gbx, gby, "ui_goalBar").setOrigin(0).setDepth(10);
    this.t.goal = this.add.text(gbx + 36, gby + gb.h! / 2, "", style(24, "#ffffff", 4)).setOrigin(0, 0.5).setDepth(11);
    this.goArrow = this.add.sprite(gbx + gb.w! - 64, gby + gb.h! / 2, "ui_goArrow", 0).setDepth(11).setScale(0.75).setVisible(false);
    this.goArrow.play("a_goArrow");

    // ── 其他文字 ──
    this.t.callout = this.add.text(W / 2, 250, "", style(48, "#ffffff", 8)).setOrigin(0.5).setDepth(20);
    this.t.controls = this.add
      .text(W / 2, 236, "A/D 移动 · Shift 跑 · W 跳 · J 轻击 · I 重击 · S 翻滚 · L 大招 · Esc 暂停", style(24, "#dfe6ff", 5))
      .setOrigin(0.5)
      .setDepth(11);
    this.t.tag = this.add.text(W / 2, H - 10, "F1 调试 · M 静音", style(24, "#8a8aa8", 4)).setOrigin(0.5, 1).setDepth(11);
    this.t.debug = this.add.text(M, 320, "", style(24, "#ffb347", 4)).setDepth(60);

    this.banner = this.add.container(W / 2, 360).setDepth(20).setAlpha(0);
    const bImg = this.add.image(0, 0, "ui_banner").setScale(0.9);
    const bText = this.add.text(0, -8, "", style(72, "#ffffff", 10)).setOrigin(0.5);
    const bSub = this.add.text(0, 112, "", style(36, "#ffffff", 6)).setOrigin(0.5);
    this.banner.add([bImg, bText, bSub]);
    this.panel = this.add.container(W / 2, H / 2).setDepth(40).setVisible(false);

    // ── events ──
    const on = (ev: string, fn: (...a: never[]) => void) => {
      this.stage.events.on(ev, fn, this);
      this.listeners.push([ev, fn]);
    };
    on("banner", (d: { text: string; sub?: string; color?: string }) => this.showBanner(d.text, d.sub ?? "", d.color ?? "#ffffff"));
    on("callout", (s: string) => this.showCallout(s));
    on("hint", (s: string) => {
      this.t.hint.setText(s);
      this.hintT = Math.max(80, s.length * 9); // 句子越长停得越久
    });
    on("rain", (v: number) => (this.rainTarget = v));
    on("coderain", (v: boolean) => (this.codeOn = v));
    on("flash", (ticks: number) => {
      this.flash.setFillStyle(0xffffff).setAlpha(1);
      this.tweens.add({ targets: this.flash, alpha: 0, duration: (ticks / 60) * 1000 + 160 });
    });
    on("superflash", () => {
      this.dim.setAlpha(0.55);
      this.tweens.add({ targets: this.dim, alpha: 0, duration: 420, delay: 180 });
      this.flash.setFillStyle(0xffe27a).setAlpha(0.35);
      this.tweens.add({ targets: this.flash, alpha: 0, duration: 200 });
    });
    on("wave", (d: { label: string; index: number; total: number }) => {
      this.waveInfo = d;
      this.goT = 0;
      this.showBanner(d.label, "清掉所有敌人才能前进", "#ff9ec4");
    });
    on("waveClear", (d: { index: number; last: boolean }) => {
      this.waveInfo = null;
      this.cleared = d.index;
      this.showCallout(d.last ? "清场！前方 Boss" : "清场！");
      this.goT = 360;
    });
    on("bossIntro", () => {
      this.bossActive = true;
      this.bossShown = 0;
      this.goT = 0;
    });
    on("bossPhase", (ph: number) => (this.bossPhase = ph));
    on("gameover", (d: { left: number }) => this.showKO(d.left));
    on("continue", () => {
      this.panel.setVisible(false);
      this.bossPhase = 1;
      this.hpBar.reset();
      this.bossBar.reset();
    });
    on("pause", (p: boolean) => (p ? this.showPause() : this.panel.setVisible(false)));
    on("victory", (d: { timeMs: number; maxCombo: number; damageTaken: number; continues: number }) => this.showVictory(d));
    this.events.once("shutdown", () => {
      for (const [ev, fn] of this.listeners) this.stage.events.off(ev, fn, this);
      this.listeners = [];
    });
  }

  private showBanner(text: string, sub: string, color: string) {
    const [, bText, bSub] = this.banner.list as Phaser.GameObjects.Text[];
    bText.setText(text).setColor(color);
    bSub.setText(sub);
    this.tweens.killTweensOf(this.banner);
    this.banner.setAlpha(0).setScale(1.3);
    this.tweens.add({ targets: this.banner, alpha: 1, scale: 1, duration: 180, ease: "Back.easeOut" });
    this.tweens.add({ targets: this.banner, alpha: 0, duration: 380, delay: 1500 });
  }

  private showCallout(s: string) {
    const c = this.t.callout;
    c.setText(s).setAlpha(1).setScale(1.4);
    this.tweens.killTweensOf(c);
    this.tweens.add({ targets: c, scale: 1, duration: 140, ease: "Back.easeOut" });
    this.tweens.add({ targets: c, alpha: 0, duration: 300, delay: 900 });
  }

  private makePanel(header: string, lines: string[], buttons: string[]) {
    this.panel.removeAll(true);
    this.panel.add(this.add.image(0, 0, "ui_panel"));
    const top = -200;
    const head = this.add.image(0, top + 20, header).setOrigin(0.5, 0);
    head.setScale(Math.min(1, 560 / head.width, 170 / head.height));
    this.panel.add(head);
    let y = top + 20 + head.displayHeight + 16;
    for (const l of lines) {
      this.panel.add(this.add.text(0, y, l, style(36, "#e8eeff", 5)).setOrigin(0.5, 0));
      y += 46;
    }
    y += 10;
    buttons.forEach((b, i) => {
      this.panel.add(this.add.image(0, y + 36, "ui_buttons", i === 0 ? 1 : 0).setScale(0.9));
      this.panel.add(this.add.text(0, y + 36, b, style(24, i === 0 ? "#ffffff" : "#b8c8ec", 4)).setOrigin(0.5));
      y += 74;
    });
    this.panel.setVisible(true).setAlpha(0).setScale(0.9);
    this.tweens.add({ targets: this.panel, alpha: 1, scale: 1, duration: 220, ease: "Back.easeOut" });
  }

  private showKO(left: number) {
    this.makePanel("ui_koWord", [left < 0 ? "Continue：无限" : `剩余 Continue：${left}`], ["Enter / J  从检查点继续", "R  重开本关", "T  回到标题"]);
  }

  private showPause() {
    this.makePanel("ui_logo", ["暂停中"], ["Esc / P  继续", "R  重开本关", "T  回到标题"]);
  }

  private showVictory(d: { timeMs: number; maxCombo: number; damageTaken: number; continues: number }) {
    const s = Math.round(d.timeMs / 1000);
    // 评价：2:30 内通关不扣时间分；每 25 点伤害扣 1 分；每次 Continue 扣 25 分；最高连击最多加 15 分
    const score = 100 - Math.max(0, s - 150) / 6 - d.damageTaken / 25 - d.continues * 25 + Math.min(15, d.maxCombo / 2);
    const grade = score >= 95 ? "S" : score >= 80 ? "A" : score >= 60 ? "B" : "C";
    this.makePanel(
      "ui_clearWord",
      [`评价  ${grade}`, `用时 ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}  ·  最高连击 ${d.maxCombo}`, `承受伤害 ${d.damageTaken}  ·  Continue ${d.continues} 次`],
      ["Enter / J  查看署名", "T  回到标题"],
    );
  }

  private setCombo(n: number) {
    if (n === this.comboShown) return;
    const grew = n > this.comboShown;
    this.comboShown = n;
    const c = this.comboDigits;
    c.removeAll(true);
    const s = String(n);
    const k = 0.85;
    s.split("").forEach((d, i) => {
      c.add(this.add.image((i - (s.length - 1) / 2) * 58 * k, 0, "ui_comboDigits", Number(d)).setScale(k));
    });
    c.setAlpha(n > 0 ? 1 : 0.35);
    if (grew && n > 1) {
      this.tweens.killTweensOf(c);
      c.setScale(1.35);
      this.tweens.add({ targets: c, scale: 1, duration: 140, ease: "Back.easeOut" });
    }
  }

  update(_time: number, delta: number) {
    const st = this.stage;
    if (!st || !st.player) return;
    this.elapsed += delta;
    const p = st.player;
    const dt = delta / 1000;

    // 奶察
    this.hpBar.set(p.hp / p.maxHp, dt);
    this.t.hpNum.setText(`${Math.ceil(p.hp)} / ${p.maxHp}`);
    const en = p.energy / BAL.player.energyMax;
    this.energyBar.set(en, dt * 10);
    const full = en >= 1;
    this.t.energyNum.setText(full ? "就绪 L" : `${Math.floor(p.energy)}%`).setColor(full ? (Math.floor(this.elapsed / 250) % 2 ? "#fff27a" : "#ffffff") : "#ffffff");
    if (this.hintT > 0 && --this.hintT === 0) this.t.hint.setText("");
    this.setCombo(p.combo);

    // 关卡节点：0 未到达 · 1 当前 · 2 已完成
    const stageIdx = this.bossActive ? 2 : this.waveInfo ? this.waveInfo.index - 1 : this.cleared;
    this.nodes.forEach((n, i) => {
      const state = i < stageIdx || (i === 2 && st.boss?.dead) ? 2 : i === stageIdx ? 1 : 0;
      n.setFrame(state);
      this.nodeLabels[i].setVisible(state !== 2).setColor(state === 1 ? "#3a2400" : "#8090b0");
    });

    // 目标提示
    const goal =
      this.waveInfo ? `清光敌人 · 剩余 ${st.aliveEnemies() + st.director.pendingCount}` :
      this.bossActive ? (st.boss?.dead ? "奶豪已倒下！" : "击败奶豪") :
      this.cleared >= 2 ? "向右前进 · 网咖门口有动静" : "向右前进";
    this.t.goal.setText(goal);
    if (this.goT > 0) this.goT--;
    this.goArrow.setVisible(!this.waveInfo && !this.bossActive && (this.goT > 0 || this.elapsed < 6000));

    // Boss
    const b = st.boss;
    if (b && this.bossActive) {
      // 奶豪倒下后约 1.5 秒内淡出 Boss 血条，不和通关面板叠在一起
      this.bossShown = b.dead ? Math.max(0, this.bossShown - dt * 0.7) : Math.min(1, this.bossShown + dt * 2);
      this.bossGroup.setAlpha(this.bossShown);
      this.t.bossName.setAlpha(this.bossShown).setText(`奶豪${b.skillName ? " · " + b.skillName : ""}`);
      this.bossBar.setVisible(this.bossShown > 0.5);
      this.bossMarks.setVisible(this.bossShown > 0.5);
      this.bossBar.set(b.hp / b.maxHp, dt);
      const nameRight = W / 2 + this.t.bossName.width / 2 + 28;
      this.bossIcons[0].setVisible(this.bossPhase === 2).setX(nameRight);
      this.bossIcons[1].setVisible(this.bossPhase >= 3).setX(nameRight);
      this.bossIcons[2].setVisible(b.armor).setX(nameRight + 44);
      this.t.controls.setAlpha(0);
    } else {
      this.bossGroup.setAlpha(0);
      this.bossBar.setVisible(false);
      this.bossMarks.setVisible(false);
      this.t.bossName.setAlpha(0);
      for (const i of this.bossIcons) i.setVisible(false);
      this.t.controls.setAlpha(this.elapsed < 14000 ? 1 : Math.max(0, 1 - (this.elapsed - 14000) / 1500));
    }

    this.updateRain(dt);
    this.updateCodeRain(dt);
    this.t.debug.setText(st.debug ? ["调试 F1 · 绿框=受击框 红框=攻击判定", ...(placeholderList().length ? ["PLACEHOLDER：", ...placeholderList().map((s) => " · " + s)] : ["PLACEHOLDER：无"])].join("\n") : "");
  }

  private updateRain(dt: number) {
    this.rainLevel += (this.rainTarget - this.rainLevel) * Math.min(1, dt * 2);
    this.rainBack.tilePositionY -= dt * 900;
    this.rainBack.tilePositionX += dt * 150;
    this.rainFront.tilePositionY -= dt * 1500;
    this.rainFront.tilePositionX += dt * 260;
    this.rainBack.setAlpha(0.15 + this.rainLevel * 0.45);
    this.rainFront.setAlpha(0.08 + this.rainLevel * 0.42);
  }

  /** 黑客屏：全屏绿码雨（程序生成）+ Boss 周围的伤害区更亮。 */
  private updateCodeRain(dt: number) {
    const target = this.codeOn ? 1 : 0;
    const a = this.codeImg.alpha + (target * 0.6 - this.codeImg.alpha) * Math.min(1, dt * 6);
    this.codeImg.setAlpha(a);
    if (a < 0.02) return;
    if (++this.codeTick % 2) return;
    const ctx = this.codeTex.getContext();
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(0, 0, 480, 270);
    ctx.globalCompositeOperation = "source-over";
    ctx.font = "bold 9px monospace";
    const st = this.stage;
    const cam = st.cameras.main.worldView;
    let zone: [number, number] | null = null;
    if (st.boss && st.boss.state === "hack") {
      const r = BOSS.terminal.hack.radius;
      const k = 480 / VIEW_W;
      zone = [(st.boss.x - r - cam.x) * k, (st.boss.x + r - cam.x) * k];
      ctx.fillStyle = "rgba(40,255,120,0.10)";
      ctx.fillRect(zone[0], 0, zone[1] - zone[0], 270);
    }
    const glyphs = "01アイウエオカキ装逼ﾊｯｶｰsudo$#";
    for (let i = 0; i < this.codeCols.length; i++) {
      const x = i * 8;
      this.codeCols[i] += 1 + (i % 3) * 0.5;
      const y = (this.codeCols[i] * 9) % 300;
      const inZone = zone && x > zone[0] && x < zone[1];
      ctx.fillStyle = inZone ? "#c8ffd0" : "#3dff7a";
      ctx.fillText(glyphs[Math.floor(Math.random() * glyphs.length)], x, y);
    }
    this.codeTex.refresh();
  }
}
