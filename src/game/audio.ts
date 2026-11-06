import Phaser from "phaser";

/**
 * AudioBus — 奶察梗音 VO (PRD §9.1) + SFX / BGM from Drive「奶娃/音频」(2026-11-05).
 * Missing keys are silent no-ops (logged once) so audio can never crash the game.
 */
export const AUDIO_FILES: Record<string, { file: string; drive: string }> = {
  vo_skill: { file: "assets/audio/vo_skill_andy.mp3", drive: "奶察-技能-安迪.mp3" },
  vo_laugh: { file: "assets/audio/vo_laugh_short.mp3", drive: "奶察-狂笑.wav（截取 1.65s 起 3.4s）" },
  vo_light: { file: "assets/audio/vo_light_gagadi.mp3", drive: "奶察-打斗-嘎嘎滴辣虾.mp3" },
  vo_heavy: { file: "assets/audio/vo_heavy_ora.mp3", drive: "奶察-打斗-欧拉.mp3" },
  vo_combo: { file: "assets/audio/vo_combo_gajiaosai.mp3", drive: "奶察-打斗-噶脚塞.mp3" },
  bgm_alley: { file: "assets/audio/bgm_alley.mp3", drive: "音频/BGM-巷战.mp3" },
  bgm_boss: { file: "assets/audio/bgm_boss.mp3", drive: "音频/BGM-Boss.mp3" },
  jingle_clear: { file: "assets/audio/jingle_clear.mp3", drive: "音频/JINGLE-过关.mp3" },
  jingle_fail: { file: "assets/audio/jingle_fail.mp3", drive: "音频/JINGLE-失败.mp3" },
  sfx_hit_light: { file: "assets/audio/sfx_hit_light.mp3", drive: "音频/SFX-轻击命中.wav" },
  sfx_hit_heavy: { file: "assets/audio/sfx_hit_heavy.mp3", drive: "音频/SFX-重击命中.wav" },
  sfx_swing: { file: "assets/audio/sfx_swing.mp3", drive: "音频/SFX-挥棍.wav" },
  sfx_hurt: { file: "assets/audio/sfx_hurt.mp3", drive: "音频/SFX-受击.wav" },
  sfx_jump: { file: "assets/audio/sfx_jump.mp3", drive: "音频/SFX-跳跃-落地.wav（前段）" },
  sfx_land: { file: "assets/audio/sfx_land.mp3", drive: "音频/SFX-跳跃-落地.wav（后段）" },
  sfx_enemy_down: { file: "assets/audio/sfx_enemy_down.mp3", drive: "音频/SFX-小兵倒地.wav" },
  sfx_mic: { file: "assets/audio/sfx_mic.mp3", drive: "音频/SFX-麦克风.wav" },
  sfx_ripple: { file: "assets/audio/sfx_ripple.mp3", drive: "音频/SFX-水波.wav" },
  sfx_typing: { file: "assets/audio/sfx_typing.mp3", drive: "音频/SFX-打字.wav" },
  sfx_hacker: { file: "assets/audio/sfx_hacker.mp3", drive: "音频/SFX-黑客噪音.wav" },
  sfx_blackhole: { file: "assets/audio/sfx_blackhole.mp3", drive: "音频/SFX-黑洞.wav" },
  sfx_wave: { file: "assets/audio/sfx_wave.mp3", drive: "音频/SFX-波次开始.wav" },
  sfx_boss_intro: { file: "assets/audio/sfx_boss_intro.mp3", drive: "音频/SFX-Boss登场.wav" },
  sfx_ui: { file: "assets/audio/sfx_ui.mp3", drive: "音频/SFX-UI.wav" },
  sfx_dash: { file: "assets/audio/sfx_dash.mp3", drive: "审查重做/sfx/SFX-冲刺攻击.wav" },
  sfx_pickup: { file: "assets/audio/sfx_pickup.mp3", drive: "审查重做/sfx/SFX-拾取.wav" },
  sfx_break: { file: "assets/audio/sfx_break.mp3", drive: "审查重做/sfx/SFX-物件破碎.wav" },
};

