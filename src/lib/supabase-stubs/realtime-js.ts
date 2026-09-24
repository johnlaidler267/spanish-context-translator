/**
 * Build-time stand-in for `@supabase/realtime-js` (aliased in vite.config.js).
 *
 * `createClient` always constructs a RealtimeClient, and supabase-js always bundles realtime-js
 * (plus its Phoenix socket dependency) to do it -- ~57KB minified in the main bundle, parsed
 * before anything paints -- even though this app never opens a Realtime channel. supabase-js
 * only ever calls `setAuth` on it unprompted (on every auth state change), so that's a no-op
 * here; everything that would actually use Realtime throws, so adopting it later fails loudly
 * instead of silently doing nothing. To start using Realtime, delete this file and its alias.
 */

function unsupported(): never {
  throw new Error(
    "Supabase Realtime is stubbed out of this build (see src/lib/supabase-stubs/realtime-js.ts).",
  )
}

export class RealtimeClient {
  constructor(_endpoint: string, _options?: unknown) {}
  setAuth(): Promise<void> {
    return Promise.resolve()
  }
  channel(): never {
    return unsupported()
  }
  getChannels(): [] {
    return []
  }
  removeChannel(): never {
    return unsupported()
  }
  removeAllChannels(): Promise<[]> {
    return Promise.resolve([])
  }
}
