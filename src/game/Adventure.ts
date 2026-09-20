import { GROUND_Y, PLAYER, STEP, HOLD_SECONDS, createBody, intersects, type JumpBody } from "./physics.ts";

export const RUN_START_SPEED = 300;
export const RUN_MAX_SPEED = 924;
export const RUN_ACCELERATION_SECONDS = 70;
export function runSpeed(time: number): number {
  const progress = time / RUN_ACCELERATION_SECONDS;
  return RUN_START_SPEED + (RUN_MAX_SPEED - RUN_START_SPEED) * (1 - (1 + progress) * Math.exp(-progress));
}
export function runDistance(time: number): number {
  const scale = RUN_ACCELERATION_SECONDS;
  return RUN_START_SPEED * time + (RUN_MAX_SPEED - RUN_START_SPEED) *
    (time - 2 * scale + (time + 2 * scale) * Math.exp(-time / scale));
}
export type Terrain = {
  id: number; kind: "platform" | "cactus" | "thorns" | "crystals" | "spikes" | "opossum" | "slug"; x: number; width: number;
  top: number; label: string; passed: boolean;
  patrol?: { radius: number; period: number; phase: number; startedAt: number };
};
export type Runner = JumpBody & {
  jumpsUsed: number; supportId: number | null; jet: number; landing: number;
};
export function createRunner(): Runner {
  return { ...createBody(), jumpsUsed: 0, supportId: null, jet: 0, landing: 0 };
}
export function jumpRunner(body: Runner): boolean {
  if (body.jumpsUsed >= 2 || body.active && body.age < 0.10) return false;
  const second = body.jumpsUsed === 1;
  body.jumpsUsed++;
  body.velocityY = second ? -670 : -720;
  body.age = 0;
  body.active = true;
  body.released = false;
  body.supportId = null;
  if (second) body.jet = 0.24;
  return true;
}
export function isAnimal(item: Terrain): boolean { return item.kind === "opossum" || item.kind === "slug"; }
function patrolProgress(item: Terrain, time: number): number {
  const { period, phase, startedAt } = item.patrol!;
  const progress = (time - startedAt) / period + phase / (Math.PI * 2);
  return ((progress % 1) + 1) % 1;
}
export function patrolOffset(item: Terrain, time: number): number {
  if (!isAnimal(item) || !item.patrol) return 0;
  const progress = patrolProgress(item, time);
  // Uniform walking between fixed world-space limits; turn without teleporting.
  return item.patrol.radius * (progress < 0.5 ? progress * 4 - 1 : 3 - progress * 4);
}
export function patrolDirection(item: Terrain, time: number): number {
  if (!isAnimal(item) || !item.patrol) return -1;
  return patrolProgress(item, time) < 0.5 ? 1 : -1;
}
export function terrainX(item: Terrain, time: number): number {
  return item.x + patrolOffset(item, time) - runDistance(time);
}
function overlapsFeet(item: Terrain, time: number): boolean {
  const x = terrainX(item, time);
  return PLAYER.x + PLAYER.width - 8 > x && PLAYER.x + 8 < x + item.width;
}
function land(body: Runner, top: number, supportId: number | null): void {
  if (body.active) body.landing = 0.14;
  body.y = top - PLAYER.height;
  body.velocityY = 0;
  body.active = false;
  body.jumpsUsed = 0;
  body.supportId = supportId;
  body.jet = 0;
}
/** 与测试共用：平台单向承托，从下方可穿过，从上方下落才能站稳。 */
export function stepRunner(body: Runner, held: boolean, terrain: Terrain[], time: number): void {
  body.jet = Math.max(0, body.jet - STEP);
  body.landing = Math.max(0, body.landing - STEP);
  if (!body.active && body.supportId !== null) {
    const support = terrain.find(item => item.id === body.supportId);
    if (!support || !overlapsFeet(support, time)) {
      body.active = true;
      body.jumpsUsed = 1; // 走出平台只保留一次空中补救，不能凭空得到两次跳跃。
      body.age = HOLD_SECONDS;
      body.released = true;
      body.supportId = null;
    }
  }
  if (!body.active) return;
  const previousFeet = body.y + PLAYER.height;
  if (!held) body.released = true;
  const boost = body.jumpsUsed === 1 && !body.released && body.age < HOLD_SECONDS;
  const gravity = body.velocityY >= 0 ? 5400 : body.jumpsUsed === 2 ? 1500 : boost ? 500 : 2400;
  body.velocityY += gravity * STEP;
  body.y += body.velocityY * STEP;
  body.age += STEP;
  // 近画面上沿时不再上升，角色及剩余次数始终可见。
  if (body.y < 10) { body.y = 10; body.velocityY = Math.max(0, body.velocityY); }
  if (body.velocityY >= 0) {
    const platforms = terrain.filter(item => item.kind === "platform" &&
      overlapsFeet(item, time) && previousFeet <= item.top + 1 && body.y + PLAYER.height >= item.top);
    const platform = platforms.sort((a, b) => a.top - b.top)[0];
    if (platform) { land(body, platform.top, platform.id); return; }
  }
  if (body.y + PLAYER.height >= GROUND_Y) land(body, GROUND_Y, null);
}
export function hitsHazard(body: Runner, terrain: Terrain[], time: number): boolean {
  return terrain.some(item => item.kind !== "platform" && intersects({ ...PLAYER, y: body.y }, {
    x: terrainX(item, time), y: item.top, width: item.width, height: GROUND_Y - item.top,
  }));
}

