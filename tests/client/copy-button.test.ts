// @vitest-environment happy-dom
import { test, expect, describe, vi, beforeEach, afterEach } from 'vitest'
import { flushSync, mount } from 'svelte'
import CopyButton from '$lib/components/CopyButton.svelte'

describe('CopyButton', () => {
  let target: HTMLElement

  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    document.body.removeChild(target)
  })

  test('renders a button with Copy icon', () => {
    mount(CopyButton, { target, props: { text: 'hello' } })
    const button = target.querySelector('button')
    expect(button).toBeTruthy()
    expect(button!.querySelector('[data-lucide="copy"]')).toBeTruthy()
  })

  test('copies text to clipboard on click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    mount(CopyButton, { target, props: { text: 'Alpha Draught' } })
    target.querySelector('button')!.click()

    expect(writeText).toHaveBeenCalledWith('Alpha Draught')
  })

  test('swaps to Check icon after click, reverts after timeout', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    mount(CopyButton, { target, props: { text: 'hello' } })
    target.querySelector('button')!.click()
    await vi.advanceTimersByTimeAsync(0) // let the promise resolve
    flushSync()

    expect(target.querySelector('[data-lucide="check"]')).toBeTruthy()
    expect(target.querySelector('[data-lucide="copy"]')).toBeNull()

    await vi.advanceTimersByTimeAsync(1500)
    flushSync()

    expect(target.querySelector('[data-lucide="copy"]')).toBeTruthy()
    expect(target.querySelector('[data-lucide="check"]')).toBeNull()

    vi.useRealTimers()
  })

  test('does not swap icon when clipboard write fails', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    mount(CopyButton, { target, props: { text: 'hello' } })
    target.querySelector('button')!.click()
    await vi.advanceTimersByTimeAsync(0)
    flushSync()

    expect(target.querySelector('[data-lucide="copy"]')).toBeTruthy()
    expect(target.querySelector('[data-lucide="check"]')).toBeNull()

    vi.useRealTimers()
  })
})
