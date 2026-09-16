// The blink of a finished countdown, paced by the link rather than the clock.
//
// The phone flips its background every 500 ms. Each flip on the glasses is a
// frame over Bluetooth, and a frame can take longer than that to land; phases
// timed by the wall clock would then be skipped wholesale, and the blink would
// run at half the rate or worse. So a phase flips only once the previous one
// has actually reached the glass and has stood there for the period. On a
// quick link that is exactly the phone's rate; on a slow one it is as fast as
// the link allows, and regular.

export class Blinker {
  private on = false;
  private changedAt = 0;
  private period: number;
  constructor(period: number) {
    this.period = period;
  }

  /**
   * The phase for this tick. `settled` is whether the last frame asked for is
   * the one on the glass; nothing flips until it is.
   */
  phase(now: number, blinking: boolean, settled: boolean): boolean {
    if (!blinking) {
      this.on = false;
      this.changedAt = 0;
      return false;
    }
    if (settled && now - this.changedAt >= this.period) {
      this.on = !this.on;
      this.changedAt = now;
    }
    return this.on;
  }
}