export const STAGE_NAMES = ["热身", "组合", "攀升", "挑战"] as const;
export function difficultyAt(time: number): number {
  return time < 18 ? 0 : time < 40 ? 1 : time < 65 ? 2 : 3;
}
export type CourseSection = {
  start: number; end: number; pattern: number; difficulty: number;
  terrain: Terrain[]; referenceJumps: number[];
};

export function doubleJumpSpan(time: number, difficulty: number): number {
  // Count the runner's own width in crossing time, especially at gentle opening speeds.
  return 0.76 + difficulty * 0.02 - Math.max(0, PLAYER.width / runSpeed(time) - PLAYER.width / 585);
}

export function sectionDuration(pattern: number, difficulty: number): number {
  return [4.3, 3.8, 3.5, 3.2][difficulty] + (pattern === 8 ? 1.0 : pattern >= 7 ? 0.5 : 0);
}

/** 九种正式路线加单障碍教学；referenceJumps只用于验证，不参与自动操作。 */
export function buildSection(pattern: number, t: number, difficulty: number, serial = 0): CourseSection {
  let id = serial * 10;
  const kinds = ["cactus", "thorns", "crystals", "spikes"] as const;
  const kind = kinds[serial % kinds.length];
  const item = (kind: Terrain["kind"], at: number, duration: number, height: number, label = ""): Terrain => ({
    id: id++, kind, x: PLAYER.x + PLAYER.width + runDistance(at),
    width: runDistance(at + duration) - runDistance(at), top: GROUND_Y - height, label, passed: false,
  });
  let terrain: Terrain[];
  let jumps: number[];
  if (pattern === 7) {
    // A rounded hill: climb, crest, then land on a lower shelf.
    terrain = [item("platform", t, 0.58, 72),
      item("platform", t + 0.68, 0.60, 126), item("platform", t + 1.42, 0.62, 64),
      item("spikes", t + 0.76, 0.48, 44)];
    jumps = [-0.25, 0.50, 1.17];
  } else if (pattern === 8) {
    // The high route has a lower exit shelf instead of dropping straight to the ground.
    terrain = [item("platform", t, 0.54, 72), item("platform", t + 0.66, 0.55, 140),
      item("platform", t + 1.32, 0.60, 208), item("platform", t + 2.06, 0.62, 136),
      item("spikes", t + 0.75, 1.06, 44)];
    jumps = [-0.25, 0.43, 1.07];
  } else if (pattern === 9) {
    // A low dip followed by a fresh ascent, with a landing to replenish jumps.
    terrain = [item("platform", t, 0.54, 72), item("platform", t + 0.62, 0.70, 40),
      item("platform", t + 1.40, 0.65, 112), item("spikes", t + 1.50, 0.45, 44)];
    jumps = [-0.25, 1.17];
  } else if (pattern === 6) {
    terrain = [item("crystals", t, 0.12, 44)];
    jumps = [-0.18];
  } else if (pattern === 0) {
    terrain = [item("platform", t, 0.58 - difficulty * 0.02, 72, "平台接力 · 落地补满"),
      item("platform", t + 0.68, 0.65 - difficulty * 0.04, 126, "再上一级"),
      item(kind, t + 0.76, 0.50, 46)];
    jumps = [-0.25, 0.50];
  } else if (pattern === 1) {
    const width = doubleJumpSpan(t, difficulty);
    terrain = [item("spikes", t, width, 48, "连续危险带 · 空中二段跳")];
    jumps = [-0.10, 0.28];
  } else if (pattern === 2) {
    const gap = 1.45 - difficulty * 0.13;
    terrain = [item(kind, t, 0.09 + difficulty * 0.01, 48, "单跳"),
      item(kinds[(serial + 2) % 4], t + gap, 0.12, 56, "准备下一跳")];
    jumps = [-0.18, gap - 0.18];
  } else if (pattern === 3) {
    const gap = 0.96 - difficulty * 0.05;
    terrain = [item("thorns", t, 0.10, 48, "三连障碍 · 落地再跳"),
      item("crystals", t + gap, 0.11, 54), item("spikes", t + gap * 2, 0.12, 48)];
    jumps = [-0.18, gap - 0.18, gap * 2 - 0.18];
  } else if (pattern === 4) {
    terrain = [item("platform", t, 0.54, 72, "阶梯攀升 · 三次落点"),
      item("platform", t + 0.66, 0.55, 140), item("platform", t + 1.32, 0.60, 208, "高台安全落点"),
      item("spikes", t + 0.75, 0.99, 44)];
    jumps = [-0.25, 0.43, 1.07];
  } else {
    terrain = [item("crystals", t, 0.12, 40, "落脚点 → 二段跳"),
      item("platform", t + 0.12, 0.50, 60, "落稳补满，再起跳"),
      item("spikes", t + 0.63, 0.60, 44)];
    jumps = [-0.18, 0.54, 0.92];
  }
  // At slower speeds the player's full width takes longer to clear a ground hazard.
  // Recenter the proven short-jump window rather than weakening collision validation.
  if (pattern === 2 || pattern === 3 || pattern === 6) {
    const delay = Math.max(0, (585 - runSpeed(t)) / 215) * 0.06;
    jumps = jumps.map(jump => jump + delay);
  }
  return { start: t, end: t + sectionDuration(pattern, difficulty), pattern, difficulty,
    terrain, referenceJumps: jumps.map(offset => t + offset) };
}

