import Phaser from "phaser";
import { screenCam, FONT_STACK } from "../game/assets";
import { padAnyPressed } from "../game/input";

const style = (size: number, color: string, stroke = 6): Phaser.Types.GameObjects.Text.TextStyle => ({
  fontFamily: FONT_STACK,
  fontSize: `${size}px`,
  color,
  stroke: "#05050c",
  strokeThickness: stroke,
  align: "center",
});

export class TitleScene extends Phaser.Scene {
  constructor() {
    super("Title");
  }

  create() {
    const W = 1920;
    screenCam(this);
    // 标题主视觉：雨夜巷口，奶察和奶豪对峙（人物画在图里，不再另放动画角色）
    this.add.image(0, 0, "ui_titleArt").setOrigin(0).setDisplaySize(W, 1080);
    const rain = this.add.tileSprite(0, 0, W, 1080, "fx_rainFront").setOrigin(0).setAlpha(0.3);
    this.events.on("update", (_t: number, dt: number) => {
      rain.tilePositionY -= dt * 1.4;
      rain.tilePositionX += dt * 0.25;
    });
    // 上下压暗，让 Logo 和文字从画面里跳出来
    this.add.rectangle(0, 0, W, 250, 0x05050c, 0.45).setOrigin(0);
    this.add.rectangle(0, 880, W, 200, 0x05050c, 0.7).setOrigin(0);

    const logo = this.add.image(W / 2, 128, "ui_logo").setScale(0.6);
    this.tweens.add({ targets: logo, y: 136, duration: 1800, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    this.add.text(W / 2, 252, "第一关 · 黑雨死巷", style(36, "#c9d6ff", 7)).setOrigin(0.5);
    const start = this.add.text(W / 2, 912, "点击 · 按 Enter / J · 手柄任意键 开始", style(44, "#ffffff", 8)).setOrigin(0.5);
    this.tweens.add({ targets: start, alpha: 0.3, duration: 600, yoyo: true, repeat: -1 });
    this.add
      .text(
        W / 2,
        962,
        [
          "A/D 移动 · Shift 跑 · W/空格 跳 · J 轻击（跑动中 J 冲刺）· I 重击 · S/↓ 翻滚（无敌）· L 大招 · ; 狂笑 · Esc 暂停 · M 静音",
          "手柄：A 跳 · X 轻击 · Y 重击 · B 大招 · LB 翻滚 · RB 跑 · Start 暂停　　C 查看署名",
        ].join("\n"),
        { ...style(22, "#dfe4ff", 5), lineSpacing: 10 },
      )
      .setOrigin(0.5, 0);

    const kb = this.input.keyboard!;
    let started = false;
    const go = () => {
      if (started) return;
      started = true;
      this.sound.play("sfx_ui", { volume: 0.5 });
      this.scene.start("Stage");
    };
    if (new URLSearchParams(location.search).get("start")) return go();
    // 点击也能开始：在网页内嵌框里先点一下才能收到键盘，浏览器也要求先交互才放声音
    this.input.once("pointerdown", go);
    const pad = { held: true };
    this.events.on("update", () => padAnyPressed(pad) && go());
    kb.once("keydown-ENTER", go);
    kb.once("keydown-J", go);
    kb.once("keydown-SPACE", go);
    kb.once("keydown-C", () => this.scene.start("Credits"));
  }
}
