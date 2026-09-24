import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
    include: ['src/**/*.test.ts'],
    env: {
      // Several lib modules import supabase.ts transitively, which throws
      // at module load without these — dummy values, no real network
      // access happens in unit tests.
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
  },
})
