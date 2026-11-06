import Phaser from "phaser";
import { Actor } from "../game/actor";
import { placeholderList } from "../game/anims";
import { AudioBus } from "../game/audio";
import { Boss } from "../game/boss";
import { Combat, Feel } from "../game/combat";
import { BAL, BOSS, GROUND_Y, TICK_MS, VIEW_H, VIEW_W, WAVES } from "../game/config";
import { Director } from "../game/director";
import { Dounai, Melee, Mic } from "../game/enemies";
import { Fx } from "../game/fx";
import { Input } from "../game/input";
import { Player } from "../game/player";
import { Breakable, Item, Pickup } from "../game/props";
import { StageArt } from "../game/stageArt";
import { DISPLAY } from "../game/assets";
import type { World } from "../game/world";

type Mode = "play" | "gameover" | "victory";

export class StageScene extends Phaser.Scene implements World {
  fx!: Fx;
  feel!: Feel;
  audio!: AudioBus;
  controls!: Input;
  combat!: Combat;
  player!: Player;
  enemies: Actor[] = [];
  boss: Boss | null = null;
  mics: Mic[] = [];
  props: Breakable[] = [];
  pickups: Pickup[] = [];
  director!: Director;
  bounds = { left: 0, right: WAVES.levelWidth };
  tick = 0;
  debug = false;
  paused = false;
  mode: Mode = "play";
  continuesUsed = 0;
  stats = { timeMs: 0 };
  private acc = 0;
  private camX = 0;
  private throwToken = 0;
  private victoryT = -1;
  private startTime = 0;
  private art!: StageArt;
  private debugG!: Phaser.GameObjects.Graphics;
  private debugTexts: Phaser.GameObjects.Text[] = [];
  private introSpawned = false;

  constructor() {
    super("Stage");
  }

  create() {
    this.enemies = [];
    this.mics = [];
    this.props = [];
    this.pickups = [];
    this.introSpawned = false;
    this.boss = null;
    this.tick = 0;
    this.acc = 0;
    this.paused = false;
    this.mode = "play";
    this.victoryT = -1;
    this.throwToken = 0;
    this.debugTexts = [];
    this.startTime = this.time.now;

    const cam = this.cameras.main;
    cam.setZoom(2 * DISPLAY.res);
    cam.setBackgroundColor("rgba(0,0,0,0)");

    this.art = new StageArt(this);
    this.controls = new Input(this);
    this.audio = new AudioBus(this);
    this.feel = new Feel();
    this.fx = new Fx(this);
    this.combat = new Combat(this);
    this.director = new Director(this);
    this.player = new Player(this, WAVES.playerStartX);
    // 调试入口：?start=w2 / ?start=boss 直接跳到第二波或 Boss
    const start = new URLSearchParams(location.search).get("start");
    if (start === "w2" || start === "boss") {
      this.director.nextWave = start === "boss" ? WAVES.waves.length : 1;
      this.director.leftLimit = start === "boss" ? WAVES.waves[1].lock[0] : WAVES.waves[0].lock[0];
      this.player.x = start === "boss" ? WAVES.boss.trigger + 10 : WAVES.waves[1].trigger + 10;
      this.player.energy = 100;
    }
    for (const b of BAL.props.breakables) this.props.push(new Breakable(this, b.x, b.kind as 0 | 1, b.drop as Item | null));
    // 跳关调试时不放开场的两个豆奶
    if (start === "w2" || start === "boss") this.introSpawned = true;
    // 每波清场掉一杯奶茶（落在玩家前方）
    this.events.on("waveClear", (d: { index: number }) => {
      const item = BAL.props.waveDrops[d.index - 1];
      if (item !== undefined && item !== null) this.spawnPickup(item as Item, this.player.x + this.player.facing * 70);
    });
    this.bounds = this.director.bounds;
    this.camX = Phaser.Math.Clamp(this.player.x, VIEW_W / 2, WAVES.levelWidth - VIEW_W / 2);
    this.debugG = this.add.graphics().setDepth(100);

    if (!this.scene.isActive("Backdrop")) this.scene.launch("Backdrop");
    this.scene.sendToBack("Backdrop");
    if (this.scene.isActive("UI")) this.scene.stop("UI");
    this.scene.launch("UI");
    this.scene.bringToTop("UI");

    const kb = this.input.keyboard!;
    kb.on("keydown-R", this.onRestartKey, this);
    kb.on("keydown-T", this.onTitleKey, this);
    kb.on("keydown-M", this.onMuteKey, this);
    this.events.once("shutdown", () => {
      this.audio.dispose();
      kb.off("keydown-R", this.onRestartKey, this);
      kb.off("keydown-T", this.onTitleKey, this);
      kb.off("keydown-M", this.onMuteKey, this);
    });

    const ph = placeholderList();
    if (ph.length) console.info("[奶娃格斗] PLACEHOLDER:", ph);
    this.audio.music(this.director.phase === "boss" ? "bgm_boss" : "bgm_alley");
  }

