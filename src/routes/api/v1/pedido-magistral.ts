// GET /api/v1/pedido-magistral?page=1&limit=200&grupo=M&filial=1&situacao=A&cdpro=123&abaixo_minimo=true
// Header: Authorization: Bearer <api_key>
// Retorna, por produto: cadastro, estoque por filial, lotes com saldo, histórico de preços,
// consumo mensal (12 meses), entradas de notas com fornecedor.
import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
function err(status: number, code: string, message: string) {
  return Response.json({ success: false, error: { code, message } }, { status, headers: CORS });
}
const MAX_LIMIT = 500;
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export const Route = createFileRoute("/api/v1/pedido-magistral")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
        const { authorizeApiRequest } = await import("@/lib/api-auth.server");
        const auth = await authorizeApiRequest(admin, request, "pedido-magistral");
        if (!auth.ok) return err(auth.status, auth.code, auth.message);
        const key = auth.key;

        const url = new URL(request.url);
        const p = url.searchParams;
        const limit = Math.max(1, Math.min(Number(p.get("limit") ?? 200) || 200, MAX_LIMIT));
        const page = Math.max(1, Number(p.get("page") ?? 1) || 1);
        const grupo = p.get("grupo"), filial = p.get("filial"), situacao = p.get("situacao");
        const cdpro = p.get("cdpro"), abaixoMin = p.get("abaixo_minimo") === "true";

        let dbIds: string[] = [];
        if (key.database_id) dbIds = [key.database_id];
        else if (key.company_id) {
          const { data } = await admin.from("databases").select("id").eq("company_id", key.company_id);
          dbIds = (data ?? []).map((d) => d.id);
        }
        if (!dbIds.length) return err(404, "NO_DATABASE", "Nenhum banco vinculado à chave");
        const dbId = p.get("database_id") && dbIds.includes(p.get("database_id")!) ? p.get("database_id")! : dbIds[0];

        // Filtro "abaixo do mínimo" é resolvido pelo estoque.
        let restrict: string[] | null = null;
        if (abaixoMin) {
          const data = await fetchAll((from, to) => {
            let eq = admin.from("pm_estoque").select("cdpro, estmi, estat, cdfil").eq("database_id", dbId).gt("estmi", 0)
              .order("cdpro").order("cdfil").range(from, to);
            if (filial) eq = eq.eq("cdfil", filial);
            return eq as any;
          });
          if (data === null) return err(500, "DB_ERROR", "Falha ao consultar estoque");
          restrict = [...new Set((data ?? []).filter((e) => Number(e.estat ?? 0) < Number(e.estmi)).map((e) => e.cdpro))];
          if (!restrict.length) restrict = ["__none__"];
        }

        let q = admin.from("pm_produtos").select("*", { count: "exact" }).eq("database_id", dbId)
          .order("cdpro").range((page - 1) * limit, page * limit - 1);
        if (grupo) q = q.eq("grupo", grupo);
        if (situacao) q = q.eq("situa", situacao);
        if (cdpro) q = q.eq("cdpro", cdpro);
        if (restrict) q = q.or(restrictFilter(restrict));
        const { data: prods, count, error } = await q;
        if (error) return err(500, "DB_ERROR", "Falha ao consultar produtos");
        const codes = (prods ?? []).map((x) => x.cdpro);

        const sel = async (t: string, cols: string, order: string) => {
          if (!codes.length) return [] as any[];
          const data = await fetchAll((from, to) => {
            let qq = (admin.from(t as any) as any).select(cols).eq("database_id", dbId).in("cdpro", codes)
              .order("cdpro").order(order).range(from, to);
            if (filial && (t === "pm_estoque" || t === "pm_lotes")) qq = qq.eq("cdfil", filial);
            return qq;
          });
          if (data === null) throw new Error(`Falha ao consultar ${t}`);
          return data;
        };
        let est: any[], lotes: any[], precos: any[], cons: any[], notas: any[];
        try {
        [est, lotes, precos, cons, notas] = await Promise.all([
          sel("pm_estoque", "cdfil, cdpro, estmi, estma, estat", "cdfil"),
          sel("pm_lotes", "cdfil, cdpro, ctlot, nrlot, nrnot, stlot, dtent, dtval, estat", "dtval"),
          sel("pm_precos", "cdpro, dtreaj, prcom", "dtreaj"),
          sel("pm_consumo_mensal", "cdpro, mes, qtreal", "mes"),
          sel("pm_notas", "cdpro, nrnot, fornecid, dtent, quant, pruni", "dtent"),
        ]);
        } catch (e) {
          return err(500, "DB_ERROR", (e as Error).message);
        }
        const fids = [...new Set(notas.map((n) => n.fornecid))];
        const { data: forns } = fids.length
          ? await admin.from("pm_fornecedores").select("fornecid, nrcnpj, fanta").eq("database_id", dbId).in("fornecid", fids)
          : { data: [] as any[] };
        const fmap = new Map((forns ?? []).map((f) => [f.fornecid, f]));
        const by = <T extends { cdpro: string }>(arr: T[]) => {
          const m = new Map<string, T[]>();
          for (const r of arr) (m.get(r.cdpro) ?? m.set(r.cdpro, []).get(r.cdpro)!).push(r);
          return m;
        };
        const mEst = by(est), mLot = by(lotes), mPre = by(precos), mCon = by(cons), mNot = by(notas);

        const out = (prods ?? []).map((pr) => {
          const lts = mLot.get(pr.cdpro) ?? [];
          const consumo = (mCon.get(pr.cdpro) ?? []).map((c) => ({ mes: c.mes, quantidade: num(c.qtreal) }));
          let prev: number | null = null;
          return {
            cdpro: pr.cdpro, descricao: pr.descr, unidade: pr.unida, grupo: pr.grupo, sngpc: pr.indsngpc,
            situacao: pr.situa, bloqueio: pr.indbloqueio, preco_custo: num(pr.prcom),
            estoque: (mEst.get(pr.cdpro) ?? []).map((e) => {
              const soma = lts.filter((l) => l.cdfil === e.cdfil).reduce((a, l) => a + Number(l.estat ?? 0), 0);
              const atual = Number(e.estat ?? 0);
              return { filial: e.cdfil, minimo: num(e.estmi), maximo: num(e.estma), atual,
                soma_lotes: Math.round(soma * 1000) / 1000, divergente: Math.abs(soma - atual) > 0.001 };
            }),
            lotes: lts.map((l) => ({ filial: l.cdfil, controle: l.ctlot, lote: l.nrlot, nota: l.nrnot,
              entrada: l.dtent, validade: l.dtval, situacao: l.stlot, saldo: num(l.estat) })),
            precos: (mPre.get(pr.cdpro) ?? []).map((x) => {
              const v = Number(x.prcom ?? 0);
              const pct = prev && prev > 0 ? Math.round(((v - prev) / prev) * 10000) / 100 : null;
              prev = v;
              return { data: x.dtreaj, preco: v, variacao_pct: pct };
            }),
            consumo_mensal: consumo,
            media_consumo_mensal: consumo.length
              ? Math.round((consumo.reduce((a, c) => a + (c.quantidade ?? 0), 0) / 12) * 1000) / 1000 : 0,
            entradas: (mNot.get(pr.cdpro) ?? []).map((n) => {
              const f = fmap.get(n.fornecid);
              return { nota: n.nrnot, data: n.dtent, quantidade: num(n.quant), preco: num(n.pruni),
                fornecedor: { codigo: n.fornecid, cnpj: f?.nrcnpj ?? null, nome: f?.fanta ?? null } };
            }),
          };
        });

        const { data: st } = await admin.from("pm_sync_status").select("last_sync_at").eq("database_id", dbId).maybeSingle();
        await admin.from("api_access_log").insert({
          api_key_id: key.id, endpoint: "/api/v1/pedido-magistral",
          params: Object.fromEntries(p.entries()), rows_returned: out.length, status: 200,
        });
        await admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id);

        return Response.json({
          success: true, atualizado_em: st?.last_sync_at ?? null, data: out,
          pagination: { page, limit, returned: out.length, total: count ?? null },
        }, { headers: CORS });
      },
    },
  },
});

/** Busca todas as linhas paginando de 1000 em 1000 (limite padrão da API). null = erro. */
async function fetchAll(
  build: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: unknown }>,
): Promise<any[] | null> {
  const PAGE = 1000;
  const out: any[] = [];
  for (let from = 0; from < 500_000; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) return null;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}
