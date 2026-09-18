export type VoiceJumpConfig = {
  triggerLevel: number;
  releaseRatio: number;
  cooldownMs: number;
  releaseMs?: number;
  holdReleaseMs?: number;
};

export class VoiceJumpDetector {
  private config: VoiceJumpConfig;
  private armed = true;
  private lastTriggerAt = -Infinity;
  private quietSince: number | null = null;
  private held = false;

  constructor(config: VoiceJumpConfig) {
    this.config = config;
  }

  setTriggerLevel(triggerLevel: number): void {
    this.config.triggerLevel = triggerLevel;
  }

  getTriggerLevel(): number {
    return this.config.triggerLevel;
  }

  isHeld(): boolean { return this.held; }

  update(level: number, now: number): boolean {
    const releaseLevel = this.config.triggerLevel * this.config.releaseRatio;

    // 停止蓄力和下一声解锁分开：避免把短喊额外延长 80ms。
    if (level <= releaseLevel) {
      this.quietSince ??= now;
      if (now - this.quietSince >= (this.config.holdReleaseMs ?? 30)) this.held = false;
      if (now - this.quietSince >= (this.config.releaseMs ?? 80)) {
        this.armed = true;
        this.held = false;
      }
    } else this.quietSince = null;

    const cooledDown = now - this.lastTriggerAt >= this.config.cooldownMs;
    if (this.armed && cooledDown && level >= this.config.triggerLevel) {
      this.armed = false;
      this.held = true;
      this.lastTriggerAt = now;
      return true;
    }

    return false;
  }

  reset(): void {
    this.armed = true;
    this.lastTriggerAt = -Infinity;
    this.quietSince = null;
    this.held = false;
  }
}
