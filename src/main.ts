import "./styles.css";
import { MicrophoneInput } from "./audio/MicrophoneInput";
import { Game, type GameState } from "./game/Game";
import { VoiceJumpDetector } from "./input/VoiceJumpDetector";

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
let jumpSource: "keyboard" | "voice" | null = null;

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

    audioStatus.textContent = "高／宽障碍请稍长喊；先安静下来再喊下一次";
    startButton.hidden = true;
    detector.reset();
    game.start();
    runAudioLoop();
  } catch (error) {
    await microphone.stop();
    const message = error instanceof Error ? error.message : "无法开启麦克风";
    audioStatus.textContent = `${message}；仍可按空格键测试`;
    startButton.disabled = false;
    startButton.textContent = "再次尝试开启麦克风";
    game.start();
  }
});

restartButton.addEventListener("click", () => {
  detector.reset();
  keyboardHeld = false;
  jumpSource = null;
  game.start();
});

window.addEventListener("keydown", (event) => {
  if (event.code !== "Space") return;
  event.preventDefault();
  if (event.repeat || startButton.disabled && !startButton.hidden) return;

  if (game.getState() !== "running") { game.start(); detector.reset(); }
  keyboardHeld = true;
  jumpSource = "keyboard";
  game.setHeld(true);
  game.jump();
});

window.addEventListener("keyup", (event) => {
  if (event.code !== "Space") return;
  keyboardHeld = false;
  if (jumpSource === "keyboard") game.setHeld(false);
});
window.addEventListener("blur", () => {
  keyboardHeld = false;
  jumpSource = null;
  game.setHeld(false);
});

window.addEventListener("pagehide", () => {
  cancelAnimationFrame(audioLoopId);
  void microphone.stop();
});

function runAudioLoop(): void {
  const level = microphone.getLevel();
  const displayLevel = Math.min(level / 0.3, 1);
  meterFill.style.width = `${displayLevel * 100}%`;

  if (detector.update(level, performance.now()) && !keyboardHeld && !document.hidden) {
    jumpSource = "voice";
    game.jump();
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
