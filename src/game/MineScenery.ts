import { GROUND_Y, WORLD_HEIGHT } from "./physics.ts";
import { sceneryItems } from "./Seasons.ts";

// Wall and mounted decorations share a single slow plane, without sliding wall layers.
export const MINE_PARALLAX = { wall: 0.06 } as const;
export const MINE_BAY_WIDTH = 1024;
const profiles = [
  { timber: 576, lamps: [[104, 110], [832, 234]], plants: [[328, 64], [912, 136]], brick: [230, 318] },
  { timber: 448, lamps: [[128, 218], [784, 102]], plants: [[288, 128], [872, 294]], brick: [696, 42] },
  { timber: 672, lamps: [[180, 98], [914, 212]], plants: [[392, 226], [58, 280]], brick: [502, 112] },
  { timber: 352, lamps: [[110, 192], [730, 136]], plants: [[560, 76], [906, 274]], brick: [816, 348] },
] as const;

/** Stable world coordinates, including when crossing a bay boundary. */
export function mineBays(distance: number) {
  return sceneryItems(distance, MINE_PARALLAX.wall, MINE_BAY_WIDTH).map(({ id, x }) => ({
    id, x, ...profiles[((id % profiles.length) + profiles.length) % profiles.length],
  }));
}
type MineAssets = { tiles: HTMLImageElement; rock: HTMLImageElement; vine: HTMLImageElement };

/** Native SunnyLand mine elements, not a screenshot or independently moving cave panoramas. */
export function drawMine(ctx: CanvasRenderingContext2D, distance: number, assets: MineAssets): void {
  const { tiles, rock, vine } = assets;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#382313";
  ctx.fillRect(0, 0, 900, WORLD_HEIGHT);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 900, GROUND_Y); ctx.clip();
  // The standalone rock swatch has no timber/caps and tiles vertically without blank bands.
  for (const { x } of sceneryItems(distance, MINE_PARALLAX.wall, 32)) {
    for (let y = 0; y < GROUND_Y; y += 64)
      ctx.drawImage(tiles, 272, 112, 16, 32, Math.round(x), y, 32, 64);
  }
  const lights: { x: number; y: number }[] = [];
  for (const bay of mineBays(distance)) {
    if (bay.x > 900 || bay.x + MINE_BAY_WIDTH < 0) continue;
    const x = Math.round(bay.x), timber = x + bay.timber;
    // Complete authored panel, with embedded diagonal braces and native end caps.
    ctx.drawImage(tiles, 192, 96, 64, 16, timber, -16, 128, 32);
    for (let y = 16; y < GROUND_Y - 32; y += 96) {
      const height = Math.min(96, GROUND_Y - 32 - y);
      ctx.drawImage(tiles, 192, 112, 64, height / 2, timber, y, 128, height);
    }
    ctx.drawImage(tiles, 192, 160, 64, 16, timber, GROUND_Y - 32, 128, 32);
    ctx.drawImage(vine, timber + 52, -20, 82, 106);
    for (const [px, py] of bay.plants)
      ctx.drawImage(tiles, 288, 112, 16, 32, x + px, py, 32, 64);
    ctx.drawImage(tiles, 128, 112, 16, 16, x + bay.brick[0], bay.brick[1], 32, 32);
    for (const [lx, ly] of bay.lamps) lights.push({ x: x + lx, y: ly });
  }
  // A slight warm veil keeps the original colors and gives gameplay the stronger contrast.
  ctx.fillStyle = "rgba(39,23,12,0.12)"; ctx.fillRect(0, 0, 900, GROUND_Y);
  for (const light of lights) {
    if (light.x < -80 || light.x > 980) continue;
    const glow = ctx.createRadialGradient(light.x + 16, light.y + 16, 3, light.x + 16, light.y + 16, 64);
    glow.addColorStop(0, "rgba(240,169,77,0.12)");
    glow.addColorStop(1, "rgba(209,124,52,0)");
    ctx.fillStyle = glow; ctx.fillRect(light.x - 48, light.y - 48, 128, 128);
    ctx.drawImage(tiles, 304, 128, 16, 16, light.x, light.y, 32, 32);
  }
  ctx.restore();
  // Only the playable ground follows run speed; decorative stones stay below the floor.
  ctx.fillStyle = "#35261b"; ctx.fillRect(0, GROUND_Y, 900, WORLD_HEIGHT - GROUND_Y);
  ctx.fillStyle = "#765233"; ctx.fillRect(0, GROUND_Y, 900, 3);
  for (const { id, x } of sceneryItems(distance, 1, 96)) {
    const depth = (Math.imul(id, 13) >>> 0) % 30;
    ctx.drawImage(rock, Math.round(x + 12), GROUND_Y + 22 + depth, 28, 16);
  }
}
