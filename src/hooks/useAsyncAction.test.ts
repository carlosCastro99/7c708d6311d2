import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAsyncAction } from './useAsyncAction'

describe('useAsyncAction', () => {
  it('clears error and sets pending while running, then resolves cleanly', async () => {
    const fn = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useAsyncAction(fn))

    expect(result.current[1]).toEqual({ pending: false, error: null })

    act(() => {
      result.current[0]()
    })

    await waitFor(() => expect(result.current[1].pending).toBe(false))
    expect(result.current[1].error).toBeNull()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('captures a thrown error and clears pending', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useAsyncAction(fn))

    act(() => {
      result.current[0]()
    })

    await waitFor(() => expect(result.current[1].error).not.toBeNull())
    expect(result.current[1].error?.message).toBe('boom')
    expect(result.current[1].pending).toBe(false)
  })

  it('forwards arguments to the wrapped function', async () => {
    const fn = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useAsyncAction(fn))

    act(() => {
      result.current[0]('a', 2)
    })

    await waitFor(() => expect(fn).toHaveBeenCalledWith('a', 2))
  })
})
