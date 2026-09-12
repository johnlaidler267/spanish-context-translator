import { createContext, useContext } from "react"

interface ViewportContextType {
  isMobile: boolean
}

export const ViewportContext = createContext<ViewportContextType | null>(null)

export function useViewport(): ViewportContextType {
  const context = useContext(ViewportContext)
  if (!context) {
    throw new Error("useViewport must be used within ViewportProvider")
  }
  return context
}
