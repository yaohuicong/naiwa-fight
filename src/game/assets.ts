import Phaser from "phaser";

/** Pixel font (Fusion Pixel 12px, SIL OFL) — subset to the characters the game uses. */
export const PIXEL_FONT = "FusionPixel";
export const FONT_STACK = `${PIXEL_FONT}, PingFang SC, Microsoft YaHei, Noto Sans CJK SC, sans-serif`;

/**
 * Output resolution. WebGL renders the full 1920×1080; the Canvas fallback (no GPU, e.g. some embedded
 * browsers) renders 960×540 — scenes are still laid out in 1920×1080 units and cameras scale by `res`.
 */
export const DISPLAY = { res: 1 };

/** Point a screen-space scene camera (UI, title…) at the 1920×1080 layout. */
export function screenCam(scene: Phaser.Scene) {
  scene.cameras.main.setZoom(DISPLAY.res).centerOn(960, 540);
}

/** Art in the 2026-11-05 batch is authored for a 1920×1080 screen; the world is 960×540 (camera zoom 2). */
export const WORLD_SCALE = 0.5;

interface V2Meta {
  stage: Record<string, string | string[] | number[][]>;
  ui: Record<string, { url: string; w?: number; h?: number; frameWidth?: number; frameHeight?: number; groove?: number[] }>;
  fx: Record<string, { url: string; frameWidth?: number; frameHeight?: number; frames?: number; halfWidth?: number[] }>;
}

let v2: V2Meta;
export function v2meta() {
  return v2;
}

/** Top-left offset (1920×1080 px) of a cropped stage layer image. */
export function stageOffset(layer: "mid" | "near" | "front", i: number): [number, number] {
  const o = (v2.stage[layer + "Off"] as number[][] | undefined)?.[i];
  return o ? [o[0], o[1]] : [0, 0];
}

const SHEETS: Record<string, [number, number]> = {
  st_puddles: [300, 60],
  st_gate: [64, 420],
  st_neonTea: [320, 160],
  st_neonShop: [320, 160],
  st_neonNet: [320, 160],
  st_breakables: [200, 220],
  st_pickups: [120, 120],
};

/** Queue every asset listed in assets_v2.json (written by tools/build_stage.py). */
export function queueV2(scene: Phaser.Scene, meta: V2Meta) {
  v2 = meta;
  const L = scene.load;
  for (const [k, v] of Object.entries(meta.stage)) {
    if (k.endsWith("Off")) continue; // crop offsets, not files
    if (Array.isArray(v)) (v as string[]).forEach((url, i) => L.image(`st_${k}_${i}`, url));
    else if (SHEETS[`st_${k}`]) L.spritesheet(`st_${k}`, v as string, { frameWidth: SHEETS[`st_${k}`][0], frameHeight: SHEETS[`st_${k}`][1] });
    else L.image(`st_${k}`, v as string);
  }
  for (const [k, v] of Object.entries(meta.ui)) {
    if (v.frameWidth) L.spritesheet(`ui_${k}`, v.url, { frameWidth: v.frameWidth, frameHeight: v.frameHeight! });
    else L.image(`ui_${k}`, v.url);
  }
  for (const [k, v] of Object.entries(meta.fx)) {
    if (v.frameWidth) L.spritesheet(`fx_${k}`, v.url, { frameWidth: v.frameWidth, frameHeight: v.frameHeight! });
    else L.image(`fx_${k}`, v.url);
  }
}

/** Global (real-time) animations for FX / UI sprites. */
export function createV2Anims(scene: Phaser.Scene) {
  const A = scene.anims;
  const mk = (key: string, tex: string, frames: number[], frameRate: number, repeat = 0) => {
    if (!A.exists(key)) A.create({ key, frames: A.generateFrameNumbers(tex, { frames }), frameRate, repeat });
  };
  const r = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  mk("a_sparkLight", "fx_sparkLight", r(0, 5), 30);
  mk("a_sparkHeavy", "fx_sparkHeavy", r(0, 7), 26);
  mk("a_trailLight", "fx_trail", r(0, 3), 30);
  mk("a_trailHeavy", "fx_trail", r(4, 9), 28);
  mk("a_splash", "fx_splash", r(0, 5), 24);
  mk("a_dust", "fx_dust", r(0, 5), 20);
  mk("a_poof", "fx_poof", r(0, 7), 18);
  mk("a_micBreak", "fx_micBreak", r(0, 5), 24);
  mk("a_superReady", "fx_superReady", r(0, 7), 12, -1);
  mk("a_warnRing", "fx_warnRing", r(0, 5), 14, -1);
  mk("a_rainSplash", "fx_rainSplash", r(0, 7), 30);
  mk("a_gate", "st_gate", r(0, 5), 10, -1);
  const flicker = [0, 1, 0, 1, 0, 1, 2, 0, 1, 0, 1, 3, 0, 1];
  mk("a_neonTea", "st_neonTea", flicker, 6, -1);
  mk("a_neonShop", "st_neonShop", flicker.slice(3).concat(flicker.slice(0, 3)), 6, -1);
  mk("a_neonNet", "st_neonNet", flicker.slice(7).concat(flicker.slice(0, 7)), 6, -1);
  mk("a_goArrow", "ui_goArrow", [0, 1, 2, 1], 6, -1);
}

/** Play a one-shot FX sprite and destroy it when done. */
export function oneShot(scene: Phaser.Scene, x: number, y: number, tex: string, anim: string, scale = WORLD_SCALE, depth = 30) {
  const s = scene.add.sprite(x, y, tex, 0).setScale(scale).setDepth(depth);
  s.play(anim);
  s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.destroy());
  return s;
}
