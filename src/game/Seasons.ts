import { GROUND_Y, WORLD_HEIGHT } from "./physics.ts";

// 每季18秒：前10秒保持主题，后8秒逐渐进入下一季，冬→春采用同样的过渡。
export const SEASON_SECONDS = 18;
export const TRANSITION_SECONDS = 8;
export const SEASON_NAMES = ["春", "夏", "秋", "冬"] as const;
const palettes = [
  { sky: "#5c94fc", horizon: "#65c9ff", cloud: "#fff8f4", sun: "#ffdf55", far: "#4dac8c", hill: "#29a64e", leaf: "#ed5ca4", lightLeaf: "#ffb2d8", trunk: "#904826", grass: "#25ae43", grassLight: "#89e646", soil: "#be702e", soilDeep: "#854019", flower: "#ff9dcd" },
  { sky: "#2589ed", horizon: "#47cfe7", cloud: "#effcff", sun: "#ffd12e", far: "#329e8c", hill: "#168a43", leaf: "#209d45", lightLeaf: "#72d83b", trunk: "#855020", grass: "#149a35", grassLight: "#68d934", soil: "#b86626", soilDeep: "#793713", flower: "#ffda28" },
  { sky: "#e87955", horizon: "#ffb13b", cloud: "#fff0db", sun: "#ffe15b", far: "#ac6454", hill: "#bf752d", leaf: "#d84b27", lightLeaf: "#ffa325", trunk: "#853f25", grass: "#dd9619", grassLight: "#ffd443", soil: "#bd5e24", soilDeep: "#803a22", flower: "#ffb12e" },
  { sky: "#477ad0", horizon: "#78bef2", cloud: "#f2f7ff", sun: "#fff0a5", far: "#547ead", hill: "#609fd2", leaf: "#367b9e", lightLeaf: "#98d7ed", trunk: "#446d9f", grass: "#b7e6ff", grassLight: "#f5ffff", soil: "#5795c3", soilDeep: "#326aaa", flower: "#f5faff" },
];
type Palette = typeof palettes[number];
type PaletteKey = keyof Palette;
const mod = (value: number, period: number): number => ((value % period) + period) % period;
const smooth = (value: number): number => value * value * (3 - 2 * value);
function mix(a: string, b: string, amount: number): string {
  const channels = [1, 3, 5].map(offset => Math.round(
    parseInt(a.slice(offset, offset + 2), 16) * (1 - amount) + parseInt(b.slice(offset, offset + 2), 16) * amount));
  return `rgb(${channels.join(",")})`;
}
export function seasonAt(time: number): { index: number; next: number; blend: number; weights: number[]; palette: Palette } {
  const position = mod(time, SEASON_SECONDS * 4);
  const index = Math.floor(position / SEASON_SECONDS);
  const next = (index + 1) % 4;
  const blend = smooth(Math.max(0, (position % SEASON_SECONDS - (SEASON_SECONDS - TRANSITION_SECONDS)) / TRANSITION_SECONDS));
  const weights = [0, 0, 0, 0];
  weights[index] = 1 - blend;
  weights[next] = blend;
  const palette = {} as Palette;
  for (const key of Object.keys(palettes[0]) as PaletteKey[]) palette[key] = mix(palettes[index][key], palettes[next][key], blend);
  return { index, next, blend, weights, palette };
}

/** 以世界格编号决定形状，不在取模时重置排列，避免滚动接缝处树木突然变样。 */
export function sceneryItems(distance: number, factor: number, spacing: number): { id: number; x: number }[] {
  const offset = distance * factor;
  const first = Math.floor(offset / spacing) - 2;
  const last = Math.ceil((offset + 900) / spacing) + 1;
  return Array.from({ length: last - first + 1 }, (_, index) => {
    const id = first + index;
    return { id, x: id * spacing - offset };
  });
}
const variant = (id: number, count: number): number => mod(id, count);

/** 夏秋偶发阵雨：进入、离开均渐变，冬季不出现雨滴。 */
export function rainAt(time: number): number {
  const position = mod(time, SEASON_SECONDS * 4);
  const pulse = (start: number, end: number): number => {
    if (position <= start || position >= end) return 0;
    return smooth(Math.min(1, (position - start) / 3, (end - position) / 3));
  };
  const { weights } = seasonAt(time);
  return Math.max(pulse(23, 35), pulse(42, 53) * 0.75) * (weights[1] + weights[2]);
}

