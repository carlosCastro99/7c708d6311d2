import type { RollDetectionEngine, DetectedCircle } from './rollDetection'

// Narrow slice of the OpenCV.js API this engine actually touches, so this
// file stays honest about its real dependency surface instead of trusting
// opencv-js's full (huge, partly-inaccurate) type declarations.
interface CvMat {
  cols: number
  data32F: Float32Array
  delete(): void
}
interface CvSize {
  new (width: number, height: number): unknown
}
interface Cv {
  Mat: { new (): CvMat }
  Size: CvSize
  matFromImageData(imageData: ImageData): CvMat
  cvtColor(src: CvMat, dst: CvMat, code: number): void
  GaussianBlur(src: CvMat, dst: CvMat, size: unknown, sigmaX: number, sigmaY: number): void
  HoughCircles(
    src: CvMat, circles: CvMat, method: number, dp: number, minDist: number,
    param1: number, param2: number, minRadius: number, maxRadius: number,
  ): void
  COLOR_RGBA2GRAY: number
  HOUGH_GRADIENT: number
}

let cvPromise: Promise<Cv> | null = null

async function loadCv(): Promise<Cv> {
  if (!cvPromise) {
    cvPromise = import('@techstark/opencv-js').then((mod) => {
      const cvModule = (mod as { default?: unknown }).default ?? mod
      if (cvModule instanceof Promise) return cvModule as Promise<Cv>
      const cv = cvModule as Cv & { onRuntimeInitialized?: () => void; Mat?: unknown }
      if (cv.Mat) return cv
      return new Promise<Cv>((resolve) => {
        cv.onRuntimeInitialized = () => resolve(cv)
      })
    })
  }
  return cvPromise
}

export class OpenCvRollDetectionEngine implements RollDetectionEngine {
  private cv: Cv | null = null

  async init(): Promise<void> {
    this.cv = await loadCv()
  }

  detectCircles(imageData: ImageData, minRadius: number, maxRadius: number): DetectedCircle[] {
    const cv = this.cv
    if (!cv) throw new Error('OpenCV engine used before init()')

    const src = cv.matFromImageData(imageData)
    const gray = new cv.Mat()
    const circles = new cv.Mat()
    try {
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
      cv.GaussianBlur(gray, gray, new cv.Size(9, 9), 2, 2)
      cv.HoughCircles(
        gray, circles, cv.HOUGH_GRADIENT, 1, Math.max(1, minRadius * 1.5),
        100, 30, minRadius, maxRadius,
      )
      const result: DetectedCircle[] = []
      for (let i = 0; i < circles.cols; i++) {
        result.push({
          x: circles.data32F[i * 3],
          y: circles.data32F[i * 3 + 1],
          radius: circles.data32F[i * 3 + 2],
        })
      }
      return result
    } finally {
      src.delete()
      gray.delete()
      circles.delete()
    }
  }
}

export async function createOpenCvEngine(): Promise<RollDetectionEngine> {
  const engine = new OpenCvRollDetectionEngine()
  await engine.init()
  return engine
}
