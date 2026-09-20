import { STEP, PLAYER, WORLD_HEIGHT } from "./physics.ts";
import { AdventureCourse, createRunner, jumpRunner, stepRunner, hitsHazard, terrainX,
  runSpeed, runDistance, difficultyAt, STAGE_NAMES, type Terrain } from "./Adventure.ts";
import { SceneRenderer } from "./SceneRenderer.ts";

export type GameState = "idle" | "running" | "game-over";
export type GameEvents = {
  onScoreChange?: (score: number) => void;
  onStateChange?: (state: GameState) => void;
};
const WORLD_WIDTH = 900;

export class Game {
  private readonly context: CanvasRenderingContext2D;
  private state: GameState = "idle";
  private animationFrame = 0;
  private lastFrameAt = 0;
  private accumulator = 0;
  private elapsed = 0;
  private score = 0;
  private body = createRunner();
  private held = false;
  private course = new AdventureCourse();
  private terrain: Terrain[] = [];
  private feedback = "";
  private feedbackUntil = 0;
  private readonly scene: SceneRenderer;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly events: GameEvents = {}) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法创建 Canvas 画布");
    this.context = context;
    this.scene = new SceneRenderer(() => this.draw());
    this.resize();
    window.addEventListener("resize", this.resize);
    document.addEventListener("visibilitychange", () => {
      this.lastFrameAt = performance.now();
      this.accumulator = 0;
      this.held = false;
    });
  }

  start(): void {
    this.body = createRunner();
    this.held = false;
    this.elapsed = 0;
    this.accumulator = 0;
    this.score = 0;
    this.course = new AdventureCourse();
    this.terrain = [...this.course.next(), ...this.course.next()];
    this.feedback = "落地补满两次跳跃 · 空中可再跳一次";
    this.feedbackUntil = 2;
    this.state = "running";
    this.lastFrameAt = performance.now();
    this.events.onScoreChange?.(0);
    this.events.onStateChange?.(this.state);
    cancelAnimationFrame(this.animationFrame);
    this.animationFrame = requestAnimationFrame(this.tick);
  }

  jump(): boolean {
    if (this.state !== "running" || !jumpRunner(this.body)) return false;
    if (this.body.jumpsUsed === 2) {
      this.feedback = "喷气！二段跳";
      this.feedbackUntil = this.elapsed + 0.55;
    }
    return true;
  }
  setHeld(held: boolean): void { this.held = held; }
  getState(): GameState { return this.state; }

  private readonly resize = (): void => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const bounds = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(bounds.width * ratio);
    this.canvas.height = Math.round(bounds.height * ratio);
    this.context.setTransform(this.canvas.width / WORLD_WIDTH, 0, 0,
      this.canvas.height / WORLD_HEIGHT, 0, 0);
    this.draw();
  };

  private readonly tick = (now: number): void => {
    if (this.state !== "running") return;
    if (!document.hidden) this.accumulator += Math.min((now - this.lastFrameAt) / 1000, 0.1);
    this.lastFrameAt = now;
    while (this.accumulator >= STEP && this.state === "running") {
      this.update();
      this.accumulator -= STEP;
    }
    this.draw();
    if (this.state === "running") this.animationFrame = requestAnimationFrame(this.tick);
  };

  private update(): void {
    const previousStage = difficultyAt(this.elapsed);
    this.elapsed += STEP;
    if (difficultyAt(this.elapsed) !== previousStage) {
      this.feedback = `进入${STAGE_NAMES[difficultyAt(this.elapsed)]}阶段 · 新组合出现`;
      this.feedbackUntil = this.elapsed + 1.4;
    }
    const wasAirborne = this.body.active;
    stepRunner(this.body, this.held, this.terrain, this.elapsed);
    if (wasAirborne && !this.body.active && this.body.supportId !== null) {
      this.feedback = "平台着陆 · 跳跃已补满";
      this.feedbackUntil = this.elapsed + 0.7;
    }
    if (hitsHazard(this.body, this.terrain, this.elapsed)) {
      this.state = "game-over";
      this.events.onStateChange?.(this.state);
      return;
    }
    for (const item of this.terrain) {
      const x = terrainX(item, this.elapsed);
      if (!item.passed && item.kind !== "platform" && x + item.width < PLAYER.x) {
        item.passed = true;
        this.events.onScoreChange?.(++this.score);
        this.feedback = "+1  越过障碍";
        this.feedbackUntil = this.elapsed + 0.6;
      }
    }
    this.terrain = this.terrain.filter(item => terrainX(item, this.elapsed) + item.width > -20);
    while (this.terrain.length < 6) this.terrain.push(...this.course.next());
  }

  private draw(): void {
    const ctx = this.context;
    this.scene.background(ctx, this.elapsed, runDistance(this.elapsed));
    for (const item of this.terrain) this.scene.terrain(ctx, item, this.elapsed);
    if (this.body.landing > 0) {
      ctx.fillStyle = "#fff1b5";
      const spread = (0.14 - this.body.landing) * 130;
      ctx.fillRect(PLAYER.x - spread, this.body.y + PLAYER.height - 3, 7, 4);
      ctx.fillRect(PLAYER.x + PLAYER.width + spread, this.body.y + PLAYER.height - 3, 7, 4);
    }
    this.scene.jet(ctx, this.body);
    this.scene.player(ctx, this.body, this.elapsed, this.state);
    ctx.fillStyle = "rgba(20, 43, 68, 0.85)";
    ctx.fillRect(WORLD_WIDTH - 276, 14, 260, 34);
    ctx.fillStyle = "#ffffff";
    ctx.font = "16px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`阶段 ${difficultyAt(this.elapsed) + 1} · ${STAGE_NAMES[difficultyAt(this.elapsed)]}   速度 ${Math.round(runSpeed(this.elapsed))}`, WORLD_WIDTH - 26, 37);
    ctx.fillStyle = "rgba(20, 43, 68, 0.85)";
    ctx.fillRect(16, 14, 169, 34);
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.fillText("剩余跳跃", 26, 37);
    for (let i = 0; i < 2; i++) {
      ctx.fillStyle = i < 2 - this.body.jumpsUsed ? "#86fbd3" : "#405a70";
      ctx.fillRect(110 + i * 32, 23, 23, 17);
      ctx.fillStyle = i < 2 - this.body.jumpsUsed ? "#e0fff2" : "#6b8190";
      ctx.fillRect(114 + i * 32, 26, 6, 5);
    }
    if (this.elapsed < this.feedbackUntil && this.state === "running") {
      ctx.textAlign = "center";
      ctx.fillStyle = "#17394c";
      ctx.fillText(this.feedback, WORLD_WIDTH / 2, 66);
    }
    if (this.state !== "running") {
      ctx.fillStyle = "rgba(21, 40, 78, 0.8)";
      ctx.fillRect(WORLD_WIDTH / 2 - 225, 104, 450, 48);
      ctx.fillStyle = "#ffffff";
      ctx.font = "22px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(this.state === "idle" ? "点击起跳 · 空中再点，喷气二段跳" : "碰到障碍了 · 轻点画面重新开始", WORLD_WIDTH / 2, 130);
    }
  }
}