export function drawSeasonalBackground(ctx: CanvasRenderingContext2D, time: number, distance: number, themeTime = time): void {
  const { palette: p, weights } = seasonAt(themeTime);
  const [spring, summer, autumn, winter] = weights;
  const rain = rainAt(time);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  // 大色块带保留像素感；所有颜色逐帧混合，而非替换整张图。
  for (let band = 0; band < Math.ceil(GROUND_Y / 50); band++) {
    // seasonAt输出RGB，天空的纵向渐变用透明叠色完成。
    ctx.fillStyle = p.sky;
    ctx.fillRect(0, band * 50, 900, 50);
    ctx.globalAlpha = band / (Math.ceil(GROUND_Y / 50) + 1) * 0.6;
    ctx.fillStyle = p.horizon;
    ctx.fillRect(0, band * 50, 900, 50);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = p.sun;
  ctx.fillRect(742, 61, 38, 54);
  ctx.fillRect(734, 69, 54, 38);
  for (const { id, x } of sceneryItems(distance, 0.07, 245)) {
    const y = 42 + variant(id, 3) * 27;
    const width = 76 + variant(id, 2) * 24;
    ctx.fillStyle = p.cloud;
    ctx.fillRect(Math.round(x + 25), y, width - 36, 12);
    ctx.fillRect(Math.round(x + 12), y + 12, width - 12, 18);
    ctx.fillRect(Math.round(x), y + 30, width + 10, 12);
  }
  for (const { id, x } of sceneryItems(distance, 0.16, 230)) {
    const height = 100 + variant(id * 7, 4) * 18;
    ctx.fillStyle = p.far;
    for (let row = 0; row < 10; row++) {
      const half = 14 + row * 15;
      ctx.fillRect(Math.round(x + 90 - half), GROUND_Y - height + row * height / 10, half * 2, Math.ceil(height / 10));
    }
    ctx.globalAlpha = winter * 0.85;
    ctx.fillStyle = "#eef5fb";
    for (let row = 0; row < 3; row++) ctx.fillRect(Math.round(x + 76 - row * 15), GROUND_Y - height + row * height / 10, 28 + row * 30, Math.ceil(height / 10));
    ctx.globalAlpha = 1;
  }
  // 连续的低丘基底，不留镂空边；前后层以不同速度移动。
  ctx.fillStyle = p.hill;
  ctx.fillRect(0, GROUND_Y - 33, 900, 33);
  for (const { id, x } of sceneryItems(distance, 0.27, 190)) {
    const height = 37 + variant(id, 3) * 13;
    for (let row = 0; row < 5; row++) ctx.fillRect(Math.round(x + 55 - row * 20), GROUND_Y - height + row * height / 5, 45 + row * 40, Math.ceil(height / 5));
  }
  for (const { id, x } of sceneryItems(distance, 0.40, 205)) {
    const tx = Math.round(x + 55);
    const top = GROUND_Y - 115 - variant(id, 3) * 15;
    ctx.globalAlpha = 1 - summer;
    ctx.fillStyle = p.trunk;
    ctx.fillRect(tx + 23, top + 37, 10, GROUND_Y - top - 37);
    ctx.fillRect(tx + 3, top + 50, 25, 6);
    ctx.fillRect(tx + 3, top + 37, 6, 18);
    ctx.fillRect(tx + 30, top + 63, 26, 6);
    ctx.fillRect(tx + 50, top + 43, 6, 23);
    // 不同植物共享世界位置，不共享轮廓：樱花→棕榈/竹丛→枫树/银杏。
    ctx.globalAlpha = spring;
    ctx.fillStyle = "#eb579e";
    ctx.fillRect(tx - 14, top + 18, 85, 34);
    ctx.fillRect(tx, top + 4, 57, 60);
    ctx.fillStyle = "#ffb2d5";
    ctx.fillRect(tx + 6, top, 40, 15);
    ctx.fillRect(tx - 8, top + 22, 28, 16);
    for (let petal = 0; petal < 6; petal++) {
      const px = tx - 4 + variant(petal * 19 + id * 7, 63);
      const py = top + 18 + variant(petal * 13, 37);
      ctx.fillRect(px, py, 5, 5);
    }
    ctx.globalAlpha = summer;
    if (variant(id, 2) === 0) {
      // 棕榈：分节弯干和放射状下垂羽叶，不沿用阔叶树冠。
      ctx.fillStyle = "#aa6a24";
      for (let segment = 0; segment < 9; segment++) {
        const sy = GROUND_Y - 14 - segment * 13;
        const sx = tx + 17 + Math.floor(segment / 3) * 4;
        ctx.fillRect(sx, sy, 10, 14);
        ctx.fillStyle = "#e6b54c";
        ctx.fillRect(sx, sy + 10, 10, 3);
        ctx.fillStyle = "#aa6a24";
      }
      const crownX = tx + 31;
      const crownY = GROUND_Y - 124;
      for (const direction of [-1, 1]) {
        for (let step = 0; step < 6; step++) {
          ctx.fillStyle = step % 2 ? "#4bc949" : "#188d39";
          ctx.fillRect(crownX + direction * step * 10 - 7, crownY + Math.max(0, step - 1) * 5, 15, 7);
          ctx.fillRect(crownX + direction * step * 7 - 5, crownY - 10 + step * 10, 11, 7);
        }
      }
      ctx.fillStyle = "#80dc43";
      ctx.fillRect(crownX - 4, crownY - 26, 7, 24);
      ctx.fillRect(crownX + 3, crownY - 20, 12, 6);
      ctx.fillStyle = "#ac681c";
      ctx.fillRect(crownX - 6, crownY + 5, 8, 8);
      ctx.fillRect(crownX + 3, crownY + 7, 8, 8);
    } else {
      // 竹丛：高低错落的细竹节、狭长侧叶，与棕榈交替。
      for (let stalk = 0; stalk < 4; stalk++) {
        const sx = tx - 3 + stalk * 19;
        const sy = top - 12 + variant(stalk + id, 3) * 14;
        ctx.fillStyle = "#248f3c";
        ctx.fillRect(sx, sy, 5, GROUND_Y - sy);
        for (let node = sy + 17; node < GROUND_Y - 10; node += 22) {
          ctx.fillStyle = "#ade24a";
          ctx.fillRect(sx - 1, node, 7, 3);
          ctx.fillStyle = "#45ba45";
          ctx.fillRect(sx - 13, node - 8, 15, 4);
          ctx.fillRect(sx - 18, node - 12, 9, 4);
          ctx.fillRect(sx + 4, node - 12, 16, 4);
          ctx.fillRect(sx + 15, node - 16, 10, 4);
        }
      }
    }
    ctx.globalAlpha = autumn;
    if (variant(id, 2) === 0) {
      ctx.fillStyle = "#d64725";
      for (let row = 0; row < 5; row++) {
        const half = row < 3 ? 12 + row * 13 : 52 - row * 7;
        ctx.fillRect(tx + 27 - half, top - 8 + row * 15, half * 2, 16);
      }
      ctx.fillStyle = "#ff9928";
      ctx.fillRect(tx + 19, top - 4, 16, 17);
      ctx.fillRect(tx + 5, top + 15, 18, 14);
      ctx.fillRect(tx + 36, top + 33, 13, 12);
    } else {
      // 银杏：上宽下窄的金色扇形叶簇，和尖顶红枫形成对照。
      ctx.fillStyle = "#dca015";
      for (let row = 0; row < 6; row++) {
        const half = 50 - row * 6;
        ctx.fillRect(tx + 27 - half, top + row * 10, half * 2, 11);
      }
      ctx.fillStyle = "#ffe047";
      ctx.fillRect(tx - 15, top + 3, 84, 10);
      ctx.fillRect(tx - 7, top - 7, 68, 12);
      for (let leaf = 0; leaf < 4; leaf++) {
        ctx.fillRect(tx - 1 + leaf * 15, top + 19, 10, 5);
        ctx.fillRect(tx + 2 + leaf * 15, top + 24, 4, 8);
      }
    }
    // 枝干保持原位，叶冠渐退后露出带雪枝条。
    ctx.globalAlpha = winter;
    ctx.fillStyle = "#f0f6ff";
    ctx.fillRect(tx + 3, top + 46, 20, 4);
    ctx.fillRect(tx + 32, top + 59, 24, 4);
    ctx.fillRect(tx + 23, top + 33, 10, 5);
    ctx.globalAlpha = 1;
  }
  for (const { id, x } of sceneryItems(distance, 0.58, 110)) {
    const bx = Math.round(x);
    ctx.fillStyle = p.hill;
    ctx.fillRect(bx, GROUND_Y - 19, 69, 19);
    ctx.fillRect(bx + 10, GROUND_Y - 29, 45, 12);
    ctx.globalAlpha = spring;
    for (let i = 0; i < 3; i++) {
      const fx = bx + 12 + i * 18;
      const fy = GROUND_Y - 27 - variant(id + i, 3) * 3;
      ctx.fillStyle = "#248a37";
      ctx.fillRect(fx, fy + 7, 2, GROUND_Y - fy - 8);
      ctx.fillRect(fx + 2, fy + 15, 5, 3);
      ctx.fillStyle = i % 2 ? "#ff83bf" : "#e43891";
      ctx.fillRect(fx - 4, fy + 3, 10, 7);
      ctx.fillRect(fx - 4, fy, 3, 5);
      ctx.fillRect(fx + 3, fy, 3, 5);
    }
    // 夏季向日葵与细长草，轮廓明显区别于春季低矮花丛。
    ctx.globalAlpha = summer;
    const sx = bx + 31;
    ctx.fillStyle = "#167c31";
    ctx.fillRect(sx, GROUND_Y - 42, 3, 37);
    ctx.fillRect(sx - 10, GROUND_Y - 22, 11, 5);
    ctx.fillRect(sx + 3, GROUND_Y - 29, 9, 4);
    ctx.fillRect(bx + 70, GROUND_Y - 30, 3, 30);
    ctx.fillRect(bx + 77, GROUND_Y - 23, 3, 23);
    ctx.fillStyle = "#ffda22";
    ctx.fillRect(sx - 6, GROUND_Y - 51, 16, 16);
    ctx.fillRect(sx - 10, GROUND_Y - 47, 24, 8);
    ctx.fillStyle = "#92531c";
    ctx.fillRect(sx - 2, GROUND_Y - 47, 8, 8);
    // 秋季金色草穗，以及低处的落叶。
    ctx.globalAlpha = autumn;
    ctx.fillStyle = "#ffd23b";
    for (let stem = 0; stem < 4; stem++) {
      const wx = bx + 8 + stem * 12;
      const wy = GROUND_Y - 30 - variant(id + stem, 3) * 5;
      ctx.fillRect(wx, wy, 2, GROUND_Y - wy);
      for (let ear = 0; ear < 3; ear++) ctx.fillRect(wx - 3 + ear % 2 * 3, wy + ear * 5, 6, 3);
    }
    ctx.fillStyle = "#dc621f";
    ctx.fillRect(bx + 76, GROUND_Y - 7, 9, 4);
    ctx.fillRect(bx + 85, GROUND_Y - 10, 5, 4);
    ctx.globalAlpha = winter;
    ctx.fillStyle = "#e6f0fa";
    ctx.fillRect(bx + 10, GROUND_Y - 29, 45, 5);
    ctx.globalAlpha = 1;
  }
  // 粒子只在远景上方飘落，季节权重控制淡入淡出，不遮挡平台与角色。
  for (let i = 0; i < 22; i++) {
    const x = mod(i * 157 - distance * 0.12 + Math.sin(time * 0.8 + i) * 14, 960) - 30;
    const y = mod(i * 41 + time * (12 + i % 3 * 3), 235) - 20;
    const edgeFade = Math.min(1, Math.max(0, y + 12) / 18, Math.max(0, 215 - y) / 22);
    ctx.globalAlpha = edgeFade * (spring * 0.45 + autumn * 0.50 + winter * 0.70);
    ctx.fillStyle = p.flower;
    ctx.fillRect(Math.round(x), Math.round(y), 4, 3);
    ctx.fillRect(Math.round(x + 2), Math.round(y + 3), 3, 3);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = p.soil;
  ctx.fillRect(0, GROUND_Y, 900, WORLD_HEIGHT - GROUND_Y);
  ctx.fillStyle = p.soilDeep;
  ctx.fillRect(0, GROUND_Y + 34, 900, WORLD_HEIGHT - GROUND_Y - 34);
  for (const { id, x } of sceneryItems(distance, 1, 48)) {
    ctx.fillStyle = p.soilDeep;
    ctx.fillRect(Math.round(x + 8), GROUND_Y + 18 + variant(id, 2) * 4, 12, 4);
    ctx.fillStyle = p.soil;
    ctx.fillRect(Math.round(x + 28), GROUND_Y + 48, 8, 5);
    ctx.fillStyle = p.grass;
    ctx.fillRect(Math.round(x), GROUND_Y, 49, 8);
    ctx.fillRect(Math.round(x + 5), GROUND_Y + 8, 12, 5);
  }
  ctx.fillStyle = p.grassLight;
  ctx.fillRect(0, GROUND_Y, 900, 3);
  if (rain > 0) {
    // 天色和雨丝都在背景层，后绘制的平台、障碍及角色保持清晰。
    ctx.globalAlpha = rain * 0.13;
    ctx.fillStyle = "#244e88";
    ctx.fillRect(0, 0, 900, WORLD_HEIGHT);
    ctx.globalAlpha = rain * 0.55;
    ctx.fillStyle = "#dceaf5";
    for (let drop = 0; drop < 42; drop++) {
      const rx = mod(drop * 137 - time * 65, 960) - 30;
      const ry = mod(drop * 73 + time * 265, GROUND_Y + 35) - 20;
      for (let pixel = 0; pixel < 3; pixel++) {
        ctx.fillRect(Math.round(rx - pixel * 2), Math.round(ry + pixel * 5), 2, 5);
      }
    }
  }
  ctx.restore();
}
