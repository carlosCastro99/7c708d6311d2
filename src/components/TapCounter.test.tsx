import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TapCounter from './TapCounter'

describe('TapCounter', () => {
  it('increments and decrements via buttons', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TapCounter value={5} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: '+1' }))
    expect(onChange).toHaveBeenCalledWith(6)

    await user.click(screen.getByRole('button', { name: '-1' }))
    expect(onChange).toHaveBeenCalledWith(4)
  })

  it('allows manual quantity entry', () => {
    const onChange = vi.fn()
    render(<TapCounter value={5} onChange={onChange} />)

    const input = screen.getByLabelText(/quantity/i)
    fireEvent.change(input, { target: { value: '120' } })
    fireEvent.blur(input)

    expect(onChange).toHaveBeenCalledWith(120)
  })

  it('asks for confirmation before accepting an absurdly large manual entry', () => {
    const onChange = vi.fn()
    render(<TapCounter value={5} onChange={onChange} />)

    const input = screen.getByLabelText(/quantity/i)
    fireEvent.change(input, { target: { value: '150000' } })
    fireEvent.blur(input)

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/150000/)

    fireEvent.click(screen.getByRole('button', { name: /confirm 150000/i }))
    expect(onChange).toHaveBeenCalledWith(150000)
  })

  it('asks for confirmation before accepting a negative manual entry, and drops it on cancel', () => {
    const onChange = vi.fn()
    render(<TapCounter value={5} onChange={onChange} />)

    const input = screen.getByLabelText(/quantity/i)
    fireEvent.change(input, { target: { value: '-3' } })
    fireEvent.blur(input)

    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
