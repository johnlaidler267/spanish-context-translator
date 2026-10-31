// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest"
import { createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { FirstReadTip, FIRST_READ_TIP_STORAGE_KEY } from "@/components/reading/first-read-tip"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let touch = false

beforeEach(() => {
  window.localStorage.clear()
  touch = false
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(hover: none)" ? touch : false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ""
  vi.unstubAllGlobals()
})

function render(props: { suppressed?: boolean } = {}) {
  const host = document.createElement("div")
  host.innerHTML = '<span data-chunk data-chunk-id="1">hola</span><p id="other">x</p>'
  document.body.appendChild(host)
  root = createRoot(host.appendChild(document.createElement("div")))
  act(() => root!.render(createElement(FirstReadTip, props)))
}

const tip = () => document.querySelector('[data-testid="first-read-tip"]')
const pointerDownOn = (el: Element) =>
  act(() => {
    el.dispatchEvent(new Event("pointerdown", { bubbles: true }))
  })

describe("FirstReadTip", () => {
  it("shows mouse copy for a first-time reader", () => {
    render()
    expect(tip()?.textContent).toMatch(/Hover any phrase/)
  })

  it("shows press-and-hold copy on touch screens", () => {
    touch = true
    render()
    expect(tip()?.textContent).toMatch(/Press and hold any phrase/)
  })

  it("goes away for good after the first press on a phrase", () => {
    render()
    pointerDownOn(document.getElementById("other")!)
    expect(tip()).not.toBeNull()
    pointerDownOn(document.querySelector("[data-chunk-id]")!)
    expect(tip()).toBeNull()
    expect(window.localStorage.getItem(FIRST_READ_TIP_STORAGE_KEY)).toBe("1")
  })

  it("goes away for good when closed", () => {
    render()
    act(() => (document.querySelector('[aria-label="Dismiss tip"]') as HTMLElement).click())
    expect(tip()).toBeNull()
    expect(window.localStorage.getItem(FIRST_READ_TIP_STORAGE_KEY)).toBe("1")
  })

  it("stays hidden once seen", () => {
    window.localStorage.setItem(FIRST_READ_TIP_STORAGE_KEY, "1")
    render()
    expect(tip()).toBeNull()
  })

  it("waits while suppressed", () => {
    render({ suppressed: true })
    expect(tip()).toBeNull()
  })
})
