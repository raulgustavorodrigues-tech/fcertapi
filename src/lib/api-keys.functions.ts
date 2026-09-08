// Server functions para gerenciar chaves de API por empresa (integração Logitech).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function authorizeCompany(userId: string, companyId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: isAdmin } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (isAdmin) return supabaseAdmin;

  const { data: link } = await supabaseAdmin
    .from("user_companies")
    .select("company_id")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!link) throw new Response("Forbidden", { status: 403 });
  return supabaseAdmin;
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const listCompanyApiKeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ companyId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const admin = await authorizeCompany(context.userId, data.companyId);
    const { data: keys, error } = await admin
      .from("api_keys")
      .select("id, name, key_prefix, scopes, created_at, last_used_at, revoked_at")
      .eq("company_id", data.companyId)
      .order("created_at", { ascending: false });
    if (error) throw new Response(error.message, { status: 500 });
    return keys ?? [];
  });

export const createCompanyApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        companyId: z.string().uuid(),
        name: z.string().trim().min(2).max(80),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const admin = await authorizeCompany(context.userId, data.companyId);

    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const rand = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const plain = `fc_live_${rand}`;
    const keyHash = await sha256Hex(plain);
    const keyPrefix = plain.slice(0, 16);

    const { data: row, error } = await admin
      .from("api_keys")
      .insert({
        name: data.name,
        company_id: data.companyId,
        key_prefix: keyPrefix,
        key_hash: keyHash,
        scopes: ["entregas:read"],
      })
      .select("id, name, key_prefix, scopes, created_at, last_used_at, revoked_at")
      .single();
    if (error) throw new Response(error.message, { status: 500 });

    return { key: row, plaintext: plain };
  });

export const revokeCompanyApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ companyId: z.string().uuid(), keyId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const admin = await authorizeCompany(context.userId, data.companyId);
    const { error } = await admin
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString(), revoked_reason: "revogada no painel" })
      .eq("id", data.keyId)
      .eq("company_id", data.companyId);
    if (error) throw new Response(error.message, { status: 500 });
    return { ok: true };
  });
