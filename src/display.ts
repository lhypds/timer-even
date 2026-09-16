// Coalesce ticks while Bluetooth is busy; a failed write never marks a frame sent.
//
// A frame is a layout (where and how big the time is drawn) and the text to
// show, where an empty text means a blank line and `invert` lights the box
// with the text cut out of it. `create` builds the page for a
// layout (the start-up page, or a rebuild once one has existed); `update`
// writes new text into the page that is already there. A refused update means
// the page may be gone — glasses that rebooted, a host that dropped the page
// while the app was in the background — so the next attempt goes back through
// `create`.

import type { Layout } from "./layout.ts";

export interface Frame {
  layout: Layout;
  text: string;
  invert?: boolean;
}

export interface FrameTransport {
  create(frame: Frame): Promise<void>;
  update(frame: Frame): Promise<void>;
}

const RETRY_MS = 2000;
const frameKey = (frame: Frame) => `${frame.layout.key}|${frame.invert ? "!" : ""}${frame.text}`;

export class TimerDisplay {
  private desired: Frame | null = null;
  private sentKey: string | null = null;
  /** The layout of the page currently built on the glasses, if any. */
  private builtLayout: string | null = null;
  private busy = false;
  private retryAt = 0;
  private generation = 0;
  private enabled = true;
  private transport: FrameTransport;
  constructor(transport: FrameTransport) {
    this.transport = transport;
  }

  reconnect(): void {
    this.generation++;
    this.sentKey = null;
    this.retryAt = 0;
    this.enabled = true;
  }

  suspend(): void {
    this.enabled = false;
    this.generation++;
  }

  /** Whether the last frame asked for is the one on the glass. */
  settled(): boolean {
    return !this.busy && this.desired !== null && this.sentKey === frameKey(this.desired);
  }

  async paint(frame: Frame, now = Date.now()): Promise<void> {
    this.desired = frame;
    if (!this.enabled || this.busy || now < this.retryAt || this.sentKey === frameKey(frame)) return;
    this.busy = true;
    const generation = this.generation;
    try {
      while (this.enabled && generation === this.generation && this.desired && this.sentKey !== frameKey(this.desired)) {
        const next = this.desired;
        if (this.builtLayout !== next.layout.key) {
          await this.transport.create(next);
          this.builtLayout = next.layout.key;
        } else {
          try {
            await this.transport.update(next);
          } catch (error) {
            // The container may no longer exist; rebuild the page next time.
            this.builtLayout = null;
            throw error;
          }
        }
        if (generation !== this.generation) return;
        this.sentKey = frameKey(next);
      }
    } catch (error) {
      // A dropped frame is not worth stopping for: the next paint carries the
      // whole frame anyway, and a rebuild puts everything back in step.
      console.warn("could not paint the glasses:", error instanceof Error ? error.message : String(error));
      this.sentKey = null;
      this.retryAt = Date.now() + RETRY_MS;
    } finally {
      this.busy = false;
    }
  }
}
