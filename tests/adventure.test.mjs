import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STEP, GROUND_Y, PLAYER, WORLD_HEIGHT } from '../src/game/physics.ts';
import { AdventureCourse, buildSection, validateSection, difficultyAt, createRunner, jumpRunner, stepRunner, hitsHazard,
  isAnimal, patrolOffset, patrolDirection, terrainX,
  runSpeed, runDistance, doubleJumpSpan, sectionDuration } from '../src/game/Adventure.ts';
import { VoiceJumpDetector } from '../src/input/VoiceJumpDetector.ts';

function seeded(seed) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}
const course = new AdventureCourse(seeded(42));
const sections = Array.from({ length: 150 }, () => { course.next(); return course.lastSection; });
function simulate(terrain, from, to, actions, hold = 0, phase = 0) {
  const body = createRunner();
  const landed = new Set();
  let next = 0;
  for (let time = from + phase; time <= to; time += STEP) {
    if (next < actions.length && time >= actions[next]) {
      if (!jumpRunner(body)) return { ok: false, landed, reason: 'jump rejected' };
      next++;
    }
    stepRunner(body, body.age < hold, terrain, time);
    if (body.supportId !== null) landed.add(body.supportId);
    if (hitsHazard(body, terrain, time)) return { ok: false, landed, reason: `collision at ${time}` };
    assert.ok(body.y >= 10);
  }
  return { ok: next === actions.length && !body.active, landed };
}

test('二段跳喷气只触发一次，不能三连跳，落地后恢复两次', () => {
  const body = createRunner();
  assert.ok(jumpRunner(body));
  assert.equal(jumpRunner(body), false); // 同一瞬间的重复输入。
  for (let i = 0; i < 36; i++) stepRunner(body, false, [], i * STEP);
  assert.ok(jumpRunner(body));
  assert.equal(body.jumpsUsed, 2);
  assert.equal(body.jet, 0.24);
  assert.equal(jumpRunner(body), false);
  for (let i = 0; i < 240; i++) stepRunner(body, true, [], i * STEP);
  assert.equal(body.jumpsUsed, 0);
  assert.equal(body.jet, 0);
  assert.equal(body.y, GROUND_Y - PLAYER.height);
  assert.ok(jumpRunner(body));
});

test('平台从下方可穿过，下降时承托并恢复次数；走出边缘只剩一次空中跳', () => {
  const body = createRunner();
  const platform = { id: 999, kind: 'platform', x: 0, width: 10000, top: GROUND_Y - 72, label: '', passed: false };
  jumpRunner(body);
  for (let i = 0; i < 15; i++) stepRunner(body, false, [platform], i * STEP);
  assert.ok(body.active);
  assert.equal(body.supportId, null);
  for (let i = 15; i < 90; i++) stepRunner(body, false, [platform], i * STEP);
  assert.equal(body.supportId, platform.id);
  assert.equal(body.y, platform.top - PLAYER.height);
  assert.equal(body.jumpsUsed, 0);
  stepRunner(body, false, [], 1);
  assert.equal(body.jumpsUsed, 1);
  assert.ok(jumpRunner(body));
  assert.equal(body.jumpsUsed, 2);
});

test('单一连续危险带：单次最长跳无法通过，轻点二段跳存在一段容错窗口', () => {
  for (const t of [6, 30, 70, 600]) {
    const terrain = buildSection(1, t, difficultyAt(t), 1).terrain;
    // 遍历单跳起跳时刻，长按也不能代替第二跳。
    for (let lead = -0.10; lead <= 1.1; lead += STEP) {
      assert.equal(simulate(terrain, t - 1.2, t + 2, [t - lead], 1).ok, false);
    }
    // 不要求长按：两次轻点、多个帧相位和不同第二掌时刻均可通过。
    for (const lead of [0.08, 0.10, 0.12]) {
      for (const delay of [0.34, 0.36, 0.38, 0.40, 0.42]) {
        for (const phase of [0, STEP / 2]) {
          assert.ok(simulate(terrain, t - 1, t + 2, [t - lead, t - lead + delay], 0, phase).ok,
            `time=${t} lead=${lead} delay=${delay} phase=${phase}`);
        }
      }
    }
  }
});

test('连续150段渐进跑道可衔接，每一个参考平台都真正落上', () => {
  const terrain = sections.flatMap(section => section.terrain);
  const actions = sections.flatMap(section => section.referenceJumps);
  const result = simulate(terrain, 0, sections.at(-1).end + 1, actions);
  assert.ok(result.ok, result.reason);
  assert.equal(result.landed.size, terrain.filter(item => item.kind === 'platform').length);
  for (let i = 1; i < actions.length; i++) assert.ok(actions[i] - actions[i - 1] >= 0.28);
});

