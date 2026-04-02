import { test, expect, describe, beforeEach, afterEach, mock } from 'bun:test'

// Mock @floating-ui/dom before tooltip import — computePosition requires
// a real layout engine (window, getComputedStyle) which doesn't exist in bun test.
mock.module('@floating-ui/dom', () => ({
  computePosition: () => Promise.resolve({ x: 10, y: 20 }),
  offset: () => {},
  flip: () => {},
  shift: () => {},
}))

import { tooltip } from '../../src/client/lib/tooltip.ts'

// Minimal DOM stubs for testing the attachment factory pattern.
// We verify: event wiring, tooltip element lifecycle, and cleanup behavior.

let bodyChildren: any[] = []
let listeners: Record<string, Function[]> = {}

function makeNode(): HTMLElement {
  return {
    addEventListener: (event: string, handler: Function) => {
      listeners[event] = listeners[event] || []
      listeners[event].push(handler)
    },
    removeEventListener: (event: string, handler: Function) => {
      listeners[event] = (listeners[event] || []).filter(h => h !== handler)
    },
  } as unknown as HTMLElement
}

beforeEach(() => {
  bodyChildren = []
  listeners = {}

  globalThis.document = {
    ...globalThis.document,
    createElement: (tag: string) => {
      const el = {
        tagName: tag.toUpperCase(),
        textContent: '',
        style: { cssText: '', left: '', top: '', display: '' },
        remove: mock(function(this: any) {
          bodyChildren = bodyChildren.filter(c => c !== this)
        }),
      }
      return el
    },
    body: {
      appendChild: (child: any) => { bodyChildren.push(child) },
    },
  } as any
})

afterEach(() => {
  bodyChildren = []
  listeners = {}
})

describe('tooltip attachment factory', () => {
  test('returns a function (attachment)', () => {
    const attachment = tooltip('Hello')
    expect(typeof attachment).toBe('function')
  })

  test('attachment returns a cleanup function', () => {
    const node = makeNode()
    const cleanup = tooltip('Hello')(node)
    expect(typeof cleanup).toBe('function')
  })

  test('registers mouseenter and mouseleave listeners', () => {
    const node = makeNode()
    tooltip('Hello')(node)
    expect(listeners['mouseenter']).toHaveLength(1)
    expect(listeners['mouseleave']).toHaveLength(1)
  })

  test('mouseenter creates a tooltip element on document.body', () => {
    const node = makeNode()
    tooltip('Hello')(node)
    expect(bodyChildren).toHaveLength(0)

    listeners['mouseenter'][0]()
    expect(bodyChildren).toHaveLength(1)
    expect(bodyChildren[0].textContent).toBe('Hello')
  })

  test('mouseleave removes the tooltip element', () => {
    const node = makeNode()
    tooltip('Hello')(node)

    listeners['mouseenter'][0]()
    expect(bodyChildren).toHaveLength(1)

    listeners['mouseleave'][0]()
    expect(bodyChildren).toHaveLength(0)
  })

  test('cleanup removes listeners and any visible tooltip', () => {
    const node = makeNode()
    const cleanup = tooltip('Hello')(node)

    listeners['mouseenter'][0]()
    expect(bodyChildren).toHaveLength(1)

    cleanup!()
    expect(listeners['mouseenter']).toHaveLength(0)
    expect(listeners['mouseleave']).toHaveLength(0)
    expect(bodyChildren).toHaveLength(0)
  })

  test('cleanup works even when no tooltip is visible', () => {
    const node = makeNode()
    const cleanup = tooltip('Hello')(node)
    cleanup!()
    expect(listeners['mouseenter']).toHaveLength(0)
    expect(listeners['mouseleave']).toHaveLength(0)
  })
})
