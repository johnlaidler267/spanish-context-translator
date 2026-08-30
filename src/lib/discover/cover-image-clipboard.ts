/** Read a local image file or pasted image blob as a data URL for discover cover fields. */
export async function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ""))
    reader.onerror = () => reject(new Error("Failed to read image file"))
    reader.readAsDataURL(blob)
  })
}

function mimeExtension(mime: string): string {
  const m = mime.toLowerCase()
  if (m === "image/jpeg" || m === "image/jpg") return "jpg"
  if (m === "image/png") return "png"
  if (m === "image/gif") return "gif"
  if (m === "image/webp") return "webp"
  if (m === "image/svg+xml") return "svg"
  return "png"
}

/** First image file on the clipboard, if any (screenshots, copied images). */
export function readImageFileFromClipboard(data: DataTransfer | null): File | null {
  if (!data) return null
  const { files } = data
  if (files?.length) {
    for (let i = 0; i < files.length; i++) {
      const f = files.item(i)
      if (f?.type.startsWith("image/")) return f
    }
  }
  const { items } = data
  if (!items?.length) return null
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const f = item.getAsFile()
      if (f) return f
    }
  }
  return null
}

export function pastedImageDisplayName(file: File): string {
  if (file.name?.trim() && file.name !== "image.png") return file.name
  return `pasted-image.${mimeExtension(file.type)}`
}
