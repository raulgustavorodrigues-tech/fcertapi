// Server functions para gerenciar acessos (multi-tenant).
// Todas exigem papel `admin` do chamador.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function ensureAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Response("DB error", { status: 500 });
  if (!data) throw new Response("Forbidden", { status: 403 });
  return supabaseAdmin;
}

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await ensureAdmin(context.userId);
    const { data: authList, error } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (error) throw new Response(error.message, { status: 500 });

    const ids = authList.users.map((u) => u.id);
    const [{ data: roles }, { data: links }] = await Promise.all([
      admin.from("user_roles").select("user_id, role").in("user_id", ids),
      admin
        .from("user_companies")
        .select("user_id, company_id, companies(name)")
        .in("user_id", ids),
    ]);

    return authList.users.map((u) => ({
      id: u.id,
      email: u.email ?? "",
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      roles: (roles ?? []).filter((r) => r.user_id === u.id).map((r) => r.role as string),
      companies: (links ?? [])
        .filter((l) => l.user_id === u.id)
        .map((l: any) => ({
          company_id: l.company_id,
          name: l.companies?.name ?? "(sem nome)",
        })),
    }));
  });

const roleSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(["admin", "user"]),
});

export const grantRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => roleSchema.parse(d))
  .handler(async ({ context, data }) => {
    const admin = await ensureAdmin(context.userId);
    const { error } = await admin
      .from("user_roles")
      .insert({ user_id: data.user_id, role: data.role });
    if (error && !String(error.message).includes("duplicate"))
      throw new Response(error.message, { status: 500 });
    return { ok: true };
  });

export const revokeRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => roleSchema.parse(d))
  .handler(async ({ context, data }) => {
    const admin = await ensureAdmin(context.userId);
    // guarda: nunca deixar zero admins
    if (data.role === "admin") {
      const { count } = await admin
        .from("user_roles")
        .select("*", { count: "exact", head: true })
        .eq("role", "admin");
      if ((count ?? 0) <= 1) throw new Response("Não é possível remover o último admin", { status: 400 });
    }
    const { error } = await admin
      .from("user_roles")
      .delete()
      .eq("user_id", data.user_id)
      .eq("role", data.role);
    if (error) throw new Response(error.message, { status: 500 });
    return { ok: true };
  });

const linkSchema = z.object({
  user_id: z.string().uuid(),
  company_id: z.string().uuid(),
});

export const linkUserCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => linkSchema.parse(d))
  .handler(async ({ context, data }) => {
    const admin = await ensureAdmin(context.userId);
    const { error } = await admin
      .from("user_companies")
      .insert({ user_id: data.user_id, company_id: data.company_id });
    if (error && !String(error.message).includes("duplicate"))
      throw new Response(error.message, { status: 500 });
    return { ok: true };
  });

export const unlinkUserCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => linkSchema.parse(d))
  .handler(async ({ context, data }) => {
    const admin = await ensureAdmin(context.userId);
    const { error } = await admin
      .from("user_companies")
      .delete()
      .eq("user_id", data.user_id)
      .eq("company_id", data.company_id);
    if (error) throw new Response(error.message, { status: 500 });
    return { ok: true };
  });
