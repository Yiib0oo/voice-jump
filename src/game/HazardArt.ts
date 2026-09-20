import { GROUND_Y } from "./physics.ts";

const CRYSTAL = ["#503854", "#ba82cd", "#f4cbee"];
const WOOD = ["#643c28", "#b97943", "#f5cb83"];
const ROCK = ["#394552", "#98a2a3", "#dae0c7"];
function mix(a: string, b: string, weight: number, c: string, mine: number): string {
  const channels = [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - weight - mine) +
    parseInt(b.slice(i, i + 2), 16) * weight + parseInt(c.slice(i, i + 2), 16) * mine));
  return `rgb(${channels.join(",")})`;
}

/** Material and silhouette follow the background blend; the collision footprint never changes. */
export function drawThemedHazard(ctx: CanvasRenderingContext2D, x: number, top: number,
  width: number, forest: number, mine = 0): void {
  const colors = CRYSTAL.map((color, i) => mix(color, WOOD[i], forest, ROCK[i], mine));
  const grain = mix(CRYSTAL[2], WOOD[1], forest, ROCK[1], mine);
  const count = Math.max(1, Math.ceil(width / 26));
  const cell = width / count;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.beginPath(); ctx.rect(x, top, width, GROUND_Y - top); ctx.clip();
  for (let column = 0; column < count; column++) {
    const inset = column % 3 === 1 ? 7 : 0;
    const peak = top + inset;
    const height = GROUND_Y - peak;
    const center = x + (column + 0.5) * cell;
    for (let row = 0; row < 12; row++) {
      const progress = (row + 1) / 12;
      // Crystal wedges widen all the way down; wooden stakes have a cut tip and straight bark.
      const crystal = Math.min(cell / 2, 1 + progress * cell / 2);
      const wood = Math.min(cell * 0.39, 1 + progress * cell * 1.25);
      const rock = Math.min(cell / 2, 2 + Math.floor(row / 2) * cell / 10);
      const half = crystal * (1 - forest - mine) + wood * forest + rock * mine;
      const y = Math.round(peak + row * height / 12);
      const bottom = Math.round(peak + (row + 1) * height / 12);
      const left = Math.round(center - half), right = Math.round(center + half);
      ctx.fillStyle = colors[0];
      ctx.fillRect(left, y, right - left, bottom - y);
      ctx.fillStyle = colors[1];
      ctx.fillRect(left + 1, y, Math.max(1, Math.round(half)), bottom - y);
      ctx.fillStyle = row < 4 ? colors[2] : grain;
      // Narrow facets become grain below the freshly cut wooden tips.
      ctx.fillRect(Math.round(center - 1), y, 2, bottom - y);
    }
  }
  ctx.restore();
}
