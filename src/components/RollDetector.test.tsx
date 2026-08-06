import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { RollDetectionEngine } from '../domain/rollDetection'
import RollDetector from './RollDetector'

function fakeEngineFactory(circles: Array<{ x: number; y: number; radius: number }>) {
  return async (): Promise<RollDetectionEngine> => ({
    detectCircles: () => circles,
  })
}

function selectPhoto(file = new File(['x'], 'position.jpg', { type: 'image/jpeg' })) {
  const input = screen.getByLabelText(/take a photo of the position/i) as HTMLInputElement
  fireEvent.change(input, { target: { files: [file] } })
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ width: 1, height: 1, data: new Uint8ClampedArray(4) })),
    beginPath: vi.fn(),
    arc: vi.fn(),
    stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('RollDetector', () => {
  it('starts by asking for a photo of the position', () => {
    render(<RollDetector onAccept={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByLabelText(/take a photo of the position/i)).toBeInTheDocument()
  })

  it('walks from photo capture through calibration taps to a detected count, and accepts it', async () => {
    const onAccept = vi.fn()
    render(
      <RollDetector
        onAccept={onAccept}
        onCancel={vi.fn()}
        engineFactory={fakeEngineFactory([
          { x: 1, y: 1, radius: 5 },
          { x: 2, y: 2, radius: 5 },
        ])}
      />,
    )

    selectPhoto()
    const image = document.querySelector('img')!
    Object.defineProperty(image, 'naturalWidth', { value: 100, configurable: true })
    Object.defineProperty(image, 'naturalHeight', { value: 100, configurable: true })
    fireEvent.load(image)

    expect(await screen.findByText(/tap the two edges/i)).toBeInTheDocument()
    const canvas = document.querySelector('canvas')!
    fireEvent.click(canvas, { clientX: 10, clientY: 10 })
    fireEvent.click(canvas, { clientX: 20, clientY: 10 })

    expect(await screen.findByText(/detected: 2 rolls/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /use 2/i }))

    expect(onAccept).toHaveBeenCalledWith(2)
  })

  it('falls back to a manual-entry message when the engine fails', async () => {
    render(
      <RollDetector
        onAccept={vi.fn()}
        onCancel={vi.fn()}
        engineFactory={async () => {
          throw new Error('WASM unavailable')
        }}
      />,
    )

    selectPhoto()
    const image = document.querySelector('img')!
    Object.defineProperty(image, 'naturalWidth', { value: 100, configurable: true })
    Object.defineProperty(image, 'naturalHeight', { value: 100, configurable: true })
    fireEvent.load(image)

    const canvas = document.querySelector('canvas')!
    fireEvent.click(canvas, { clientX: 10, clientY: 10 })
    fireEvent.click(canvas, { clientX: 20, clientY: 10 })

    expect(await screen.findByRole('alert')).toHaveTextContent(/enter the count manually/i)
    expect(screen.getByRole('button', { name: /retry calibration/i })).toBeInTheDocument()
  })

  it('calls onCancel when cancelled', () => {
    const onCancel = vi.fn()
    render(<RollDetector onAccept={vi.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
  })
})