const VO_PRIORITY: Record<string, number> = { vo_skill: 3, vo_heavy: 2, vo_laugh: 2, vo_combo: 1, vo_light: 1 };
const VO_COOLDOWN: Record<string, number> = { vo_skill: 0, vo_heavy: 1600, vo_laugh: 0, vo_combo: 2600, vo_light: 2200 };
const BGM_VOLUME = 0.32;

export class AudioBus {
  private current?: Phaser.Sound.BaseSound;
  private currentKey = "";
  private lastPlayed: Record<string, number> = {};
  private warned = new Set<string>();
  private loops = new Map<string, Phaser.Sound.BaseSound>();
  private bgm?: Phaser.Sound.BaseSound;
  private bgmKey = "";

  constructor(private scene: Phaser.Scene) {}

  private has(key: string) {
    if (this.scene.cache.audio.exists(key)) return true;
    if (!this.warned.has(key)) {
      this.warned.add(key);
      console.info(`[AudioBus] 音频 "${key}" 未加载（静音）`);
    }
    return false;
  }

  /** Meme voice line: one at a time, higher priority interrupts, per-line cooldown. */
  vo(key: string, volume = 0.75) {
    if (!this.has(key)) return;
    const now = this.scene.time.now;
    if (now - (this.lastPlayed[key] ?? -1e9) < (VO_COOLDOWN[key] ?? 1500)) return;
    if (this.current?.isPlaying) {
      if ((VO_PRIORITY[key] ?? 0) <= (VO_PRIORITY[this.currentKey] ?? 0)) return;
      this.current.stop();
    }
    this.current = this.scene.sound.add(key, { volume });
    this.current.once("complete", () => this.current?.destroy());
    this.current.play();
    this.currentKey = key;
    this.lastPlayed[key] = now;
  }

  stopVo() {
    this.current?.stop();
  }

  /** One-shot SFX with a tiny pitch spread so repeats don't sound robotic. */
  sfx(key: string, volume = 0.6, detune = 60) {
    if (!this.has(key)) return;
    this.scene.sound.play(key, { volume, detune: detune ? Phaser.Math.Between(-detune, detune) : 0 });
  }

  loop(key: string, on: boolean, volume = 0.45) {
    const cur = this.loops.get(key);
    if (on && !cur && this.has(key)) {
      const s = this.scene.sound.add(key, { volume, loop: true });
      s.play();
      this.loops.set(key, s);
    } else if (!on && cur) {
      cur.stop();
      cur.destroy();
      this.loops.delete(key);
    }
  }

  stopLoops() {
    for (const k of [...this.loops.keys()]) this.loop(k, false);
  }

  /** Cross-fade to another BGM track (or silence with key ""). */
  music(key: string) {
    if (key === this.bgmKey) return;
    this.bgmKey = key;
    const old = this.bgm;
    if (old) {
      // 先停掉它的淡入，否则销毁后淡入动画还会写 volume（WebAudio 节点已释放 → 报错卡死场景）
      this.scene.tweens.killTweensOf(old);
      this.scene.tweens.add({ targets: old, volume: 0, duration: 700, onComplete: () => old.destroy() });
    }
    this.bgm = undefined;
    if (!key || !this.has(key)) return;
    const s = this.scene.sound.add(key, { volume: 0, loop: true });
    s.play();
    this.scene.tweens.add({ targets: s, volume: BGM_VOLUME, duration: 900 });
    this.bgm = s;
  }

  jingle(key: string) {
    this.music("");
    this.sfx(key, 0.7, 0);
  }

  /** Scene shutdown: stop everything this bus owns. */
  dispose() {
    this.stopLoops();
    if (this.bgm) {
      this.scene.tweens.killTweensOf(this.bgm);
      this.bgm.destroy();
      this.bgm = undefined;
    }
    this.bgmKey = "";
  }
}
