import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PhotoCapture from './PhotoCapture'

describe('PhotoCapture', () => {
  it('calls onCapture with the selected file as a Blob', () => {
    const onCapture = vi.fn()
    render(<PhotoCapture onCapture={onCapture} />)

    const input = screen.getByLabelText(/add photo/i) as HTMLInputElement
    const file = new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' })
    fireEvent.change(input, { target: { files: [file] } })

    expect(onCapture).toHaveBeenCalledWith(file)
  })
})
