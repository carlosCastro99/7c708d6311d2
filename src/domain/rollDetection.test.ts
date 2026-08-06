import { describe, it, expect } from 'vitest'
import { detectRolls, estimateRadius, type RollDetectionEngine, type DetectedCircle } from './rollDetection'

function fakeImageData(): ImageData {
  return { width: 10, height: 10, data: new Uint8ClampedArray(400), colorSpace: 'srgb' } as ImageData
}

function engineReturning(circles: DetectedCircle[]): RollDetectionEngine {
  return {
    detectCircles: () => circles,
  }
}

describe('estimateRadius', () => {
  it('returns half the distance between two calibration points', () => {
    expect(estimateRadius({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5)
    expect(estimateRadius({ x: 0, y: 0 }, { x: 0, y: 8 })).toBe(4)
  })
})

describe('detectRolls', () => {
  it('counts the circles the engine finds and returns them unchanged', () => {
    const circles: DetectedCircle[] = [
      { x: 1, y: 1, radius: 5 },
      { x: 20, y: 1, radius: 5 },
      { x: 40, y: 1, radius: 5 },
    ]
    const result = detectRolls(fakeImageData(), 5, engineReturning(circles))
    expect(result.count).toBe(3)
    expect(result.circles).toEqual(circles)
  })

  it('passes a min/max radius range around the calibrated radius to the engine', () => {
    let seenMin = -1
    let seenMax = -1
    const engine: RollDetectionEngine = {
      detectCircles: (_imageData, minRadius, maxRadius) => {
        seenMin = minRadius
        seenMax = maxRadius
        return []
      },
    }
    detectRolls(fakeImageData(), 20, engine)
    expect(seenMin).toBeLessThan(20)
    expect(seenMax).toBeGreaterThan(20)
  })

  it('returns zero count when the engine finds nothing', () => {
    const result = detectRolls(fakeImageData(), 10, engineReturning([]))
    expect(result.count).toBe(0)
    expect(result.circles).toEqual([])
  })
})
