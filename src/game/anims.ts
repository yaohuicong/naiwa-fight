import type Phaser from "phaser";
import { BAL } from "./config";

/** Set at boot: Canvas renderer has no tint/gradients, so a few things use fallbacks. */
export const render = { canvas: false };

/** White silhouette of a strip (Canvas-mode hit flash), built lazily. */
export function whiteTex(scene: Phaser.Scene, key: string): string {
  const wk = key + "_w";
  if (scene.textures.exists(wk)) return wk;
  const src = scene.textures.get(key).getSourceImage() as HTMLImageElement;
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  const m = manifest[key];
  scene.textures.addSpriteSheet(wk, c as unknown as HTMLImageElement, { frameWidth: m.frameWidth, frameHeight: m.frameHeight });
  return wk;
}

/** Vertical gradient as a texture (works in both renderers). */
export function gradientTex(scene: Phaser.Scene, key: string, top: string, bottom: string, w = 1920, h = 1080): string {
  if (scene.textures.exists(key)) return key;
  const t = scene.textures.createCanvas(key, w, h)!;
  const ctx = t.getContext();
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  t.refresh();
  return key;
}

/** Sprite strip metadata written by tools/build_sprites.py. */
export interface StripMeta {
  frames: number;
  frameWidth: number;
  frameHeight: number;
  originY: number;
  refHeight: number;
  placeholder?: string;
  fxCenter?: [number, number];
}

export interface AnimDef {
  tex: string;
  frames: number[];
  dur: number; // ticks per frame
  loop?: boolean;
  /** Missing art covered by other frames — shown in the debug overlay and boot log. */
  placeholder?: string;
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

export const ANIMS: Record<string, AnimDef> = {
  // 奶察
  nc_idle: { tex: "nc_idle", frames: range(6), dur: 8, loop: true },
  nc_walk: { tex: "nc_walk", frames: range(8), dur: 6, loop: true },
  nc_run: { tex: "nc_run", frames: range(8), dur: 4, loop: true },
  // 跳跃 v2：下蹲蓄力 → 起跳 → 空中收腿 → 顶点 → 下落 → 落地缓冲
  nc_jump_up: { tex: "nc_jump", frames: [0, 1, 2, 3], dur: 4 },
  nc_jump_fall: { tex: "nc_jump", frames: [4], dur: 8 },
  nc_land: { tex: "nc_jump", frames: [5], dur: 6 },
  nc_hurt: { tex: "nc_hurt", frames: [0, 1, 2, 3], dur: 4 },
  nc_down: { tex: "nc_down", frames: range(6), dur: 4 },
  nc_lie: { tex: "nc_down", frames: [5], dur: 99 },
  nc_getup: { tex: "nc_getup", frames: range(5), dur: 6 },
  // KO v2：8 帧连贯倒地
  nc_ko: { tex: "nc_ko", frames: range(8), dur: 7 },
  nc_win: { tex: "nc_win", frames: range(6), dur: 9, loop: true },
  nc_laugh: { tex: "nc_laugh", frames: range(8), dur: 6, loop: true },
  // 豆奶
  dn_idle: { tex: "dn_idle", frames: range(4), dur: 9, loop: true },
  dn_walk: { tex: "dn_walk", frames: range(8), dur: 6, loop: true },
  dn_hurt: { tex: "dn_hurt", frames: [0, 1, 2], dur: 5 },
  dn_death: { tex: "dn_death", frames: range(7), dur: 6 },
  dn_mic: { tex: "dn_mic", frames: range(4), dur: 4, loop: true },
  // 精锐近战（叉腰奶兵）
  ml_idle: { tex: "ml_idle", frames: range(6), dur: 9, loop: true },
  ml_walk: { tex: "ml_walk", frames: range(8), dur: 6, loop: true },
  // 受击 v2 第 2 帧是大幅后仰腾空，只在被打飞时用（见 enemies.ts）
  ml_hurt: { tex: "ml_hurt", frames: [0, 1, 3], dur: 5 },
  ml_launch: { tex: "ml_hurt", frames: [2], dur: 99 },
  ml_death: { tex: "ml_death", frames: range(6), dur: 6 },
  // 奶豪
  nc_jattack: { tex: "nc_jattack", frames: range(4), dur: 6 },
  nc_dodge: { tex: "nc_dodge", frames: range(6), dur: 5 },
  nh_idle: { tex: "nh_idle", frames: range(6), dur: 8, loop: true },
  nh_walk: { tex: "nh_walk", frames: range(8), dur: 6, loop: true },
  nh_run: { tex: "nh_run", frames: range(8), dur: 4, loop: true },
  nh_hurt: { tex: "nh_hurt", frames: range(4), dur: 5 },
  nh_down: { tex: "nh_down", frames: range(6), dur: 5 },
  nh_lie: { tex: "nh_down", frames: [5], dur: 99 },
  nh_getup: { tex: "nh_getup", frames: range(5), dur: 7 },
  // KO：被打飞翻滚（0–4）落地后接 nh_ko_end：冒星星 → 发懵 → 躺平
  nh_ko: { tex: "nh_ko", frames: range(5), dur: 6 },
  nh_ko_end: { tex: "nh_ko", frames: [5, 5, 5, 6, 6, 7], dur: 12 },
  nh_charge: { tex: "nh_charge", frames: range(8), dur: 6 },
  nh_win: { tex: "nh_win", frames: range(6), dur: 10, loop: true },
  // 独舞 v2：第 3、11 帧脚下溅水花 = 踩出水波的两拍（间隔 64 / 128 tick）
  nh_dance: { tex: "nh_dance", frames: range(24), dur: 8, loop: true },
  nh_type: { tex: "nh_type", frames: range(16), dur: 6.75, loop: true },
  nh_hack: { tex: "nh_hack", frames: range(12), dur: 11, loop: true },
  nh_hole: { tex: "nh_hole", frames: range(12), dur: 17.5 },
};

let manifest: Record<string, StripMeta> = {};
export function setManifest(m: Record<string, StripMeta>) {
  manifest = m;
}
export function meta(tex: string): StripMeta {
  return manifest[tex];
}

/** Scale that makes this strip's upright body match the character's target height. */
export function scaleFor(tex: string, mult = 1): number {
  const m = manifest[tex];
  const prefix = tex.slice(0, 2) as keyof typeof BAL.heights;
  const target = tex === "dn_mic" ? 44 : BAL.heights[prefix];
  return (target / m.refHeight) * mult;
}

export function placeholderList(): string[] {
  const list = Object.values(ANIMS)
    .filter((a) => a.placeholder)
    .map((a) => a.placeholder as string);
  for (const [k, m] of Object.entries(manifest)) {
    if (m.placeholder === "hoodie-refill") list.push(`${k}: 云盘帧帽衫被抠空 → 程序补黑`);
  }
  return [...new Set(list)];
}