  get stage(): Phaser.Scene {
    return this;
  }

  private onRestartKey() {
    if (this.paused || this.mode !== "play") this.scene.restart();
  }

  private onTitleKey() {
    if (this.paused || this.mode !== "play") this.gotoScene("Title");
  }

  private onMuteKey() {
    this.sound.mute = !this.sound.mute;
    this.events.emit("hint", this.sound.mute ? "已静音（M）" : "声音开启（M）");
  }

  gotoScene(key: string) {
    this.audio.stopLoops();
    this.sound.stopAll();
    this.scene.stop("UI");
    this.scene.stop("Backdrop");
    this.scene.start(key);
  }

  // ── World API ──
  emit(event: string, data?: unknown) {
    if (event === "bossPhase") {
      const ph = data as number;
      this.events.emit("banner", { text: `PHASE ${ph}`, sub: ph === 2 ? "独舞 ↔ 终端装逼 交替" : "终端装逼 优先！", color: ph === 3 ? "#ff6b6b" : "#ffd84a" });
      if (BOSS.reinforce.enabled && ph === BOSS.reinforce.atPhase && this.director.lock) {
        this.director.queue(BOSS.reinforce.spawns, this.director.lock);
        this.events.emit("callout", "豆奶援军！");
      }
      this.events.emit("bossPhase", ph);
      return;
    }
    if (event === "wave") this.audio.sfx("sfx_wave", 0.6, 0);
    if (event === "bossReady") {
      this.events.emit("banner", { text: "BOSS · 奶豪", sub: "嘉豪人设 · 黑帽衫 AW", color: "#c77dff" });
    }
    this.events.emit(event, data);
  }

  spawnMinion(type: string, side: string, lock: number[]) {
    const right = side === "right";
    const x = right ? lock[1] + 40 : lock[0] - 40;
    const target = right ? lock[1] - 110 - Math.random() * 150 : lock[0] + 110 + Math.random() * 150;
    const e = type === "melee" ? new Melee(this, x, target) : new Dounai(this, x, target);
    this.enemies.push(e);
  }

  spawnPickup(item: Item, x: number) {
    const cx = Phaser.Math.Clamp(x, this.bounds.left + 30, this.bounds.right - 30);
    this.pickups.push(new Pickup(this, cx, item));
  }

  aliveEnemies() {
    return this.enemies.filter((e) => !e.dead).length;
  }

  spawnBoss() {
    this.boss?.destroy();
    this.boss = new Boss(this, WAVES.boss.spawnX, WAVES.boss.standX);
    this.audio.music("bgm_boss");
    this.audio.sfx("sfx_boss_intro", 0.8, 0);
    this.events.emit("bossIntro");
  }

  spawnMic(owner: Actor) {
    const t = BAL.dounai.throw;
    this.mics.push(new Mic(this, owner.x + owner.facing * 34, GROUND_Y - t.releaseHeight, owner.facing * t.speed));
  }

  claimThrow() {
    if (this.throwToken > 0) return false;
    this.throwToken = 34;
    return true;
  }

  attackersCount() {
    return this.enemies.filter((e) => e instanceof Melee && e.isAttacking).length;
  }

  onEnemyKilled(_a: Actor) {
    if (this.director.phase === "wave" && this.director.pendingCount === 0 && this.aliveEnemies() === 0) {
      this.feel.slowmo(BAL.feel.killSlowmoTicks, BAL.feel.killSlowmoScale);
    }
  }

  onPlayerKO() {
    if (this.mode !== "play") return;
    this.mode = "gameover";
    this.boss?.gloat();
    this.audio.stopLoops();
    this.audio.jingle("jingle_fail");
    const left = BAL.player.continues < 0 ? -1 : BAL.player.continues - this.continuesUsed;
    this.events.emit("gameover", { left });
  }