test('九种路线及单障碍教学在各速度和难度下，允许前后20ms误差和不同帧相位', () => {
  for (let pattern = 0; pattern < 10; pattern++) {
    for (const time of [3, 30, 60, 120, 600]) {
      for (const difficulty of [0, 3]) {
        const section = buildSection(pattern, time, difficulty, pattern);
        for (const jitter of [-0.02, 0, 0.02]) {
          for (const phase of [0, STEP / 2]) {
            const result = simulate(section.terrain, time - 1, section.end - 0.55,
              section.referenceJumps.map(jump => jump + jitter), 0, phase);
            assert.ok(result.ok, `pattern=${pattern} time=${time} difficulty=${difficulty} jitter=${jitter}: ${result.reason}`);
            assert.equal(result.landed.size, section.terrain.filter(item => item.kind === 'platform').length);
          }
        }
      }
    }
  }
});

test('开局先独立介绍危险物，热身阶段不突然出现平台和二段跳长带', () => {
  for (const seed of [1, 42, 100]) {
    const planner = new AdventureCourse(seeded(seed));
    for (let i = 0; i < 2; i++) {
      const terrain = planner.next();
      assert.equal(planner.lastSection.pattern, 6);
      assert.equal(terrain.length, 1);
      assert.equal(planner.lastSection.referenceJumps.length, 1);
      assert.equal(terrain[0].kind === 'platform', false);
    }
    while (true) {
      planner.next();
      if (planner.lastSection.difficulty > 0) break;
      assert.equal(planner.lastSection.pattern, 2);
    }
  }
});

test('新增高低路线都有真实可达的上下落点，并保留落地恢复时间', () => {
  for (const pattern of [7, 8, 9]) {
    for (const time of [3, 30, 60, 120, 600]) {
      const section = buildSection(pattern, time, difficultyAt(time));
      const platforms = section.terrain.filter(item => item.kind === 'platform');
      const heights = platforms.map(item => GROUND_Y - item.top);
      assert.ok(heights.some((height, i) => i > 0 && height > heights[i - 1]));
      assert.ok(heights.some((height, i) => i > 0 && height < heights[i - 1]));
      assert.ok(validateSection(section));
      const result = simulate(section.terrain, time - 1, section.end - 0.55, section.referenceJumps);
      assert.ok(result.ok);
      assert.equal(result.landed.size, platforms.length);
    }
  }
  const generated = new Set(sections.map(section => section.pattern));
  for (const pattern of [7, 8, 9]) assert.ok(generated.has(pattern));
});

test('难度不仅提速：解锁新组合、缩短休息段、增加连贯操作数量', () => {
  assert.deepEqual([0,18,40,65].map(difficultyAt), [0,1,2,3]);
  const kinds = new Set(sections.flatMap(section => section.terrain.map(item => item.kind)));
  assert.equal(kinds.size, 7);
  const easy = sections.filter(section => section.difficulty === 0);
  const hard = sections.filter(section => section.difficulty === 3);
  assert.deepEqual([...new Set(easy.map(section => section.pattern))].sort(), [2, 6]);
  assert.equal(new Set(hard.map(section => section.pattern)).size, 9);
  const inputsPerSecond = group => group.reduce((sum,s) => sum + s.referenceJumps.length, 0) /
    group.reduce((sum,s) => sum + s.end - s.start, 0);
  assert.ok(inputsPerSecond(hard) > inputsPerSecond(easy) * 1.5);
  assert.ok(hard.some(section => section.terrain.some(item => item.kind === 'platform' && GROUND_Y - item.top > 200)));
});

test('画布增加纵向空间，普通长跳接二段跳不再碰到画面上沿', () => {
  assert.equal(WORLD_HEIGHT, 560);
  assert.equal(GROUND_Y, 480);
  const body = createRunner();
  jumpRunner(body);
  for (let frame = 0; frame < 60; frame++) stepRunner(body, true, [], frame * STEP);
  jumpRunner(body);
  let top = body.y;
  for (let frame = 0; frame < 120; frame++) { stepRunner(body, false, [], frame * STEP); top = Math.min(top, body.y); }
  assert.ok(top > 10);
});

