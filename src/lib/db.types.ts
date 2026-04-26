/**
 * TypeScript types mirroring the Supabase database schema.
 * Keep in sync with supabase/migrations (e.g. 0001_subscription_management.sql, 0012_discover_catalog.sql).
 *
 * Usage with the Supabase client:
 *   import { createClient } from '@supabase/supabase-js'
 *   import type { Database } from '@/lib/db.types'
 *   const supabase = createClient<Database>(url, key)
 *
 *   // Fully typed queries:
 *   const { data } = await supabase
 *     .from('user_subscriptions')
 *     .select('*')
 *     .eq('user_id', userId)
 *     .is('archived_at', null)
 *     .single()
 *   // data is UserSubscriptionRow | null
 */

import type { TierId } from "@/lib/tiers"

// ─── Enum mirrors ─────────────────────────────────────────────────────────────

/** Mirrors the `billing_interval` SQL enum. */
export type DbBillingInterval = "monthly" | "annual"

/** Mirrors the `subscription_status` SQL enum. */
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "paused"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid"

/** Mirrors the `invoice_status` SQL enum. */
export type InvoiceStatus = "draft" | "open" | "paid" | "void" | "uncollectible"

/** Mirrors `discover_content_type` (see supabase/migrations/0012_discover_catalog.sql). */
export type DiscoverContentType = "book" | "article" | "song" | "poem"

/** Mirrors `discover_difficulty`. */
export type DiscoverDifficulty = "beginner" | "intermediate" | "advanced"

// ─── Row types ────────────────────────────────────────────────────────────────

/** Full database row from `public.user_subscriptions`. */
export interface UserSubscriptionRow {
  id: string
  user_id: string
  plan_id: TierId
  billing_interval: DbBillingInterval
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  status: SubscriptionStatus
  current_period_start: string | null   // ISO 8601 timestamptz
  current_period_end: string | null     // ISO 8601 timestamptz — aka next_billing_date
  trial_start: string | null
  trial_end: string | null
  cancel_at_period_end: boolean
  canceled_at: string | null
  cancellation_reason: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

/** Full database row from `public.usage_records`. */
export interface UsageRecordRow {
  id: string
  user_id: string
  subscription_id: string
  period_start: string                  // ISO 8601 timestamptz
  period_end: string                    // ISO 8601 timestamptz
  texts_processed: number
  chunks_returned: number
  pages_processed: number
  chars_processed: number
  api_calls: number
  voice_requests: number
  created_at: string
  updated_at: string
}

/** Full database row from `public.billing_invoices`. */
export interface BillingInvoiceRow {
  id: string
  user_id: string
  subscription_id: string | null
  stripe_invoice_id: string
  stripe_charge_id: string | null
  stripe_payment_intent_id: string | null
  amount_due_cents: number
  amount_paid_cents: number
  amount_remaining_cents: number
  currency: string
  status: InvoiceStatus
  billing_reason: string | null
  collection_method: string | null
  invoice_date: string | null
  due_date: string | null
  paid_at: string | null
  voided_at: string | null
  period_start: string | null
  period_end: string | null
  invoice_pdf_url: string | null
  hosted_invoice_url: string | null
  stripe_payload: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

/** Full database row from `public.discover_items`. */
export interface DiscoverItemRow {
  id: string
  title: string
  author: string
  type: DiscoverContentType
  difficulty: DiscoverDifficulty
  word_count: number
  language: string
  cover_image: string
  tags: string[]
  preview: string
  estimated_time: string
  body_text: string
  created_at: string
  updated_at: string
}

// ─── Insert types (omit server-generated fields) ──────────────────────────────

export type UserSubscriptionInsert = Omit<
  UserSubscriptionRow,
  "id" | "created_at" | "updated_at"
>

export type UsageRecordInsert = Omit<
  UsageRecordRow,
  "id" | "created_at" | "updated_at"
>

export type BillingInvoiceInsert = Omit<
  BillingInvoiceRow,
  "id" | "created_at" | "updated_at"
>

export type DiscoverItemInsert = Omit<
  DiscoverItemRow,
  "id" | "created_at" | "updated_at"
> & { id?: string }

// ─── Update types (all fields optional except id) ────────────────────────────

export type UserSubscriptionUpdate = Partial<UserSubscriptionInsert>
export type UsageRecordUpdate      = Partial<UsageRecordInsert>
export type BillingInvoiceUpdate   = Partial<BillingInvoiceInsert>
export type DiscoverItemUpdate     = Partial<Omit<DiscoverItemInsert, "id">>

// ─── Supabase Database shape (pass to createClient<Database>) ────────────────

export interface Database {
  public: {
    Tables: {
      user_subscriptions: {
        Row:    UserSubscriptionRow
        Insert: UserSubscriptionInsert
        Update: UserSubscriptionUpdate
      }
      usage_records: {
        Row:    UsageRecordRow
        Insert: UsageRecordInsert
        Update: UsageRecordUpdate
      }
      billing_invoices: {
        Row:    BillingInvoiceRow
        Insert: BillingInvoiceInsert
        Update: BillingInvoiceUpdate
      }
      discover_items: {
        Row:    DiscoverItemRow
        Insert: DiscoverItemInsert
        Update: DiscoverItemUpdate
      }
    }
    Views: {
      active_subscriptions: {
        Row: UserSubscriptionRow   // same shape — archived_at is always null here
      }
    }
    Enums: {
      plan_id:                 TierId
      billing_interval:        DbBillingInterval
      subscription_status:     SubscriptionStatus
      invoice_status:          InvoiceStatus
      discover_content_type:   DiscoverContentType
      discover_difficulty:     DiscoverDifficulty
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** True when the subscription grants active access (not past-due, canceled, etc.). */
export function isAccessActive(status: SubscriptionStatus): boolean {
  return status === "active" || status === "trialing"
}

/** True when the row has been soft-deleted (archived). */
export function isArchived(row: Pick<UserSubscriptionRow, "archived_at">): boolean {
  return row.archived_at !== null
}

/** True when the subscription will auto-cancel at the end of the current period. */
export function isCancelingAtPeriodEnd(
  row: Pick<UserSubscriptionRow, "cancel_at_period_end">,
): boolean {
  return row.cancel_at_period_end
}

/** Returns the next billing date as a Date, or null if not set. */
export function nextBillingDate(
  row: Pick<UserSubscriptionRow, "current_period_end">,
): Date | null {
  return row.current_period_end ? new Date(row.current_period_end) : null
}