  onBossKO() {
    // Boss 倒下 → 场上残余小兵一起倒地
    for (const e of this.enemies) if (!e.dead) e.die(Math.sign(e.x - (this.boss?.x ?? e.x)) || 1);
    this.feel.slowmo(100, 0.3);
    this.fx.setRain(0.3);
    this.victoryT = 0;
    this.events.emit("callout", "K.O.！");
  }

  private continueGame() {
    const limit = BAL.player.continues;
    if (limit >= 0 && this.continuesUsed >= limit) return this.scene.restart();
    this.continuesUsed++;
    for (const e of this.enemies) e.destroy();
    for (const m of this.mics) m.destroy();
    this.enemies = [];
    this.mics = [];
    this.boss?.destroy();
    this.boss = null;
    this.fx.clearAll();
    this.audio.stopLoops();
    this.feel.hitstop = 0;
    this.feel.freeze = 0;
    const x = this.director.restart();
    this.bounds = this.director.bounds;
    this.player.respawn(x);
    this.audio.music(this.director.phase === "boss" ? "bgm_boss" : "bgm_alley");
    this.controls.clearBuffer();
    this.mode = "play";
    this.events.emit("continue");
  }

  private togglePause() {
    this.paused = !this.paused;
    this.events.emit("pause", this.paused);
    if (this.paused) this.sound.pauseAll();
    else this.sound.resumeAll();
  }

  // ── Loop ──
  update(time: number, delta: number) {
    this.controls.pollPad();
    for (const a of this.controls.drainPresses()) {
      if (a === "debug") this.debug = !this.debug;
      else if (a === "pause" && this.mode === "play") this.togglePause();
      else if ((a === "confirm" || a === "light") && this.mode === "gameover" && !this.paused) this.continueGame();
      else if ((a === "confirm" || a === "light") && this.mode === "victory" && this.victoryT > 200) this.gotoScene("Credits");
    }
    if (!this.paused) {
      this.acc += Math.min(delta, 100) * this.feel.timeScale();
      let n = 0;
      while (this.acc >= TICK_MS && n < 6) {
        this.acc -= TICK_MS;
        this.tickSim();
        n++;
      }
      if (this.mode === "play") this.stats.timeMs = time - this.startTime;
    }
    this.render(time);
  }

  private actors(): Actor[] {
    const list: Actor[] = [this.player, ...this.enemies];
    if (this.boss) list.push(this.boss);
    return list;
  }

  private tickSim() {
    this.tick++;
    this.feel.step();
    if (this.feel.hitstop > 0) {
      this.feel.hitstop--;
      for (const a of this.actors()) if (a.vibrate > 0) a.vibrate--;
      return;
    }
    for (const a of this.actors()) a.vibrate = 0;
    this.controls.step();
    if (this.throwToken > 0) this.throwToken--;
    this.bounds = this.director.bounds;

    if (this.feel.freeze > 0) {
      // 大招定格：只有奶察在动
      this.feel.freeze--;
      this.player.update();
      this.followCamera();
      return;
    }

    this.player.update();
    for (const e of this.enemies) e.update();
    this.boss?.update();
    this.separate();
    for (const m of this.mics) m.update();
    for (const b of this.props) b.update();
    for (const p of this.pickups) p.update();
    this.combat.resolve();
    this.fx.update();
    if (this.mode === "play") this.director.update(this.player.x);
    // 开场巷口：两个豆奶从右边进场（不锁屏），教玩家跳麦克风、打碎麦克风
    const intro = BAL.props.intro;
    if (!this.introSpawned && this.player.x > intro.trigger) {
      this.introSpawned = true;
      for (const s of intro.spawns) this.enemies.push(s.type === "melee" ? new Melee(this, s.x, s.target) : new Dounai(this, s.x, s.target));
      this.events.emit("hint", "豆奶扔麦克风：跳起来躲，或者一棍子打碎");
    }
    for (const b of this.props) if (b.gone) b.destroy();
    this.props = this.props.filter((b) => !b.gone);
    for (const p of this.pickups) if (p.taken) p.destroy();
    this.pickups = this.pickups.filter((p) => !p.taken);

    for (const e of this.enemies) if (e.removeMe) e.destroy();
    this.enemies = this.enemies.filter((e) => !e.removeMe);
    for (const m of this.mics) if (!m.alive) m.destroy();
    this.mics = this.mics.filter((m) => m.alive);

    if (this.victoryT >= 0) {
      this.victoryT++;
      if (this.victoryT === 110 && !this.player.dead) {
        this.player.victory();
        this.mode = "victory";
        this.audio.jingle("jingle_clear");
        this.events.emit("victory", {
          timeMs: this.stats.timeMs,
          maxCombo: this.player.maxCombo,
          damageTaken: this.player.damageTaken,
          continues: this.continuesUsed,
        });
      }
    }
    this.followCamera();
  }

