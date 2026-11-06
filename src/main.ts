import Phaser from "phaser";
import { DISPLAY } from "./game/assets";
import { BackdropScene } from "./scenes/BackdropScene";
import { BootScene } from "./scenes/BootScene";
import { CreditsScene } from "./scenes/CreditsScene";
import { StageScene } from "./scenes/StageScene";
import { TitleScene } from "./scenes/TitleScene";
import { UIScene } from "./scenes/UIScene";

const hasWebGL = (() => {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
})();
DISPLAY.res = hasWebGL ? 1 : 0.5;

const game = new Phaser.Game({
  type: hasWebGL ? Phaser.WEBGL : Phaser.CANVAS,
  parent: "game",
  width: 1920 * DISPLAY.res,
  height: 1080 * DISPLAY.res,
  backgroundColor: "#0a0a12",
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true },
  fps: { target: 60 },
  scene: [BootScene, TitleScene, BackdropScene, StageScene, UIScene, CreditsScene],
});

(window as unknown as { game: Phaser.Game }).game = game;
