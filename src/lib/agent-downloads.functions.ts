// Server functions used by the Hub UI to obtain short-lived download tickets
// and to store Firebird passwords encrypted at rest.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const kinds = ["agent-bundle", "agent-installer", "agent-probe"] as const;

/** Ensures the caller can actually see this database through RLS. */
async function assertAccess(context: any, databaseId: string) {
  const { data, error } = await context.supabase
    .from("databases")
    .select("id")
    .eq("id", databaseId)
    .maybeSingle();
  if (error) throw new Response("DB error", { status: 500 });
  if (!data) throw new Response("Forbidden", { status: 403 });
}

export const createDownloadTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ database_id: z.string().uuid(), kind: z.enum(kinds) })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context, data.database_id);
    const { issueTicket } = await import("./download-tickets.server");
    const ticket = await issueTicket(data.database_id, data.kind, context.userId ?? null);
    return { ticket };
  });

export const setDatabasePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        database_id: z.string().uuid(),
        password: z.string().min(1).max(256),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context, data.database_id);
    const { encryptSecret } = await import("./db-crypto.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cipher = await encryptSecret(data.password);
    const { error } = await supabaseAdmin
      .from("databases")
      .update({ password_cipher: cipher, password_encrypted: null } as any)
      .eq("id", data.database_id);
    if (error) throw new Response(error.message, { status: 500 });
    return { ok: true };
  });