  /** Keep bodies from stacking (soft push). */
  private separate() {
    const list = this.enemies.filter((e) => !e.dead && e.onGround && e.state !== "enter");
    if (this.boss && !this.boss.dead) list.push(this.boss);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const dx = b.x - a.x;
        const min = (a.hurtW + b.hurtW) * 0.6;
        if (Math.abs(dx) < min) {
          const push = ((min - Math.abs(dx)) / 2) * 0.3 * (Math.sign(dx) || (a.id < b.id ? 1 : -1));
          a.x -= push;
          b.x += push;
        }
      }
    }
  }

  private followCamera() {
    const b = this.bounds;
    const p = this.player;
    let target = p.x + p.facing * BAL.world.cameraLead;
    target = Phaser.Math.Clamp(target, b.left + VIEW_W / 2, b.right - VIEW_W / 2);
    this.camX += (target - this.camX) * BAL.world.cameraLerp;
  }

  private render(time: number) {
    for (const a of this.actors()) a.sync();
    for (const m of this.mics) m.sync();
    this.fx.draw(time);
    this.cameras.main.centerOn(this.camX + this.feel.shakeX, VIEW_H / 2 + this.feel.shakeY);
    this.art.update(this.camX, time, this.director.lock);
    this.drawDebug();
  }

  private drawDebug() {
    const g = this.debugG;
    g.clear();
    for (const t of this.debugTexts) t.setVisible(false);
    if (!this.debug) return;
    let i = 0;
    const label = (x: number, y: number, s: string, color = "#ffffff") => {
      let t = this.debugTexts[i];
      if (!t) {
        t = this.add.text(0, 0, "", { fontFamily: "monospace", fontSize: "9px", color, backgroundColor: "#000000aa" }).setResolution(2).setDepth(101).setOrigin(0.5, 1);
        this.debugTexts.push(t);
      }
      t.setText(s).setPosition(x, y).setColor(color).setVisible(true);
      i++;
    };
    for (const a of this.actors()) {
      const hb = a.hurtbox();
      g.lineStyle(1, a.invuln > 0 ? 0x5555ff : 0x44ff66, 1);
      g.strokeRect(hb.x, hb.y, hb.w, hb.h);
      for (const { hit } of a.activeHits()) {
        const b = a.hitbox(hit);
        g.fillStyle(0xff2244, 0.35);
        g.fillRect(b.x, b.y, b.w, b.h);
        g.lineStyle(1, 0xff2244, 1);
        g.strokeRect(b.x, b.y, b.w, b.h);
      }
      const ph = a.anim?.placeholder ? " [PLACEHOLDER]" : "";
      label(a.x, hb.y - 4, `${a.kind}:${a.state}${a.armor ? " 霸体" : ""}  ${Math.round(a.hp)}${ph}`, ph ? "#ffb347" : "#ffffff");
    }
    for (const m of this.mics) {
      const b = m.box();
      g.lineStyle(1, 0xff2244, 1);
      g.strokeRect(b.x, b.y, b.w, b.h);
    }
    if (this.boss && this.boss.state === "hack") {
      g.lineStyle(1, 0x55ff88, 0.8);
      g.strokeRect(this.boss.x - BOSS.terminal.hack.radius, GROUND_Y - 200, BOSS.terminal.hack.radius * 2, 200);
    }
    if (this.boss && this.boss.state === "hole") {
      const c = this.boss.holeCenter;
      g.lineStyle(1, 0x55ff88, 1);
      g.strokeCircle(c.x, c.y, BOSS.terminal.hole.coreRadius);
    }
    const lock = this.director.lock;
    if (lock) {
      g.lineStyle(1, 0xffff00, 0.6);
      g.strokeRect(lock[0], 0, lock[1] - lock[0], VIEW_H);
    }
  }
}
