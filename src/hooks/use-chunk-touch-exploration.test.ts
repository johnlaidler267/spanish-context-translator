// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest"
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { useChunkTouchExploration } from "@/hooks/use-chunk-touch-exploration"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

beforeAll(() => {
  // jsdom has no layout; hit-testing falls through to elementsFromPoint.
  document.elementsFromPoint = () => {
    const el = document.querySelector("[data-chunk-id]")
    return el ? [el] : []
  }
})

let root: Root | null = null
afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ""
})

function touchEvent(type: string) {
  const e = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(e, "touches", { value: type === "touchstart" ? [{ clientX: 5, clientY: 5 }] : [] })
  return e
}

function renderSurface() {
  const setActive = vi.fn()
  function Surface() {
    const { ref } = useChunkTouchExploration(setActive, 0)
    return createElement("div", { ref }, createElement("span", { "data-chunk-id": "7" }, "hola"))
  }
  const host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(createElement(Surface)))
  const chunk = host.querySelector("[data-chunk-id]") as HTMLElement
  return { chunk, setActive }
}

describe("useChunkTouchExploration", () => {
  it("clears the explored word on a normal lift", () => {
    const { chunk, setActive } = renderSurface()
    act(() => chunk.dispatchEvent(touchEvent("touchstart")))
    expect(setActive).toHaveBeenLastCalledWith(7)
    act(() => chunk.dispatchEvent(touchEvent("touchend")))
    expect(setActive).toHaveBeenLastCalledWith(null)
  })

  // iOS home-screen app: a long press never delivers touchend/touchcancel to the surface.
  it.each(["click", "pointerup", "pointercancel", "contextmenu", "blur"])(
    "clears a stuck explored word when the lift is only signalled by %s",
    (type) => {
      const { chunk, setActive } = renderSurface()
      act(() => chunk.dispatchEvent(touchEvent("touchstart")))
      expect(setActive).toHaveBeenLastCalledWith(7)
      act(() => {
        window.dispatchEvent(new Event(type))
      })
      expect(setActive).toHaveBeenLastCalledWith(null)
    },
  )
})
