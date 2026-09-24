/**
 * Build-time stand-in for `@supabase/storage-js` (aliased in vite.config.js).
 *
 * `createClient` always constructs a StorageClient, which pulls ~27KB minified of storage-js
 * (and iceberg-js) into the main bundle even though this app never uses Supabase Storage.
 * Constructing it is harmless; actually using it throws, so adopting Storage later fails
 * loudly instead of silently doing nothing. To start using Storage, delete this file and its
 * alias.
 */

export class StorageApiError extends Error {}

export class StorageClient {
  constructor(_url: string, _headers?: unknown, _fetch?: unknown, _options?: unknown) {}
  from(): never {
    throw new Error(
      "Supabase Storage is stubbed out of this build (see src/lib/supabase-stubs/storage-js.ts).",
    )
  }
}