/** 验证独立操作误差，而不只是整段动作一起提前/延后。 */
export function validateSection(section: CourseSection, margin = 0.02): boolean {
  const actions = section.referenceJumps;
  const until = section.end - 0.55; // 下一段出现前，必须已落到地面并留出恢复时间。
  if (actions.some((action, i) => i > 0 && action - actions[i - 1] < 0.28 + margin * 2)) return false;
  if (section.terrain.some(item => terrainX(item, until) + item.width >= PLAYER.x - 8)) return false;
  if ([0, 4, 7, 8, 9].includes(section.pattern)) {
    // 普通平台接力最后应能安全走下，随机障碍不得超出最后一块平台。
    const platformEnd = Math.max(...section.terrain.filter(item => item.kind === "platform").map(item => item.x + item.width));
    if (section.terrain.some(item => item.kind !== "platform" && item.x + item.width + (item.patrol?.radius ?? 0) > platformEnd)) return false;
  }
  const simulate = (offsets: number[], phase: number, hold: number): boolean => {
    const body = createRunner();
    const landed = new Set<number>();
    let next = 0;
    for (let time = section.start - 0.8 + phase; time <= until; time += STEP) {
      if (next < actions.length && time >= actions[next] + offsets[next]) {
        if (!jumpRunner(body)) return false;
        next++;
      }
      stepRunner(body, body.age < hold, section.terrain, time);
      if (hitsHazard(body, section.terrain, time)) return false;
      if (body.supportId !== null) landed.add(body.supportId);
    }
    return next === actions.length && !body.active && body.supportId === null &&
      section.terrain.every(item => item.kind !== "platform" || landed.has(item.id));
  };
  const phases = [0, STEP / 4, STEP / 2, STEP * 3 / 4];
  for (let mask = 0; mask < 2 ** actions.length; mask++) {
    const offsets = actions.map((_, index) => mask & (1 << index) ? margin : -margin);
    for (const phase of phases) if (!simulate(offsets, phase, 0)) return false;
  }
  const center = actions.map(() => 0);
  return phases.every(phase => simulate(center, phase, 0) && simulate(center, phase, 0.05));
}

