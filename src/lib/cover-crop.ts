/** Layout for `object-fit: cover` — image scaled uniformly to fill a box. */
export function computeCoverLayout(
  iw: number,
  ih: number,
  cw: number,
  ch: number,
): { scale: number; rw: number; rh: number; L: number; T: number } {
  const scale = Math.max(cw / iw, ch / ih)
  const rw = iw * scale
  const rh = ih * scale
  const L = (cw - rw) / 2
  const T = (ch - rh) / 2
  return { scale, rw, rh, L, T }
}

/** Pan offset (px) so the scaled image always covers the box. */
export function clampCoverPan(
  ox: number,
  oy: number,
  cw: number,
  ch: number,
  L: number,
  T: number,
  rw: number,
  rh: number,
): { x: number; y: number } {
  const minX = cw - rw - L
  const maxX = -L
  const minY = ch - rh - T
  const maxY = -T
  return {
    x: Math.max(minX, Math.min(maxX, ox)),
    y: Math.max(minY, Math.min(maxY, oy)),
  }
}

/**
 * Renders the visible cover region into a JPEG data URL (for Discover `cover_image`).
 * `ox`, `oy` are pan offsets matching `CoverImageCropPanel`.
 */
export function renderCoverCropToJpeg(
  img: HTMLImageElement,
  cw: number,
  ch: number,
  ox: number,
  oy: number,
  maxOutEdge = 1600,
  quality = 0.9,
): string | null {
  const iw = img.naturalWidth
  const ih = img.naturalHeight
  if (!iw || !ih || !cw || !ch) return null

  const { scale, rw, rh, L, T } = computeCoverLayout(iw, ih, cw, ch)
  const o = clampCoverPan(ox, oy, cw, ch, L, T, rw, rh)

  let srcX = (-(L + o.x)) / scale
  let srcY = (-(T + o.y)) / scale
  const srcW = cw / scale
  const srcH = ch / scale

  srcX = Math.max(0, Math.min(iw - srcW, srcX))
  srcY = Math.max(0, Math.min(ih - srcH, srcY))
  const sw = Math.min(srcW, iw - srcX)
  const sh = Math.min(srcH, ih - srcY)

  const outAspect = cw / ch
  let outW = maxOutEdge
  let outH = Math.round(maxOutEdge / outAspect)
  if (outH > maxOutEdge) {
    outH = maxOutEdge
    outW = Math.round(maxOutEdge * outAspect)
  }

  const canvas = document.createElement("canvas")
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  ctx.drawImage(img, srcX, srcY, sw, sh, 0, 0, outW, outH)
  try {
    return canvas.toDataURL("image/jpeg", quality)
  } catch {
    return null
  }
}
