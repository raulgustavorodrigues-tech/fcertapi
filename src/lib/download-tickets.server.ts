// Short-lived, single-use tickets for agent package downloads.
// Replaces passing database_id + long-lived agent_token in the URL.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type TicketKind = "agent-bundle" | "agent-installer" | "agent-probe";

const TTL_MS = 5 * 60 * 1000;

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function issueTicket(
  databaseId: string,
  kind: TicketKind,
  createdBy: string | null,
) {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const raw = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const token_hash = await sha256Hex(raw);
  const { error } = await supabaseAdmin.from("download_tickets" as any).insert({
    token_hash,
    database_id: databaseId,
    kind,
    created_by: createdBy,
    expires_at: new Date(Date.now() + TTL_MS).toISOString(),
  } as any);
  if (error) throw new Error(error.message);
  return raw;
}

/**
 * Validates and consumes a ticket. Returns the database id it was issued for,
 * or null when the ticket is unknown, expired, already used, or of another kind.
 */
export async function consumeTicket(
  raw: string | null,
  kind: TicketKind,
): Promise<string | null> {
  if (!raw) return null;
  const token_hash = await sha256Hex(raw);
  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("download_tickets" as any)
    .update({ used_at: nowIso } as any)
    .eq("token_hash", token_hash)
    .eq("kind", kind)
    .is("used_at", null)
    .gt("expires_at", nowIso)
    .select("database_id")
    .maybeSingle();
  if (error || !data) return null;
  return (data as any).database_id as string;
}
