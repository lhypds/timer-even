import {
  CreateStartUpPageContainer,
  ImageContainerProperty,
  ImageRawDataUpdate,
  ImageRawDataUpdateResult,
  RebuildPageContainer,
  StartUpPageCreateResult,
  TextContainerProperty,
  type EvenAppBridge,
} from "@evenrealities/even_hub_sdk";
import type { Frame, FrameTransport } from "./display.ts";
import { SCREEN_HEIGHT, SCREEN_WIDTH, type Layout } from "./layout.ts";
import { rasterize as defaultRasterize } from "./raster.ts";

export type Rasterize = (text: string, layout: Layout, invert: boolean) => Uint8Array[];

// Exactly one text container captures events on every page (lo-even's rule:
// none risks the page hearing nothing). It holds one space and no border, so
// it draws nothing; the time itself lives in the image containers above it. It
// covers the whole display because a text container whose content does not fit
// grows a scroll bar: a 20 × 29 box, one line tall in the simulator, showed one
// on glass. A space never fills the screen.
const captureBox = () =>
  new TextContainerProperty({
    containerID: 1,
    containerName: "timer",
    xPosition: 0,
    yPosition: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    borderWidth: 0,
    paddingLength: 0,
    isEventCapture: 1,
    zOrderIndex: 0,
    content: " ",
  });
const imageIdentity = (index: number) => ({
  containerID: 2 + index,
  containerName: `timer-img${index + 1}`,
});

function imageContainers(layout: Layout): ImageContainerProperty[] {
  // Every container on a page needs its own z-order; the SDK refuses duplicates.
  return layout.tiles.map(
    (tile, index) =>
      new ImageContainerProperty({
        ...imageIdentity(index),
        xPosition: tile.x,
        yPosition: tile.y,
        width: tile.width,
        height: tile.height,
        zOrderIndex: 1 + index,
      }),
  );
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function glassesTransport(bridge: EvenAppBridge, rasterize: Rasterize = defaultRasterize): FrameTransport {
  let started = false;
  // What each image container is showing, so a tick that changed one tile's
  // bytes sends one tile: the bytes are the largest write this app makes.
  let shown: Uint8Array[] = [];

  async function paintImages(frame: Frame): Promise<void> {
    const tiles = rasterize(frame.text, frame.layout, frame.invert === true);
    for (const [index, bytes] of tiles.entries()) {
      if (shown[index] && sameBytes(shown[index], bytes)) continue;
      const answer = await bridge.updateImageRawData(new ImageRawDataUpdate({ ...imageIdentity(index), imageData: bytes }));
      if (!ImageRawDataUpdateResult.isSuccess(ImageRawDataUpdateResult.normalize(answer))) {
        shown = [];
        throw new Error(`Glasses image refused: ${answer}`);
      }
      shown[index] = bytes;
    }
  }

  return {
    async create(frame) {
      if (!started) {
        // The OS wants one text-only start-up page per launch; the bitmap page
        // is then a rebuild (the SDK's documented order, and the one lo-even
        // ships).
        const result = await bridge.createStartUpPageContainer(
          new CreateStartUpPageContainer({
            containerTotalNum: 1,
            textObject: [captureBox()],
          }),
        );
        // `invalid` is also the host's answer when a start-up page already
        // exists — a hot reload in development, or a WebView reloaded under a
        // page the host kept (sc-even notes the same). A page that exists can
        // be rebuilt; oversize and out-of-memory cannot.
        if (result !== StartUpPageCreateResult.success && result !== StartUpPageCreateResult.invalid) {
          throw new Error(`Glasses startup: ${result}`);
        }
        started = true;
      }
      const images = imageContainers(frame.layout);
      const ok = await bridge.rebuildPageContainer(
        new RebuildPageContainer({
          containerTotalNum: 1 + images.length,
          textObject: [captureBox()],
          imageObject: images,
        }),
      );
      if (!ok) throw new Error(`Glasses rebuild refused: ${JSON.stringify(ok)}`);
      // Image containers are remade empty, so every tile is owed its bytes again.
      shown = [];
      await paintImages(frame);
    },
    update(frame) {
      return paintImages(frame);
    },
  };
}