test('原有声控两次独立短声可触发喷气，持续一声不会自动二段跳', () => {
  for (const continuous of [false, true]) {
    const body = createRunner();
    const detector = new VoiceJumpDetector({ triggerLevel: 0.05, releaseRatio: 0.55, cooldownMs: 280 });
    let jumps = 0;
    for (let frame = 0; frame < 80; frame++) {
      const time = frame * STEP;
      const loud = continuous || time < 0.05 || time >= 0.36 && time < 0.41;
      if (frame % 2 === 0 && detector.update(loud ? 0.1 : 0, time * 1000) && jumpRunner(body)) jumps++;
      stepRunner(body, detector.isHeld(), [], time);
    }
    assert.equal(jumps, continuous ? 1 : 2);
  }
});

test('开局300且前20秒轻微提速，随后平滑加速，距离积分一致', () => {
  assert.equal(runSpeed(0), 300);
  assert.ok(runSpeed(20) > 315 && runSpeed(20) < 325);
  assert.ok(runSpeed(30) < 345);
  assert.ok(runSpeed(60) > 430 && runSpeed(60) < 435);
  for (let time = 0; time < 600; time += 1) assert.ok(runSpeed(time + 1) > runSpeed(time));
  assert.ok(runSpeed(1000) <= 660 * 1.4);
  for (const time of [0, 10, 60, 600]) {
    assert.ok(Math.abs((runDistance(time + STEP) - runDistance(time)) / STEP - runSpeed(time)) < 0.03);
  }
});

test('随机种子可复现，不同种子改变类型、组合次序、间距和平台高度', () => {
  function sample(seed) {
    const planner = new AdventureCourse(seeded(seed));
    return Array.from({ length: 30 }, () => { planner.next(); return planner.lastSection; });
  }
  const a = sample(2026), b = sample(7);
  assert.deepEqual(a, sample(2026));
  assert.notDeepEqual(a.map(s => s.pattern), b.map(s => s.pattern));
  assert.notDeepEqual(a.flatMap(s => s.terrain.map(item => item.kind)), b.flatMap(s => s.terrain.map(item => item.kind)));
  assert.notDeepEqual(a.map(s => s.start), b.map(s => s.start));
  const platforms = a.flatMap(s => s.terrain.filter(item => item.kind === 'platform'));
  assert.ok(new Set(platforms.map(item => item.top.toFixed(1))).size > 10);
  assert.ok(new Set(a.flatMap(s => s.terrain.map(item => item.width.toFixed(1)))).size > 40);
});

test('1000段随机候选受难度与物理约束，5条连续路线均可完整通过', () => {
  const pools = [[2,6], [0,1,2,3,7], [0,1,2,3,4,7,9], [0,1,2,3,4,5,7,8,9]];
  const kinds = new Set();
  for (const seed of [7, 42, 2026, 919, 12345]) {
    const planner = new AdventureCourse(seeded(seed));
    const samples = [];
    for (let index = 0; index < 200; index++) {
      planner.next();
      const section = planner.lastSection;
      assert.ok(pools[section.difficulty].includes(section.pattern));
      assert.ok(validateSection(section));
      const baseDuration = sectionDuration(section.pattern, section.difficulty);
      assert.ok(Math.abs(section.end - section.start - baseDuration) <= 0.250001);
      for (const item of section.terrain) {
        assert.ok(item.width > 0);
        assert.ok(item.top < GROUND_Y && item.top >= GROUND_Y - 224);
        kinds.add(item.kind);
      }
      if (section.pattern === 1) {
        assert.equal(section.terrain.length, 1);
        assert.equal(section.terrain[0].kind, 'spikes');
        assert.ok(section.terrain[0].width >= runSpeed(section.start) * doubleJumpSpan(section.start, 0));
      }
      if (section.pattern === 5) {
        assert.equal(section.terrain.length, 3);
        assert.equal(section.terrain[2].kind, 'spikes');
      }
      if (samples.length) assert.equal(section.start, samples.at(-1).end);
      samples.push(section);
    }
    const result = simulate(samples.flatMap(s => s.terrain), 0, samples.at(-1).end + 1,
      samples.flatMap(s => s.referenceJumps));
    assert.ok(result.ok, `seed=${seed}: ${result.reason}`);
    assert.equal(result.landed.size, samples.flatMap(s => s.terrain).filter(item => item.kind === 'platform').length);
  }
  assert.equal(kinds.size, 7);
});

