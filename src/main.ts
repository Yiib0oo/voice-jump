import "./styles.css";
import { MicrophoneInput } from "./audio/MicrophoneInput";
import { Game, type GameState } from "./game/Game";
import { VoiceJumpDetector } from "./input/VoiceJumpDetector";
import { PointerJumpInput } from "./input/PointerJumpInput";

const canvas = requireElement<HTMLCanvasElement>("game");
const startButton = requireElement<HTMLButtonElement>("start-button");
const restartButton = requireElement<HTMLButtonElement>("restart-button");
const scoreElement = requireElement<HTMLElement>("score");
const gameStatus = requireElement<HTMLElement>("game-status");
const audioStatus = requireElement<HTMLElement>("audio-status");
const meterFill = requireElement<HTMLElement>("meter-fill");
const thresholdMark = requireElement<HTMLElement>("threshold-mark");

const microphone = new MicrophoneInput();
const detector = new VoiceJumpDetector({
  triggerLevel: 0.05,
  releaseRatio: 0.55,
  cooldownMs: 280,
});

const game = new Game(canvas, {
  onScoreChange: (score) => {
    scoreElement.textContent = String(score);
  },
  onStateChange: handleGameState,
});

let audioLoopId = 0;
let keyboardHeld = false;
let jumpSource: "keyboard" | "voice" | "pointer" | null = null;
const pointer = new PointerJumpInput(canvas, () => {
  if (startButton.disabled && !startButton.hidden) return false;
  if (game.getState() !== "running") { game.start(); detector.reset(); }
  return beginInputJump("pointer");
}, () => {
  if (jumpSource === "pointer") game.setHeld(false);
});

function beginInputJump(source: "keyboard" | "voice" | "pointer"): boolean {
  if (!game.jump()) return false;
  jumpSource = source;
  game.setHeld(true);
  return true;
}

function resetManualInput(): void {
  pointer.reset();
  keyboardHeld = false;
  jumpSource = null;
  game.setHeld(false);
}

startButton.addEventListener("click", async () => {
  startButton.disabled = true;
  startButton.textContent = "正在请求麦克风…";

  try {
    await microphone.start();
    audioStatus.textContent = "校准环境音中，请暂时保持安静…";
    startButton.textContent = "校准中…";

    const calibration = await microphone.calibrate();
    detector.setTriggerLevel(calibration.triggerLevel);
    updateThresholdMark(calibration.triggerLevel);

    audioStatus.textContent = "原有声控已开启：第一声起跳，安静后空中再发声可二段跳；落地／落平台补满。也支持点击和空格，此版尚未加入专用鼓掌识别。";
    startButton.hidden = true;
    detector.reset();
    resetManualInput();
    game.start();
    runAudioLoop();
  } catch (error) {
    await microphone.stop();
    const message = error instanceof Error ? error.message : "无法开启麦克风";
    audioStatus.textContent = `${message}；仍可轻点／长按游戏画面，或使用空格键`;
    startButton.disabled = false;
    startButton.textContent = "再次尝试开启麦克风";
    game.start();
  }
});

restartButton.addEventListener("click", () => {
  detector.reset();
  resetManualInput();
  game.start();
});

window.addEventListener("keydown", (event) => {
  if (event.code !== "Space") return;
  event.preventDefault();
  if (event.repeat || startButton.disabled && !startButton.hidden) return;

  if (game.getState() !== "running") { game.start(); detector.reset(); }
  keyboardHeld = true;
  beginInputJump("keyboard");
});

window.addEventListener("keyup", (event) => {
  if (event.code !== "Space") return;
  keyboardHeld = false;
  if (jumpSource === "keyboard") game.setHeld(false);
});
window.addEventListener("blur", resetManualInput);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { resetManualInput(); detector.reset(); }
});

window.addEventListener("pagehide", () => {
  cancelAnimationFrame(audioLoopId);
  void microphone.stop();
});

function runAudioLoop(): void {
  const level = microphone.getLevel();
  const displayLevel = Math.min(level / 0.3, 1);
  meterFill.style.width = `${displayLevel * 100}%`;

  if (detector.update(level, performance.now()) && !keyboardHeld && !pointer.isHeld() && !document.hidden) {
    beginInputJump("voice");
  }
  if (jumpSource === "voice") game.setHeld(detector.isHeld() && !document.hidden);

  audioLoopId = requestAnimationFrame(runAudioLoop);
}

function handleGameState(state: GameState): void {
  if (state === "running") {
    gameStatus.textContent = "进行中";
    restartButton.hidden = true;
  } else if (state === "game-over") {
    gameStatus.textContent = "游戏结束";
    restartButton.hidden = false;
  } else {
    gameStatus.textContent = "准备开始";
  }
}

function updateThresholdMark(level: number): void {
  const position = Math.min(level / 0.3, 1) * 100;
  thresholdMark.style.left = `${position}%`;
}

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`缺少页面元素：${id}`);
  return element as T;
}