function randomizeSection(base: CourseSection, random: () => number): CourseSection {
  const stretch = 0.94 + random() * 0.12;
  const origin = PLAYER.x + PLAYER.width + runDistance(base.start);
  const section: CourseSection = { ...base,
    end: base.end + (random() - 0.5) * 0.5,
    referenceJumps: base.referenceJumps.map(time => base.start + (time - base.start) * stretch),
    terrain: base.terrain.map(item => ({ ...item })),
  };
  const hazards = ["cactus", "thorns", "crystals", "spikes"] as const;
  let previousKind: Terrain["kind"] | null = null;
  for (const [index, item] of section.terrain.entries()) {
    if (item.kind !== "platform") {
      // Wide strips are one authored spike surface, never two abutting materials.
      const choices = base.pattern === 1 || base.pattern === 5 && index === 2
        ? ["spikes"] as const : hazards.filter(kind => kind !== previousKind);
      item.kind = choices[Math.floor(random() * choices.length)];
      previousKind = item.kind;
    }
    // 宽危险带保持连续，不能随机出一条可站立的缝隙。
    const shift = base.pattern === 1 ? 0 : (random() - 0.5) * runSpeed(base.start) * 0.09;
    item.x = origin + (item.x - origin) * stretch + shift;
    item.width *= base.pattern === 1 ? stretch : 0.88 + random() * 0.24;
    item.top += (random() - 0.5) * (item.kind === "platform" ? 28 : 12);
  }
  if (base.pattern === 1) {
    const first = section.terrain[0];
    // One uninterrupted hazard and one score event; still requires the second jump.
    const minimum = runSpeed(base.start) * doubleJumpSpan(base.start, 0);
    first.width = Math.max(minimum, first.width);
  }
  replaceWithAnimals(section, random);
  return section;
}

function replaceWithAnimals(section: CourseSection, random: () => number): void {
  // 二段跳宽危险带保留连续性；落脚点组合仅替换入口障碍，不破坏后半段。
  if (section.pattern === 1 || random() >= 0.35) return;
  const eligible = section.terrain.filter(item => item.kind !== "platform");
  const candidates = section.pattern === 5 ? eligible.slice(0, 1) : eligible;
  // Occasional single patrol, rather than one guaranteed animal plus extra replacements.
  const selected = candidates[Math.floor(random() * candidates.length)];
  if (selected) {
    const item = selected;
    const oldCenter = item.x + item.width / 2;
    item.kind = random() < 0.5 ? "opossum" : "slug";
    item.width = 62 + random() * 8;
    item.top = GROUND_Y - (item.kind === "opossum" ? 46 + random() * 4 : 40 + random() * 4);
    item.x = oldCenter - item.width / 2;
    item.patrol = {
      radius: 22 + random() * 8,
      period: 2.0 + random() * 0.40,
      phase: random() * Math.PI * 2,
      startedAt: section.start,
    };
  }
}

/** 难度池内洗牌抽取，再扰动几何并用同一物理模型拒绝不可通行候选。 */
export class AdventureCourse {
  private nextAt: number;
  private section = 0;
  private bag: number[] = [];
  private bagDifficulty = -1;
  private previousPattern = -1;
  private readonly random: () => number;
  lastSection: CourseSection | null = null;

  constructor(random: () => number = Math.random) {
    this.random = () => Math.max(0, Math.min(0.999999999, random()));
    this.nextAt = 1.9 + this.random() * 0.5;
  }

  next(): Terrain[] {
    const difficulty = difficultyAt(this.nextAt);
    const pools = [[2], [3, 0, 1, 2, 7], [4, 3, 1, 0, 2, 7, 9], [5, 4, 3, 1, 0, 2, 7, 8, 9]];
    if (!this.bag.length || this.bagDifficulty !== difficulty) {
      this.bag = [...pools[difficulty]];
      this.bagDifficulty = difficulty;
      for (let i = this.bag.length - 1; i > 0; i--) {
        const index = Math.floor(this.random() * (i + 1));
        [this.bag[i], this.bag[index]] = [this.bag[index], this.bag[i]];
      }
      if (this.bag.length > 1 && this.bag[0] === this.previousPattern) [this.bag[0], this.bag[1]] = [this.bag[1], this.bag[0]];
    }
    // Introduce one isolated hazard at a time before pairs and mixed platform sections.
    const pattern = this.section < 2 ? 6 : this.bag.shift()!;
    const serial = this.section++;
    const base = buildSection(pattern, this.nextAt, difficulty, serial);
    let section: CourseSection | null = null;
    if (serial === 0 && validateSection(base)) section = base;
    for (let attempt = 0; !section && attempt < 8; attempt++) {
      const candidate = randomizeSection(base, this.random);
      if (validateSection(candidate)) { section = candidate; break; }
    }
    // 重试有上限，避免渲染卡顿；回退模板也必须通过校验。
    if (!section) {
      section = base;
      if (!validateSection(section)) {
        section = buildSection(2, this.nextAt, difficulty, serial);
        if (!validateSection(section)) throw new Error("无法生成可通过的随机关卡");
      }
    }
    this.previousPattern = section.pattern;
    this.lastSection = section;
    this.nextAt = section.end;
    return section.terrain;
  }
}
