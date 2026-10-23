// Autorização compartilhada para todas as rotas /api/v1/*:
// chave (hash) -> revogação -> escopo -> API ativa no catálogo -> habilitada para a empresa.
type Admin = any;

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type ApiAuthOk = {
  ok: true;
  key: { id: string; company_id: string | null; database_id: string | null };
};
export type ApiAuthFail = { ok: false; status: number; code: string; message: string };

export async function authorizeApiRequest(
  admin: Admin,
  request: Request,
  slug: string,
): Promise<ApiAuthOk | ApiAuthFail> {
  const apiKey = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!apiKey) return { ok: false, status: 401, code: "MISSING_KEY", message: "Authorization Bearer ausente" };

  const { data: key } = await admin
    .from("api_keys")
    .select("id, company_id, database_id, scopes, revoked_at")
    .eq("key_hash", await sha256Hex(apiKey))
    .maybeSingle();
  if (!key) return { ok: false, status: 401, code: "INVALID_KEY", message: "Chave inválida" };
  if (key.revoked_at) return { ok: false, status: 401, code: "REVOKED_KEY", message: "Chave revogada" };

  const { data: api } = await admin
    .from("api_catalog")
    .select("id, scope, status")
    .eq("slug", slug)
    .maybeSingle();
  if (!api || api.status === "disabled") {
    return { ok: false, status: 503, code: "API_DISABLED", message: "API desativada" };
  }
  if (!key.scopes?.includes(api.scope)) {
    return { ok: false, status: 403, code: "FORBIDDEN", message: `Chave sem permissão ${api.scope}` };
  }

  if (key.company_id) {
    const { data: link } = await admin
      .from("company_apis")
      .select("enabled")
      .eq("company_id", key.company_id)
      .eq("api_id", api.id)
      .maybeSingle();
    if (!link?.enabled) {
      return { ok: false, status: 403, code: "API_NOT_ENABLED", message: "API não habilitada para esta empresa" };
    }
  }
  return { ok: true, key };
}
