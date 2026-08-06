export interface Point {
  x: number
  y: number
}

export interface DetectedCircle {
  x: number
  y: number
  radius: number
}

export interface RollDetectionResult {
  count: number
  circles: DetectedCircle[]
}

export interface RollDetectionEngine {
  detectCircles(imageData: ImageData, minRadius: number, maxRadius: number): DetectedCircle[]
}

// Roll size in the photo varies with zoom/distance, and there's no training
// data to fix this some other way, so the worker calibrates it per-photo by
// tapping across one roll's diameter. The tolerance below is how far actual
// rolls are allowed to drift from that one sample (uneven framing, slightly
// different roll sizes in the same stack, etc).
const CALIBRATION_TOLERANCE = 0.35

export function estimateRadius(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y) / 2
}

export function detectRolls(
  imageData: ImageData,
  calibrationRadius: number,
  engine: RollDetectionEngine,
): RollDetectionResult {
  const minRadius = Math.max(1, Math.round(calibrationRadius * (1 - CALIBRATION_TOLERANCE)))
  const maxRadius = Math.round(calibrationRadius * (1 + CALIBRATION_TOLERANCE))
  const circles = engine.detectCircles(imageData, minRadius, maxRadius)
  return { count: circles.length, circles }
}