test('动物在有限区域平滑往返且慢于卷轴，渲染与碰撞使用同一位置', () => {
  const animal = { id: 1, kind: 'opossum', x: PLAYER.x + 26, width: 55,
    top: GROUND_Y - 44, label: '', passed: false,
    patrol: { radius: 32, period: 1.2, phase: Math.PI, startedAt: 0 } };
  assert.equal(patrolOffset(animal, 0), 32);
  assert.equal(patrolOffset(animal, 0.6), -32);
  assert.equal(patrolDirection(animal, 0.3), -1);
  assert.equal(patrolDirection(animal, 0.9), 1);
  for (let time = 0; time < 30; time += STEP) {
    assert.ok(Math.abs(patrolOffset(animal, time)) <= 32);
    assert.ok(Math.abs(patrolOffset(animal, time + STEP) - patrolOffset(animal, time)) / STEP < 108);
    assert.ok(terrainX(animal, time + STEP) < terrainX(animal, time)); // 离开左侧后不会突然折返。
  }
  const body = createRunner();
  assert.equal(hitsHazard(body, [animal], 0), false); // 贴图已巡逻至右侧，不按初始中心判碰撞。
  animal.patrol.phase = 0;
  assert.equal(hitsHazard(body, [animal], 0), true);
});

test('动物替换固定障碍而不是额外叠加，宽危险带仍保持静态连续', () => {
  const planner = new AdventureCourse(seeded(42));
  let animals = 0, fixed = 0;
  const species = new Set();
  for (let i = 0; i < 100; i++) {
    const terrain = planner.next();
    const section = planner.lastSection;
    assert.equal(terrain.length, buildSection(section.pattern, section.start, section.difficulty).terrain.length);
    for (const item of terrain) {
      if (isAnimal(item)) {
        animals++; species.add(item.kind);
        assert.ok(item.width <= 70);
        assert.ok(item.patrol.radius >= 22 && item.patrol.radius <= 30);
        assert.ok(item.patrol.period >= 2 && item.patrol.period <= 2.4);
        assert.ok(item.patrol.radius * 4 / item.patrol.period <= 60);
      } else if (item.kind !== 'platform') fixed++;
    }
    assert.ok(terrain.filter(isAnimal).length <= 1);
    if (section.pattern === 1) assert.ok(terrain.every(item => !isAnimal(item)));
  }
  assert.equal(species.size, 2);
  assert.ok(animals / (animals + fixed) > 0.10);
  assert.ok(animals / (animals + fixed) < 0.35);
});

test('动物缓慢巡逻且边界转身连续，不为高速卷轴强行加快动作', () => {
  let visibleTurns = 0, animals = 0;
  for (const section of sections) {
    for (const animal of section.terrain.filter(isAnimal)) {
      const directions = new Set();
      for (let time = Math.max(0, section.start - 3); time < section.end + 2; time += STEP) {
        const x = terrainX(animal, time);
        if (x >= 0 && x + animal.width <= 900) directions.add(patrolDirection(animal, time));
        assert.ok(Math.abs(patrolOffset(animal, time)) <= animal.patrol.radius + 1e-8);
      }
      animals++;
      if (directions.size === 2) visibleTurns++;
      const turn = animal.patrol.startedAt + animal.patrol.period * (0.5 - animal.patrol.phase / (Math.PI * 2));
      assert.ok(Math.abs(patrolOffset(animal, turn - 1e-6) - patrolOffset(animal, turn + 1e-6)) < 0.001);
      assert.equal(patrolDirection(animal, turn - 1e-6), 1);
      assert.equal(patrolDirection(animal, turn + 1e-6), -1);
    }
  }
  // At top scroll speed an animal can leave the viewport before its next natural turn.
  assert.ok(visibleTurns > animals * 0.3);
});

test('极端随机输入也有受验证的回退路线，坏布局会被拒绝', () => {
  for (const value of [0, 0.5, 0.999999999]) {
    const planner = new AdventureCourse(() => value);
    for (let i = 0; i < 60; i++) {
      planner.next();
      assert.ok(validateSection(planner.lastSection));
    }
  }
  const invalid = buildSection(2, 5, 0);
  invalid.terrain[0].top = 100; // 第一跳无法跨过。
  assert.equal(validateSection(invalid), false);
  const noRecovery = buildSection(4, 20, 3);
  noRecovery.end = noRecovery.start + 1.8;
  assert.equal(validateSection(noRecovery), false);
  const overhang = buildSection(0, 300, 3);
  overhang.terrain.at(-1).width += 160;
  assert.equal(validateSection(overhang), false); // 走下普通平台后不可踩进随机伸出的障碍尾端。
});
