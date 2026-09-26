import { describe, it, expect, beforeEach, vi } from "vitest"
import type { ReconciledItem } from "@/lib/translate/types"

/** In-memory stand-in for the `translation_cache` table, enforcing the RLS rules that matter
 *  here: a `ready` row is never overwritten. */
type Row = { status: "pending" | "ready"; chunks: unknown; created_at: string; created_by: string }
const table = new Map<string, Row>()
const inserts = vi.fn()
const upserts = vi.fn()

vi.mock("@/lib/supabase", () => {
  const keyOf = (r: Record<string, unknown>) =>
    [r.discover_item_id, r.source_hash, r.target_lang, r.model_version].join("|")
  return {
    supabase: {
      from: () => {
        const filters: Record<string, unknown> = {}
        const q = {
          select: () => q,
          eq: (col: string, v: unknown) => {
            filters[col] = v
            return q
          },
          maybeSingle: async () => ({ data: table.get(keyOf(filters)) ?? null, error: null }),
          insert: async (row: Record<string, unknown>) => {
            inserts(row)
            const k = keyOf(row)
            if (table.has(k)) return { error: { code: "23505" } }
            table.set(k, {
              status: row.status as Row["status"],
              chunks: row.chunks,
              created_at: new Date().toISOString(),
              created_by: row.created_by as string,
            })
            return { error: null }
          },
          upsert: async (row: Record<string, unknown>) => {
            upserts(row)
            const k = keyOf(row)
            const prev = table.get(k)
            if (prev?.status === "ready") return { error: { code: "42501" } }
            table.set(k, {
              status: row.status as Row["status"],
              chunks: row.chunks,
              created_at: prev?.created_at ?? new Date().toISOString(),
              created_by: row.created_by as string,
            })
            return { error: null }
          },
        }
        return q
      },
    },
  }
})

const { loadBatchWithSharedCache } = await import("@/lib/translate/shared-translation-cache")

const items = (w: string): ReconciledItem[] => [{ type: "chunk", chunk: w, meaning: `en:${w}` }]
const flush = () => new Promise((r) => setTimeout(r, 0))

describe("loadBatchWithSharedCache", () => {
  beforeEach(() => {
    table.clear()
    inserts.mockClear()
    upserts.mockClear()
  })

  it("the first signed-in reader translates and stores; the next reader reuses it with no LLM call", async () => {
    const first = vi.fn(async () => items("hola"))
    expect(await loadBatchWithSharedCache({ discoverItemId: "d1", writerUserId: "u1" }, "hola", first)).toEqual(items("hola"))
    await flush()
    expect(first).toHaveBeenCalledTimes(1)

    const second = vi.fn(async () => items("DIFFERENT"))
    expect(await loadBatchWithSharedCache({ discoverItemId: "d1", writerUserId: "u2" }, "hola", second)).toEqual(items("hola"))
    expect(second).not.toHaveBeenCalled()
  })

  it("guests and anonymous sessions read the cache but never write to it", async () => {
    const translate = vi.fn(async () => items("hola"))
    await loadBatchWithSharedCache({ discoverItemId: "d1", writerUserId: null }, "hola", translate)
    await flush()
    expect(translate).toHaveBeenCalledTimes(1)
    expect(inserts).not.toHaveBeenCalled()
    expect(upserts).not.toHaveBeenCalled()
  })

  it("keys by item and exact source text, so different text or a different item misses", async () => {
    await loadBatchWithSharedCache({ discoverItemId: "d1", writerUserId: "u1" }, "hola", async () => items("hola"))
    await flush()
    const t = vi.fn(async () => items("x"))
    await loadBatchWithSharedCache({ discoverItemId: "d1", writerUserId: "u1" }, "hola!", t)
    await loadBatchWithSharedCache({ discoverItemId: "d2", writerUserId: "u1" }, "hola", t)
    expect(t).toHaveBeenCalledTimes(2)
  })

  it("never stores a failed translation", async () => {
    await expect(
      loadBatchWithSharedCache({ discoverItemId: "d1", writerUserId: "u1" }, "hola", async () => {
        throw new Error("misaligned")
      }),
    ).rejects.toThrow("misaligned")
    await flush()
    expect(upserts).not.toHaveBeenCalled()
  })

  it("still translates if the cache itself is unreachable", async () => {
    const { supabase } = await import("@/lib/supabase")
    const spy = vi.spyOn(supabase, "from").mockImplementation(() => {
      throw new Error("network down")
    })
    const translate = vi.fn(async () => items("hola"))
    expect(await loadBatchWithSharedCache({ discoverItemId: "d1", writerUserId: "u1" }, "hola", translate)).toEqual(items("hola"))
    spy.mockRestore()
  })
})
