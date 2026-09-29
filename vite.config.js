import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'
import { createHash } from 'crypto'
import { readFileSync } from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Fingerprint of every source file that decides how a book is split into pages. Saved page
 * layouts (src/lib/storage/book-layout-cache.ts) are keyed on it, so any change to the
 * pagination logic invalidates them on the next deploy by itself -- nobody has to remember to
 * bump a version number, and a stale layout can never outlive the code that produced it.
 * Add a file here if pagination starts depending on it.
 */
const PAGINATION_SOURCE_FILES = [
  'src/lib/translate/page-split.ts',
  'src/lib/translate/roman-chapters.ts',
  'src/lib/translate/text-ws.ts',
  'src/lib/translate/llm-settings.ts',
  'src/lib/reading/reading-page-measure.ts',
  'src/lib/reading/reading-layout.ts',
  'src/lib/reading/drop-cap.ts',
  'src/lib/storage/book-layout-cache.ts',
]
const paginationSourceHash = (() => {
  const h = createHash('sha256')
  for (const f of PAGINATION_SOURCE_FILES) h.update(readFileSync(path.resolve(__dirname, f)))
  return h.digest('hex').slice(0, 16)
})()

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __PAGINATION_SOURCE_HASH__: JSON.stringify(paginationSourceHash),
  },
  server: {
    proxy: {
      /** Dev-only: machine-translate popup (Google `gtx` JSON, not the product LLM). */
      '/__gtx': {
        target: 'https://translate.googleapis.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__gtx/, ''),
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // supabase-js always bundles its Realtime and Storage clients, which this app never
      // uses -- ~84KB minified of the main bundle every page parses before it can paint.
      // Swap in tiny stand-ins; see the files themselves before starting to use either.
      '@supabase/realtime-js': path.resolve(__dirname, './src/lib/supabase-stubs/realtime-js.ts'),
      '@supabase/storage-js': path.resolve(__dirname, './src/lib/supabase-stubs/storage-js.ts'),
    },
    dedupe: ['react', 'react-dom'],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'supabase/functions/_shared/**/*.test.ts'],
    env: {
      // Several lib modules import supabase.ts transitively, which throws
      // at module load without these — dummy values, no real network
      // access happens in unit tests.
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
  },
})
