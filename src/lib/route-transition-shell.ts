/**
 * Mobile shell uses overflow:hidden on html/body/#root/.app-viewport to reduce
 * rubber-banding. That clips View Transitions + transform animations.
 * Call beginRouteTransition() before navigate / on landing mount; timer clears the unlock.
 */

const CLASS = "app-route-transition"

let unlockTimer: ReturnType<typeof setTimeout> | null = null

export function beginRouteTransition(durationMs = 520) {
  if (typeof document === "undefined") return
  document.documentElement.classList.add(CLASS)
  if (unlockTimer) clearTimeout(unlockTimer)
  unlockTimer = setTimeout(() => {
    document.documentElement.classList.remove(CLASS)
    unlockTimer = null
  }, durationMs)
}

export function cancelRouteTransition() {
  if (typeof document === "undefined") return
  if (unlockTimer) clearTimeout(unlockTimer)
  unlockTimer = null
  document.documentElement.classList.remove(CLASS)
}
