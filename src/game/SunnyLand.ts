import { GROUND_Y, WORLD_HEIGHT } from "./physics.ts";
import { sceneryItems } from "./Seasons.ts";
import { patrolDirection, type Terrain } from "./Adventure.ts";
import { drawMine } from "./MineScenery.ts";
export { MINE_PARALLAX } from "./MineScenery.ts";

const FILES = ["back", "middle", "tileset", "tree", "bush", "shrooms", "house", "spikes", "platform-long", "opossum", "slug",
  "forest-back", "forest-middle", "forest-tileset", "forest-tree", "forest-house", "forest-mushroom", "mine-rock", "mine-crate", "mine-vine"] as const;
type Asset = typeof FILES[number];
const MEADOW_ASSETS: Asset[] = ["back", "middle", "tileset", "tree", "bush", "shrooms", "house"];
const FOREST_ASSETS: Asset[] = ["forest-back", "forest-middle", "forest-tileset", "forest-tree", "forest-house", "forest-mushroom"];
const MINE_ASSETS: Asset[] = ["forest-tileset", "platform-long", "mine-rock", "mine-vine"];
export const SCENE_SECONDS = 28;
export const SCENE_TRANSITION_SECONDS = 6;
export const SCENERY_FLOOR = GROUND_Y;

/** Whole opaque scenes crossfade, so the sky and ground never flash or lose opacity. */
export function sceneWeights(time: number): { meadow: number; forest: number; mine: number } {
  const position = ((time % (SCENE_SECONDS * 3)) + SCENE_SECONDS * 3) % (SCENE_SECONDS * 3);
  const index = Math.floor(position / SCENE_SECONDS);
  const progress = Math.max(0, (position % SCENE_SECONDS - (SCENE_SECONDS - SCENE_TRANSITION_SECONDS)) / SCENE_TRANSITION_SECONDS);
  const blend = progress * progress * (3 - 2 * progress);
  const weights = [0, 0, 0];
  weights[index] = 1 - blend;
  weights[(index + 1) % 3] = blend;
  return { meadow: weights[0], forest: weights[1], mine: weights[2] };
}
export function forestWeight(time: number): number { return sceneWeights(time).forest; }

/** Adjacent strips share rounded edges, including at the wrap boundary. */
export function repeatStarts(distance: number, factor: number, width: number): number[] {
  const offset = ((distance * factor % width) + width) % width;
  return Array.from({ length: Math.ceil(900 / width) + 2 }, (_, i) => Math.round(i * width - offset));
}

/** Original SunnyLand PNGs, sampled at their authored tile boundaries; no recoloring. */
export class SunnyLand {
  private readonly images = new Map<Asset, HTMLImageElement>();
  private readonly spring = document.createElement("canvas");
  private readonly context: CanvasRenderingContext2D;

  constructor(redraw: () => void) {
    this.spring.width = 900;
    this.spring.height = WORLD_HEIGHT;
    this.context = this.spring.getContext("2d")!;
    for (const name of FILES) {
      const image = new Image();
      this.images.set(name, image);
      image.onload = redraw;
      image.src = new URL(`assets/sunnyland/${name}.png`, document.baseURI).href;
    }
  }

  private get(name: Asset): HTMLImageElement | undefined {
    const image = this.images.get(name);
    return image?.complete && image.naturalWidth ? image : undefined;
  }

  get ready(): boolean {
    return MEADOW_ASSETS.every(name => !!this.get(name));
  }

  hazardWeights(time: number): ReturnType<typeof sceneWeights> {
    if (!this.ready) return { meadow: 1, forest: 0, mine: 0 };
    const weights = sceneWeights(time);
    if (!FOREST_ASSETS.every(name => !!this.get(name))) { weights.meadow += weights.forest; weights.forest = 0; }
    if (!MINE_ASSETS.every(name => !!this.get(name))) { weights.meadow += weights.mine; weights.mine = 0; }
    return weights;
  }

