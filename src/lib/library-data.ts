import { contentItems, type ContentItem } from "./content-data"

export interface LibraryItem extends ContentItem {
  progress?: number // percentage for currently reading
  addedAt: string
  lastReadAt?: string
}

// Simulated user library data - currently reading items
export const currentlyReadingItems: LibraryItem[] = [
  {
    ...contentItems[0], // The Little Prince
    progress: 45,
    addedAt: "2024-01-15",
    lastReadAt: "2024-01-20",
  },
  {
    ...contentItems[4], // Kafka on the Shore
    progress: 12,
    addedAt: "2024-01-10",
    lastReadAt: "2024-01-18",
  },
  {
    ...contentItems[3], // Climate Change article
    progress: 78,
    addedAt: "2024-01-19",
    lastReadAt: "2024-01-20",
  },
]

// Simulated user library data - favorite items
export const favoriteItems: LibraryItem[] = [
  {
    ...contentItems[1], // The Road Not Taken
    addedAt: "2024-01-05",
  },
  {
    ...contentItems[2], // Despacito
    addedAt: "2024-01-08",
  },
  {
    ...contentItems[6], // La Vie en Rose
    addedAt: "2024-01-12",
  },
  {
    ...contentItems[10], // Still I Rise
    addedAt: "2024-01-14",
  },
  {
    ...contentItems[5], // Sonnet 18
    addedAt: "2024-01-16",
  },
]
