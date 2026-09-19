/** 触屏、鼠标和触控笔共用：按下即起跳，松开停止加成，不自动连跳。 */
export class PointerJumpInput {
  private pointerId: number | null = null;
  private readonly target: HTMLElement;
  private readonly onRelease: () => void;

  constructor(target: HTMLElement, onPress: () => boolean, onRelease: () => void) {
    this.target = target;
    this.onRelease = onRelease;
    target.addEventListener("pointerdown", (event) => {
      if (!event.isPrimary || event.button !== 0 || this.pointerId !== null) return;
      event.preventDefault();
      if (!onPress()) return;
      this.pointerId = event.pointerId;
      target.setPointerCapture(event.pointerId);
    });
    const release = (event: PointerEvent): void => {
      if (event.pointerId === this.pointerId) this.reset();
    };
    target.addEventListener("pointerup", release);
    target.addEventListener("pointercancel", release);
    target.addEventListener("lostpointercapture", release);
    target.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  isHeld(): boolean { return this.pointerId !== null; }

  reset(): void {
    const id = this.pointerId;
    this.pointerId = null;
    if (id === null) return;
    this.onRelease();
    if (this.target.hasPointerCapture(id)) this.target.releasePointerCapture(id);
  }
}
