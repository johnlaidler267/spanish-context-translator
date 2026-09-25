// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest"
import { createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { TextChunk } from "@/components/reading/text-chunk"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ""
})

function renderChunk(delegatePointerHover: boolean) {
  const onRequestDetails = vi.fn()
  const host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => {
    root!.render(
      createElement(TextChunk, {
        chunk: { id: 1, text: "hola", meaning: "hello" },
        popupChunkId: null,
        isTouchHighlight: false,
        isPinned: false,
        onActivate: () => {},
        onDeactivate: () => {},
        onRequestDetails,
        variant: "read",
        delegatePointerHover,
      }),
    )
  })
  const el = host.querySelector("[data-chunk-id]") as HTMLElement
  return { el, onRequestDetails }
}

describe("TextChunk click vs touch", () => {
  it("opens details on a plain mouse click", () => {
    const { el, onRequestDetails } = renderChunk(true)
    act(() => el.click())
    expect(onRequestDetails).toHaveBeenCalledTimes(1)
  })

  // iOS home-screen apps: a long press ends in touchcancel and then a synthetic click.
  it.each([true, false])("ignores the click that follows a long press (delegate=%s)", (delegate) => {
    const { el, onRequestDetails } = renderChunk(delegate)
    act(() => {
      el.dispatchEvent(new Event("touchstart", { bubbles: true }))
      el.dispatchEvent(new Event("touchcancel", { bubbles: true }))
      el.click()
    })
    expect(onRequestDetails).not.toHaveBeenCalled()
  })
})
