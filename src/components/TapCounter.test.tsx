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
})
