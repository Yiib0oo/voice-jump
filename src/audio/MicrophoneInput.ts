export type CalibrationResult = {
  noiseFloor: number;
  triggerLevel: number;
};

export class MicrophoneInput {
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private samples: Float32Array<ArrayBuffer> | null = null;

  async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("当前浏览器不支持麦克风输入");
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        autoGainControl: false,
        echoCancellation: false,
        noiseSuppression: false,
      },
      video: false,
    });

    this.context = new AudioContext();
    await this.context.resume();

    const source = this.context.createMediaStreamSource(this.stream);
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.25;
    source.connect(this.analyser);
    this.samples = new Float32Array(this.analyser.fftSize);
  }

  getLevel(): number {
    if (!this.analyser || !this.samples) return 0;

    this.analyser.getFloatTimeDomainData(this.samples);
    let sumSquares = 0;
    for (const sample of this.samples) {
      sumSquares += sample * sample;
    }

    return Math.sqrt(sumSquares / this.samples.length);
  }

  async calibrate(durationMs = 1200): Promise<CalibrationResult> {
    const readings: number[] = [];
    const startedAt = performance.now();

    while (performance.now() - startedAt < durationMs) {
      readings.push(this.getLevel());
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }

    const sorted = readings.sort((a, b) => a - b);
    const percentile90 = sorted[Math.floor(sorted.length * 0.9)] ?? 0.01;
    const noiseFloor = Math.max(percentile90, 0.005);

    return {
      noiseFloor,
      triggerLevel: Math.min(Math.max(noiseFloor * 3.2, 0.035), 0.22),
    };
  }

  async stop(): Promise<void> {
    this.stream?.getTracks().forEach((track) => track.stop());
    await this.context?.close();
    this.stream = null;
    this.context = null;
    this.analyser = null;
    this.samples = null;
  }
}
