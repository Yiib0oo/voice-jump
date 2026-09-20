import { GROUND_Y, PLAYER, distanceAt, type JumpBody } from "./physics.ts";
import { obstacleX, type PlannedObstacle } from "./ObstaclePlanner.ts";
import { terrainX, isAnimal, patrolDirection, type Terrain, type Runner } from "./Adventure.ts";
import { SunnyLand, sceneWeights } from "./SunnyLand.ts";
import { drawThemedHazard } from "./HazardArt.ts";

const AVATARS = {
  normal: { url: new URL("../../图片库/正常付饶.jpg", import.meta.url).href,
    crop: { x: 350, y: 430, width: 980, height: 980 } },
  failed: { url: new URL("../../图片库/失败付饶.jpg", import.meta.url).href,
    crop: { x: 40, y: 165, width: 370, height: 370 } },
};
const SOURCES = {
  player: "player.png", enemy: "enemy.png", tiles: "tiles.png",
};
type Sprite = keyof typeof SOURCES | keyof typeof AVATARS;
type Crop = [number, number, number, number];

export class SceneRenderer {
  private readonly images = new Map<Sprite, HTMLImageElement>();
  private readonly sunny: SunnyLand;
  constructor(redraw: () => void) {
    this.sunny = new SunnyLand(redraw);
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

  background(ctx: CanvasRenderingContext2D, time: number, distance = distanceAt(time)): void {
    if (this.sunny.background(ctx, distance, 1, time)) return;
    // A neutral loading fallback; the discontinued seasonal art never flashes through.
    ctx.fillStyle = "#27b9ee";
    ctx.fillRect(0, 0, 900, GROUND_Y);
    ctx.fillStyle = "#6b4059";
    ctx.fillRect(0, GROUND_Y, 900, 80);
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

  terrain(ctx: CanvasRenderingContext2D, item: Terrain, time: number): void {
    const x = Math.round(terrainX(item, time));
    if (x > 900 || x + item.width < 0) return;
    const { top, width } = item;
    ctx.imageSmoothingEnabled = false;
    if (isAnimal(item)) {
      if (this.sunny?.animal(ctx, item, x, time)) return;
      const frame = Math.floor(time * 7) % 2;
      const height = GROUND_Y - top;
      const crop: Crop = [frame * 16, 16, 16, 16];
      ctx.save();
      ctx.translate(x + width / 2, top);
      // 原始乌龟朝左；转向时只翻转贴图，碰撞与绘制共用巡逻轨迹。
      ctx.scale(patrolDirection(item, time) > 0 ? -1 : 1, 1);
      if (!this.sprite(ctx, "enemy", -width / 2, 0, width, height, crop)) {
        ctx.fillStyle = "#9d512a";
        ctx.fillRect(-width * 0.35, 6, width * 0.7, height - 14);
        ctx.fillRect(-width * 0.46, height - 10, width * 0.28, 10);
        ctx.fillRect(width * 0.18, height - 10, width * 0.28, 10);
      }
      ctx.restore();
    } else if (item.kind === "platform") {
      if (this.sunny?.platform(ctx, x, top, width)) return;
      ctx.fillStyle = "#173e48";
      ctx.fillRect(x, top, width, 23);
      ctx.fillStyle = "#f4dfa0";
      ctx.fillRect(x + 3, top + 8, width - 6, 12);
      ctx.fillStyle = "#4bd49a";
      ctx.fillRect(x, top, width, 7);
      ctx.fillStyle = "#1b866e";
      for (let offset = 12; offset < width - 6; offset += 26) ctx.fillRect(x + offset, top + 13, 5, 6);
    } else {
      const weights = this.sunny?.hazardWeights(time) ?? sceneWeights(time);
      drawThemedHazard(ctx, x, top, width, weights.forest, weights.mine);
    }
    // 关卡标签仅作内部描述；场景元素依靠轮廓和颜色区分，不贴文字说明。
  }

  jet(ctx: CanvasRenderingContext2D, body: Runner): void {
    if (body.jet <= 0) return;
    const x = PLAYER.x + PLAYER.width / 2;
    const y = body.y + PLAYER.height;
    const flicker = Math.floor(body.jet * 65) % 2;
    const length = 18 + body.jet / 0.24 * 24 + flicker * 5;
    ctx.fillStyle = "#193c65";
    ctx.fillRect(x - 13, y - 3, 26, 8);
    ctx.fillStyle = "#37caff";
    ctx.fillRect(x - 10, y + 5, 20, length * 0.60);
    ctx.fillRect(x - 6, y + length * 0.60, 12, length * 0.40);
    ctx.fillStyle = "#fff3a3";
    ctx.fillRect(x - 5, y + 5, 10, length * 0.58);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x - 3, y + 5, 6, 8);
    ctx.fillStyle = "#8beaff";
    ctx.fillRect(x - 20 - flicker * 4, y + 14, 5, 5);
    ctx.fillRect(x + 18, y + 24 + flicker * 5, 4, 4);
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
