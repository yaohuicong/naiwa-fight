import Phaser from "phaser";
import { render, setManifest, StripMeta } from "../game/anims";
import { screenCam, createV2Anims, PIXEL_FONT, queueV2 } from "../game/assets";
import { AUDIO_FILES } from "../game/audio";

/** Loads the sprite manifest, then every strip + 梗音. All assets come from Drive「奶娃」. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  preload() {
    this.load.json("manifest", "assets/sprites/manifest.json");
    this.load.json("assets_v2", "assets/assets_v2.json");
  }

  create() {
    screenCam(this);
    render.canvas = this.game.renderer.type === Phaser.CANVAS;
    console.info(`[Boot] 渲染器：${render.canvas ? "Canvas（WebGL 不可用，已回退）" : "WebGL"}`);
    const m = this.cache.json.get("manifest") as Record<string, StripMeta>;
    setManifest(m);
    for (const [k, v] of Object.entries(m)) {
      this.load.spritesheet(k, `assets/sprites/${k}.png`, { frameWidth: v.frameWidth, frameHeight: v.frameHeight });
    }
    for (const [k, v] of Object.entries(AUDIO_FILES)) this.load.audio(k, v.file);
    queueV2(this, this.cache.json.get("assets_v2"));

    const w = 1920;
    const h = 1080;
    const bar = this.add.rectangle(w / 2 - 400, h / 2, 0, 18, 0xffd84a).setOrigin(0, 0.5);
    this.add.rectangle(w / 2, h / 2, 804, 24).setStrokeStyle(2, 0x666688);
    const label = this.add.text(w / 2, h / 2 + 50, "加载中…", { fontFamily: "sans-serif", fontSize: "28px", color: "#ccccee" }).setOrigin(0.5);
    this.load.on("progress", (p: number) => {
      bar.width = 800 * p;
      label.setText(`加载中… ${Math.round(p * 100)}%`);
    });
    this.load.on("loaderror", (f: Phaser.Loader.File) => console.warn("[Boot] 加载失败", f.key, f.url));
    const font = document.fonts.load(`24px ${PIXEL_FONT}`).catch(() => undefined);
    this.load.once("complete", async () => {
      createV2Anims(this);
      await Promise.race([font, new Promise((r) => setTimeout(r, 3000))]);
      this.scene.start("Title");
    });
    this.load.start();
  }
}
