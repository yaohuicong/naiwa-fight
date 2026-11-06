import Phaser from "phaser";
import { screenCam, FONT_STACK } from "../game/assets";
import { padAnyPressed } from "../game/input";

/** Credits（PRD 附录 B）：角色 / 场景 / UI / VFX / 音频 / 字体署名。 */
export class CreditsScene extends Phaser.Scene {
  constructor() {
    super("Credits");
  }

  create() {
    const W = 1920;
    screenCam(this);
    this.add.image(0, 0, "st_sky").setOrigin(0);
    this.add.rectangle(0, 0, W, 1080, 0x05050c, 0.55).setOrigin(0);
    this.add.text(W / 2, 90, "署名 / Credits", { fontFamily: FONT_STACK, fontSize: "72px", color: "#ffd84a", stroke: "#000", strokeThickness: 8 }).setOrigin(0.5);
    const lines = [
      "角色、场景、UI、特效美术：奶娃项目原创（Google Drive「奶娃」）",
      "奶察 · 豆奶 · 精锐近战 · 奶豪，第一关「黑雨死巷」场景与 HUD",
      "",
      "VFX：PixelFX (patch-gg/pixelfx) — MIT：黑洞、漩涡、水波、雨溅",
      "SpritePilot Weather（雨丝、雨溅）— CC0 · OpenGameArt Whirlwind (n4) — CC0",
      "Plasma Electric / Gravity Burst (Reactorcore) — CC0 · Sprite Fusion（MIT 改编）",
      "",
      "BGM：Nighttime Solitude (celestialghost8) — CC0 · Game Emulation (iamoneabe) — CC0",
      "UI 音效：Kenney Interface Sounds — CC0 · 其余音效：本地合成",
      "奶察梗音：Diyeego/naiwa-pet 梗包（仅供本项目使用）",
      "",
      "字体：Fusion Pixel Font (TakWolf) — SIL Open Font License 1.1",
      "引擎：Phaser 3 (MIT) · 程序实现：Claude Code",
    ];
    this.add
      .text(W / 2, 190, lines.join("\n"), { fontFamily: FONT_STACK, fontSize: "36px", color: "#e6e6ff", align: "center", lineSpacing: 12, stroke: "#000", strokeThickness: 4 })
      .setOrigin(0.5, 0);
    this.add.text(W / 2, 1030, "点击 或 按 Enter / Esc 返回标题", { fontFamily: FONT_STACK, fontSize: "36px", color: "#9a9ac0" }).setOrigin(0.5);
    const back = () => this.scene.start("Title");
    this.input.once("pointerdown", back);
    const pad = { held: true };
    this.events.on("update", () => padAnyPressed(pad) && back());
    this.input.keyboard!.once("keydown-ENTER", back);
    this.input.keyboard!.once("keydown-ESC", back);
  }
}
