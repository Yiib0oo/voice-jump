import { STEP, GROUND_Y, PLAYER, START_SPEED, beginJump, createBody, intersects, speedAt, stepBody } from "./physics.ts";
import { ObstaclePlanner, obstacleX, type PlannedObstacle } from "./ObstaclePlanner.ts";
import { SceneRenderer } from "./SceneRenderer.ts";

export type GameState = "idle" | "running" | "game-over";
export type GameEvents = {
  onScoreChange?: (score: number) => void;
  onStateChange?: (state: GameState) => void;
};
const WORLD_WIDTH = 900;
const WORLD_HEIGHT = 420;

export class Game {
  private readonly context: CanvasRenderingContext2D;
  private state: GameState = "idle";
  private animationFrame = 0;
  private lastFrameAt = 0;
  private accumulator = 0;
  private elapsed = 0;
  private score = 0;
  private body = createBody();
  private held = false;
  private planner = new ObstaclePlanner();
  private obstacles: PlannedObstacle[] = [];
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
    this.body = createBody();
    this.held = false;
    this.elapsed = 0;
    this.accumulator = 0;
    this.score = 0;
    this.planner = new ObstaclePlanner();
    this.obstacles = [this.planner.next(), this.planner.next(), this.planner.next()];
    this.state = "running";
    this.lastFrameAt = performance.now();
    this.events.onScoreChange?.(0);
    this.events.onStateChange?.(this.state);
    cancelAnimationFrame(this.animationFrame);
    this.animationFrame = requestAnimationFrame(this.tick);
  }

  jump(): void {
    if (this.state === "running") beginJump(this.body);
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
    this.elapsed += STEP;
    stepBody(this.body, this.held);
    for (const obstacle of this.obstacles) {
      const x = obstacleX(obstacle, this.elapsed);
      if (intersects({ ...PLAYER, y: this.body.y }, {
        x, y: GROUND_Y - obstacle.height, width: obstacle.width, height: obstacle.height,
      })) {
        this.state = "game-over";
        this.events.onStateChange?.(this.state);
        return;
      }
      if (!obstacle.passed && x + obstacle.width < PLAYER.x) {
        obstacle.passed = true;
        this.events.onScoreChange?.(++this.score);
      }
    }
    this.obstacles = this.obstacles.filter((obstacle) => obstacleX(obstacle, this.elapsed) + obstacle.width > -20);
    while (this.obstacles.length < 3) this.obstacles.push(this.planner.next());
  }

  private draw(): void {
    const ctx = this.context;
    this.scene.background(ctx, this.elapsed);
    for (const obstacle of this.obstacles) {
      this.scene.obstacle(ctx, obstacle, this.elapsed);
    }
    this.scene.player(ctx, this.body, this.elapsed, this.state);
    ctx.fillStyle = "#ffffff";
    ctx.font = "16px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`速度 ×${(speedAt(this.elapsed) / START_SPEED).toFixed(2)}`, WORLD_WIDTH - 20, 32);
    if (this.state !== "running") {
      ctx.fillStyle = "rgba(21, 40, 78, 0.8)";
      ctx.fillRect(WORLD_WIDTH / 2 - 225, 104, 450, 48);
      ctx.fillStyle = "#ffffff";
      ctx.font = "22px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(this.state === "idle" ? "短喊短跳，稍长喊长跳" : "撞到了，点击重新开始", WORLD_WIDTH / 2, 130);
    }
  }
}
