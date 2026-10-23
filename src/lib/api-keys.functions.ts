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
        scopes: z.array(z.string().max(60)).min(1).max(20).optional(),
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
        scopes: data.scopes ?? ["entregas:read"],
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

// ---------- Catálogo de APIs ----------

async function requireAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Response("Forbidden", { status: 403 });
  return supabaseAdmin;
}

export const getMyIsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    return { isAdmin: !!data };
  });

export const listCompanyApis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ companyId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const admin = await authorizeCompany(context.userId, data.companyId);
    const [{ data: apis }, { data: links }] = await Promise.all([
      admin.from("api_catalog").select("*").order("created_at"),
      admin.from("company_apis").select("api_id, enabled").eq("company_id", data.companyId),
    ]);
    return (apis ?? []).map((a: any) => ({
      ...a,
      enabled: !!(links ?? []).find((l: any) => l.api_id === a.id && l.enabled),
    }));
  });

export const setCompanyApi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ companyId: z.string().uuid(), apiId: z.string().uuid(), enabled: z.boolean() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId);
    const { error } = await admin.from("company_apis").upsert(
      {
        company_id: data.companyId, api_id: data.apiId, enabled: data.enabled,
        enabled_at: new Date().toISOString(), enabled_by: context.userId,
      },
      { onConflict: "company_id,api_id" },
    );
    if (error) throw new Response(error.message, { status: 500 });
    return { ok: true };
  });

export const listApiCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requireAdmin(context.userId);
    const [{ data: apis }, { data: links }, { data: companies }] = await Promise.all([
      admin.from("api_catalog").select("*").order("created_at"),
      admin.from("company_apis").select("api_id, company_id, enabled").eq("enabled", true),
      admin.from("companies").select("id, name"),
    ]);
    return (apis ?? []).map((a: any) => ({
      ...a,
      companies: (links ?? [])
        .filter((l: any) => l.api_id === a.id)
        .map((l: any) => (companies ?? []).find((c: any) => c.id === l.company_id)?.name ?? "—"),
    }));
  });

const catalogSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().trim().regex(/^[a-z0-9-]{2,40}$/),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional().default(""),
  path: z.string().trim().regex(/^\/api\/v1\/[a-z0-9\-/]+$/),
  scope: z.string().trim().regex(/^[a-z0-9_-]+:[a-z]+$/),
  status: z.enum(["active", "testing", "disabled"]),
});

export const saveApiCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => catalogSchema.parse(d))
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId);
    const { id, ...row } = data;
    const q = id
      ? admin.from("api_catalog").update(row).eq("id", id)
      : admin.from("api_catalog").insert(row);
    const { error } = await q;
    if (error) throw new Response(error.message, { status: 500 });
    return { ok: true };
  });