  background(ctx: CanvasRenderingContext2D, distance: number, opacity: number, time = 0): boolean {
    if (opacity <= 0 || !this.ready) return false;
    const weights = this.hazardWeights(time);
    // Blend inside the offscreen canvas, and apply caller opacity only once at the end.
    let accumulated = 0;
    for (const [index, weight] of [weights.meadow, weights.forest, weights.mine].entries()) {
      if (weight <= 0) continue;
      accumulated += weight;
      this.context.save();
      this.context.globalAlpha = weight / accumulated;
      this.paintScene(distance, index);
      this.context.restore();
    }
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.spring, 0, 0);
    ctx.restore();
    return true;
  }

  private paintScene(distance: number, index: number): void {
    const layer = this.context;
    // Compose the forest offscreen so all its layers receive one transition weight.
    if (index === 2) { this.mineScene(distance); return; }
    if (index === 1) {
      this.forestScene(distance);
      return;
    }
    const back = this.get("back")!, middle = this.get("middle")!, tiles = this.get("tileset")!;
    const tree = this.get("tree")!, bush = this.get("bush")!, shrooms = this.get("shrooms")!;
    const house = this.get("house")!;
    layer.imageSmoothingEnabled = false;
    layer.clearRect(0, 0, 900, WORLD_HEIGHT);
    // Two-times native pixels: the 240px background exactly fills the 480px sky.
    for (const x of repeatStarts(distance, 0.07, 768)) layer.drawImage(back, x, 0, 768, 480);
    for (const x of repeatStarts(distance, 0.20, 352)) {
      layer.drawImage(middle, 0, 0, 176, 120, x, SCENERY_FLOOR - 240, 352, 240);
    }
    for (const { id, x } of sceneryItems(distance, 0.40, 560)) {
      // World-anchored scenery groups: woods, clearings and cottages, no time-based swaps.
      const section = ((id % 6) + 6) % 6;
      if (section === 2 || section === 5) continue;
      if (section === 3) {
        layer.drawImage(house, Math.round(x + 70), SCENERY_FLOOR - 216, 174, 216);
        continue;
      }
      layer.save();
      layer.translate(Math.round(x + 60), SCENERY_FLOOR);
      if (id % 2) { layer.translate(192, 0); layer.scale(-1, 1); }
      // The original prop has a stray terrain fragment in its leftmost 9px.
      layer.drawImage(tree, 9, 0, 96, 93, 0, -186, 192, 186);
      layer.restore();
    }
    for (const { id, x } of sceneryItems(distance, 0.58, 320)) {
      if (id % 4 === 0) layer.drawImage(bush, Math.round(x + 54), SCENERY_FLOOR - 56, 92, 56);
      if (id % 4 === 2) layer.drawImage(shrooms, Math.round(x + 10), SCENERY_FLOOR - 30, 32, 30);
    }
    // Tiled source map IDs 29 (grass), 79 (soil), 181/183 (soil details), 25 columns.
    layer.fillStyle = "#6b4059";
    layer.fillRect(0, GROUND_Y, 900, WORLD_HEIGHT - GROUND_Y);
    for (const { id, x } of sceneryItems(distance, 1, 32)) {
      for (let row = 0; row < 3; row++) {
        const tile = row === 0 ? 29 : (id + row * 3) % 7 === 0 ? 181 : (id - row) % 11 === 0 ? 183 : 79;
        layer.drawImage(tiles, (tile - 1) % 25 * 16, Math.floor((tile - 1) / 25) * 16,
          16, 16, Math.round(x), GROUND_Y + row * 32, 32, 32);
      }
    }
  }

  private readonly forestFrame = document.createElement("canvas");
  private readonly mineFrame = document.createElement("canvas");

  private mineScene(distance: number): void {
    const canvas = this.mineFrame;
    if (canvas.width !== 900) { canvas.width = 900; canvas.height = WORLD_HEIGHT; }
    const layer = canvas.getContext("2d")!;
    drawMine(layer, distance, { tiles: this.get("forest-tileset")!, rock: this.get("mine-rock")!,
      vine: this.get("mine-vine")! });
    this.context.drawImage(canvas, 0, 0);
  }

  private forestScene(distance: number): void {
    const canvas = this.forestFrame;
    if (canvas.width !== 900) { canvas.width = 900; canvas.height = WORLD_HEIGHT; }
    const layer = canvas.getContext("2d")!;
    layer.imageSmoothingEnabled = false;
    layer.clearRect(0, 0, 900, WORLD_HEIGHT);
    const back = this.get("forest-back")!, middle = this.get("forest-middle")!;
    for (const x of repeatStarts(distance, 0.07, 384)) layer.drawImage(back, x, 0, 384, 480);
    for (const x of repeatStarts(distance, 0.20, 768)) layer.drawImage(middle, x, SCENERY_FLOOR - 480, 768, 480);
    for (const { id, x } of sceneryItems(distance, 0.40, 510)) {
      const section = ((id % 4) + 4) % 4;
      if (section === 0) layer.drawImage(this.get("forest-house")!, Math.round(x + 95), SCENERY_FLOOR - 165, 193, 165);
      if (section === 2) layer.drawImage(this.get("forest-tree")!, Math.round(x + 35), SCENERY_FLOOR - 223, 213, 223);
    }
    for (const { id, x } of sceneryItems(distance, 0.58, 320)) {
      if (id % 3 === 1) layer.drawImage(this.get("forest-mushroom")!, Math.round(x + 70), SCENERY_FLOOR - 28, 23, 28);
    }
    layer.fillStyle = "#493016";
    layer.fillRect(0, GROUND_Y, 900, WORLD_HEIGHT - GROUND_Y);
    const tiles = this.get("forest-tileset")!;
    for (const { x } of sceneryItems(distance, 1, 64)) {
      layer.drawImage(tiles, 128, 48, 32, 16, Math.round(x), GROUND_Y, 64, 32);
      for (let row = 1; row < 3; row++) layer.drawImage(tiles, 128, 80, 32, 16,
        Math.round(x), GROUND_Y + row * 32, 64, 32);
    }
    this.context.drawImage(canvas, 0, 0);
  }

  spikes(ctx: CanvasRenderingContext2D, x: number, top: number, width: number): boolean {
    const image = this.get("spikes");
    if (!image) return false;
    const height = GROUND_Y - top;
    const cellWidth = Math.round(height * 1.5);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.beginPath(); ctx.rect(x, top, width, height); ctx.clip();
    for (let offset = 0; offset < width; offset += cellWidth) {
      ctx.drawImage(image, x + offset, top, cellWidth, height);
    }
    ctx.restore();
    return true;
  }

  animal(ctx: CanvasRenderingContext2D, item: Terrain, x: number, time: number): boolean {
    if (item.kind !== "opossum" && item.kind !== "slug") return false;
    const image = this.get(item.kind);
    if (!image) return false;
    const opossum = item.kind === "opossum";
    const frames = opossum ? 6 : 4;
    const frameWidth = opossum ? 36 : 32;
    const frame = Math.floor((time + item.id * 0.13) * (opossum ? 6 : 4)) % frames;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x + item.width / 2, item.top);
    // Both original creatures face left; animation clock and turning use game time.
    ctx.scale(patrolDirection(item, time) > 0 ? -1 : 1, 1);
    ctx.drawImage(image, frame * frameWidth, opossum ? 2 : 0, frameWidth, opossum ? 26 : 21,
      -item.width / 2, 0, item.width, GROUND_Y - item.top);
    ctx.restore();
    return true;
  }

  platform(ctx: CanvasRenderingContext2D, x: number, top: number, width: number): boolean {
    const image = this.get("platform-long");
    if (!image) return false;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.beginPath(); ctx.rect(x, top, width, 23); ctx.clip();
    // Repeat the interior; retain the original 2px end caps instead of stretching a beam.
    for (let offset = 4; offset < width - 4; offset += 56) {
      const size = Math.min(56, width - 4 - offset);
      ctx.drawImage(image, 2, 0, size / 2, 12, x + offset, top, size, 23);
    }
    ctx.drawImage(image, 0, 0, 2, 12, x, top, 4, 23);
    ctx.drawImage(image, 30, 0, 2, 12, x + width - 4, top, 4, 23);
    ctx.restore();
    return true;
  }
}
