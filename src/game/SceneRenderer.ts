import { GROUND_Y, PLAYER, distanceAt, type JumpBody } from "./physics.ts";
import { obstacleX, type PlannedObstacle } from "./ObstaclePlanner.ts";

const AVATARS = {
  normal: { url: new URL("../../图片库/正常付饶.jpg", import.meta.url).href,
    crop: { x: 350, y: 430, width: 980, height: 980 } },
  failed: { url: new URL("../../图片库/失败付饶.jpg", import.meta.url).href,
    crop: { x: 40, y: 165, width: 370, height: 370 } },
};
const SOURCES = {
  player: "player.png", enemy: "enemy.png", tiles: "tiles.png",
  cloud: "cloud.gif", bush: "bush.gif", ground: "ground.png",
};
type Sprite = keyof typeof SOURCES | keyof typeof AVATARS;
type Crop = [number, number, number, number];

export class SceneRenderer {
  private readonly images = new Map<Sprite, HTMLImageElement>();
  constructor(redraw: () => void) {
    for (const [key, filename] of Object.entries(SOURCES)) {
      this.load(key as Sprite, new URL(`assets/mario/${filename}`, document.baseURI).href, redraw);
    }
    for (const key of ["normal", "failed"] as const) this.load(key, AVATARS[key].url, redraw);
  }

  private load(key: Sprite, url: string, redraw: () => void): void {
    const image = new Image();
    this.images.set(key, image);
    image.onload = redraw;
    image.src = url;
  }

  private sprite(ctx: CanvasRenderingContext2D, key: Sprite, x: number, y: number,
    width: number, height: number, crop?: Crop): boolean {
    const image = this.images.get(key);
    if (!image?.complete || !image.naturalWidth) return false;
    if (crop) ctx.drawImage(image, ...crop, Math.round(x), Math.round(y), width, height);
    else ctx.drawImage(image, Math.round(x), Math.round(y), width, height);
    return true;
  }

  background(ctx: CanvasRenderingContext2D, time: number): void {
    const distance = distanceAt(time);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#5c94fc";
    ctx.fillRect(0, 0, 900, 420);
    // 三种速度的远景：云最慢，山丘其次，近处灌木更快。
    for (let i = -1; i < 7; i++) {
      const x = i * 220 - distance * 0.10 % 220;
      const size = i % 2 === 0 ? 1.3 : 1;
      this.sprite(ctx, "cloud", x + 24, 30 + ((i + 7) % 3) * 37, 78 * size, 58 * size);
    }
    for (let i = -1; i < 6; i++) {
      const x = i * 280 - distance * 0.22 % 280;
      const height = i % 2 === 0 ? 132 : 84;
      const halfWidth = height * 0.75;
      ctx.fillStyle = i % 2 === 0 ? "#159b23" : "#32b33a";
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y);
      for (let step = 0; step <= 8; step++) {
        ctx.lineTo(x + halfWidth * step / 8, GROUND_Y - height * step / 8);
        ctx.lineTo(x + halfWidth * (step + 1) / 8, GROUND_Y - height * step / 8);
      }
      for (let step = 8; step >= 0; step--) {
        ctx.lineTo(x + halfWidth * (2 - step / 8), GROUND_Y - height * step / 8);
        ctx.lineTo(x + halfWidth * (2 - step / 8), GROUND_Y - height * Math.max(0, step - 1) / 8);
      }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#0c651a";
      ctx.fillRect(x + halfWidth - 16, GROUND_Y - height * 0.36, 5, 12);
      ctx.fillRect(x + halfWidth + 6, GROUND_Y - height * 0.36, 5, 12);
    }
    for (let i = -1; i < 8; i++) {
      const x = i * 180 - distance * 0.43 % 180;
      this.sprite(ctx, "bush", x + 28, GROUND_Y - 36, i % 2 === 0 ? 108 : 78, 36);
    }
    ctx.fillStyle = "#b85d21";
    ctx.fillRect(0, GROUND_Y, 900, 70);
    const tileSize = 42;
    for (let x = -(distance % tileSize); x < 900; x += tileSize) {
      for (let y = GROUND_Y; y < 420; y += tileSize) this.sprite(ctx, "ground", x, y, tileSize, tileSize);
    }
  }

  obstacle(ctx: CanvasRenderingContext2D, obstacle: PlannedObstacle, time: number): void {
    const x = obstacleX(obstacle, time);
    const { width, height, kind } = obstacle;
    if (x > 900 || x + width < 0) return;
    const y = GROUND_Y - height;
    ctx.imageSmoothingEnabled = false;
    const frame = Math.floor(time * 7) % 2;
    let drawn = false;
    switch (kind) {
      case "goomba":
        drawn = this.sprite(ctx, "enemy", x, y, width, height, [frame * 16, 16, 16, 16]); break;
      case "shell":
        drawn = this.sprite(ctx, "enemy", x, y, width, height, [160, 16, 16, 16]); break;
      case "koopa":
        drawn = this.sprite(ctx, "enemy", x, y, width, height, [96 + frame * 16, 8, 16, 24]); break;
      case "pipe":
        drawn = this.sprite(ctx, "tiles", x, y, width, height, [0, 128, 32, 32]); break;
      case "bricks":
        ctx.save();
        ctx.beginPath(); ctx.rect(x, y, width, height); ctx.clip();
        for (let bx = 0; bx < width; bx += 22) {
          for (let by = 0; by < height; by += 22) {
            drawn = this.sprite(ctx, "tiles", x + bx, y + by, 22, 22, [16, 0, 16, 16]) || drawn;
          }
        }
        ctx.restore(); break;
    }
    if (!drawn) { ctx.fillStyle = "#b85d21"; ctx.fillRect(x, y, width, height); }
  }

  player(ctx: CanvasRenderingContext2D, body: JumpBody, time: number, state: string): void {
    const { x, width, height } = PLAYER;
    const y = body.y;
    const frameX = body.active ? 160 : state === "running" ? 96 + Math.floor(time * 11) % 3 * 16 : 80;
    ctx.imageSmoothingEnabled = false;
    // 只画马里奥胸口以下，真人大头覆盖原本头部；跑动使用三个腿部帧。
    const torsoY = y + height * 0.57;
    const legs = this.sprite(ctx, "player", x + width * 0.16, torsoY,
      width * 0.72, height * 0.43, [frameX, 15, 16, 17]);
    if (!legs) { ctx.fillStyle = "#c43b21"; ctx.fillRect(x + 12, torsoY, width - 24, height * 0.43); }
    const variant = state === "game-over" ? "failed" : "normal";
    const { crop } = AVATARS[variant];
    const headWidth = width * 0.80;
    const headHeight = headWidth;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x + width / 2, y + headHeight / 2, headWidth / 2, headHeight / 2, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    this.sprite(ctx, variant, x + (width - headWidth) / 2, y, headWidth, headHeight,
      [crop.x, crop.y, crop.width, crop.height]);
    ctx.restore();
  }
}
