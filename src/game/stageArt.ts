import Phaser from "phaser";
import { stageOffset, WORLD_SCALE } from "./assets";
import { GROUND_Y, VIEW_W, WAVES } from "./config";

/**
 * 第一关「黑雨死巷」场景（Drive「奶娃/场景」）。
 * 4 段（A 巷口 / B 便利店 / C 后巷 / D 网咖门口）各占一屏（960 逻辑 px），波次与 Boss 锁屏正好对齐一段。
 * 视差：远景 0.15 · 中景 0.8（段间渐变衔接）· 雾 0.45 · 近景/地面/道具 1.0 · 前景 1.15。
 */
const SEG_W = VIEW_W;

interface Layer {
  c: Phaser.GameObjects.Container;
  f: number;
  drift?: number;
}

export class StageArt {
  private layers: Layer[] = [];
  private gates: Phaser.GameObjects.Sprite[] = [];
  private glows: Phaser.GameObjects.Image[] = [];

  constructor(scene: Phaser.Scene) {
    const s = scene;
    const S = WORLD_SCALE;
    const layer = (f: number, depth: number, drift?: number) => {
      const c = s.add.container(0, 0).setDepth(depth);
      this.layers.push({ c, f, drift });
      return c;
    };

    layer(0.15, -9).add(s.add.image(0, 0, "st_far").setOrigin(0).setScale(S));

    const mid = layer(0.8, -8);
    const at = (layer: "mid" | "near" | "front", i: number, x: number, y: number) => {
      const [ox, oy] = stageOffset(layer, i);
      return s.add.image(x + ox * S, y + oy * S, `st_${layer}_${i}`).setOrigin(0).setScale(S);
    };
    for (let i = 0; i < 4; i++) mid.add(at("mid", i, SEG_W * 0.8 * i, 0));

    const fog = layer(0.45, -7, 6);
    for (let i = 0; i < 4; i++) fog.add(s.add.image(SEG_W * i, 225, "st_fog").setOrigin(0).setScale(S).setAlpha(0.28));

    const near = layer(1, -6);
    for (let i = 0; i < 4; i++) near.add(at("near", i, SEG_W * i, 0));

    // 地面：960×180 平铺，从近景墙底（逻辑 y=450）铺到画面底
    s.add.tileSprite(0, 450, WAVES.levelWidth, 90, "st_ground").setOrigin(0).setTileScale(S).setDepth(-5);

    // 水坑（地面之上、影子之下）
    const puddles: [number, number, number][] = [
      [180, 492, 0], [700, 505, 2], [1260, 488, 1], [1690, 512, 0], [2150, 495, 2], [2620, 508, 1], [3080, 490, 0], [3500, 506, 2], [3760, 486, 1],
    ];
    for (const [x, y, f] of puddles) s.add.image(x, y, "st_puddles", f).setScale(S).setDepth(-4).setAlpha(0.85);

    // 路灯：放在段与段的接缝处，顺便遮住拼接线
    for (const x of [300, SEG_W, SEG_W * 2, SEG_W * 3]) {
      s.add.image(x, 458, "st_lamp").setOrigin(0.5, 515 / 560).setScale(S).setDepth(-3);
      const g = s.add.image(x + 2, 458 - 232, "st_lampGlow").setScale(S).setDepth(-3).setAlpha(0.55).setBlendMode(Phaser.BlendModes.ADD);
      this.glows.push(g);
    }

    // 霓虹招牌（4 帧闪烁）
    const neon: [string, number, number][] = [
      ["neonTea", SEG_W * 2 + 300, 236],
      ["neonShop", SEG_W + 470, 236],
      ["neonNet", SEG_W * 3 + 470, 220],
    ];
    for (const [k, x, y] of neon) s.add.sprite(x, y, `st_${k}`, 0).setScale(S).setDepth(-2).play(`a_${k}`);

    // 前景 v2：只占画面最下方 120px（角色脚底以下），比镜头快一点（1.15）经过，画在角色前面也不会挡人
    const front = layer(1.15, 29);
    for (let i = 0; i < 6; i++) front.add(at("front", 0, SEG_W * i, 0));

    for (let i = 0; i < 2; i++) {
      const g = s.add.sprite(0, GROUND_Y + 10, "st_gate", 0).setOrigin(0.5, 1).setScale(S).setDepth(6).setVisible(false);
      g.play("a_gate");
      this.gates.push(g);
    }
  }

  /** Position parallax layers from the camera's left edge (no shake). */
  update(camX: number, time: number, lock: number[] | null) {
    const left = camX - VIEW_W / 2;
    for (const l of this.layers) {
      l.c.x = left * (1 - l.f) - (l.drift ? ((time / 1000) * l.drift) % SEG_W : 0);
    }
    const flick = 0.5 + 0.08 * Math.sin(time / 90) + (Math.random() < 0.02 ? -0.2 : 0);
    for (const g of this.glows) g.setAlpha(flick);
    this.gates.forEach((g, i) => {
      g.setVisible(!!lock);
      if (lock) g.x = i === 0 ? lock[0] + 10 : lock[1] - 10;
    });
  }
}
