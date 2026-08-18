/** Dev-only: report which OpenCV pieces the WASM build actually exposes.
 *
 * The upgraded verifier needs knnMatch (for Lowe's ratio test) and
 * findHomography with USAC_MAGSAC; neither is guaranteed to be compiled into
 * a given opencv.js build, so check before building on them.
 */
import cvModule from "@techstark/opencv-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cv = any;

export async function getCv(): Promise<Cv> {
  const mod = cvModule as unknown as Cv;
  if (mod instanceof Promise) return mod;
  if (mod.Mat) return mod;
  await new Promise<void>((resolve) => {
    mod.onRuntimeInitialized = () => resolve();
  });
  return mod;
}

export async function probeCv(): Promise<Record<string, unknown>> {
  const cv = await getCv();
  return {
    findHomography: typeof cv.findHomography,
    USAC_MAGSAC: cv.USAC_MAGSAC,
    RANSAC: cv.RANSAC,
    knnMatch: typeof cv.BFMatcher?.prototype?.knnMatch,
    DMatchVectorVector: typeof cv.DMatchVectorVector,
    perspectiveTransform: typeof cv.perspectiveTransform,
    matFromArray: typeof cv.matFromArray,
    KeyPointVector: typeof cv.KeyPointVector,
  };
}
