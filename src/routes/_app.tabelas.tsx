import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table as TableIcon, Search, Key, Columns3, RefreshCw, Loader2, Clock, Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { formatRelative } from "@/lib/format";
import { enqueueCommand, awaitCommandResult } from "@/lib/commands";
import { SchemaEditorDialog } from "@/components/conecta/SchemaEditorDialog";

export const Route = createFileRoute("/_app/tabelas")({ component: Page });

const MOCK_SCHEMA = [
  { name: "CLIENTES", rows: 12450, columns: [
    { name: "ID", type: "INTEGER", pk: true, nullable: false },
    { name: "NOME", type: "VARCHAR(120)", pk: false, nullable: false },
    { name: "CPF_CNPJ", type: "VARCHAR(18)", pk: false, nullable: true },
    { name: "EMAIL", type: "VARCHAR(80)", pk: false, nullable: true },
  ]},
  { name: "PRODUTOS", rows: 3287, columns: [
    { name: "ID", type: "INTEGER", pk: true, nullable: false },
    { name: "CODIGO", type: "VARCHAR(20)", pk: false, nullable: false },
    { name: "DESCRICAO", type: "VARCHAR(200)", pk: false, nullable: false },
    { name: "PRECO_VENDA", type: "NUMERIC(15,2)", pk: false, nullable: false },
  ]},
  { name: "VENDAS", rows: 89234, columns: [
    { name: "ID", type: "INTEGER", pk: true, nullable: false },
    { name: "DATA", type: "DATE", pk: false, nullable: false },
    { name: "ID_CLIENTE", type: "INTEGER", pk: false, nullable: false },
    { name: "TOTAL", type: "NUMERIC(15,2)", pk: false, nullable: false },
  ]},
];

function Page() {
  const qc = useQueryClient();
  const [databaseId, setDatabaseId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [waitElapsed, setWaitElapsed] = useState(0);

  const { data: databases = [] } = useQuery({
    queryKey: ["databases-list-schema"],
    queryFn: async () => {
      const { data } = await supabase.from("databases").select("id, name, status, agent_uid, companies(name)").order("name");
      return data ?? [];
    },
  });

  const { data: cacheRow } = useQuery({
    queryKey: ["schema-cache", databaseId],
    queryFn: async () => {
      if (!databaseId) return null;
      const { data } = await supabase
        .from("schema_cache")
        .select("*")
        .eq("database_id", databaseId)
        .maybeSingle();
      return data;
    },
    enabled: !!databaseId,
  });

  const selectedDb = databases.find((d: any) => d.id === databaseId);

  const tables: any[] = useMemo(() => {
    if (cacheRow?.tables && Array.isArray(cacheRow.tables) && cacheRow.tables.length > 0) {
      return cacheRow.tables as any[];
    }
    return MOCK_SCHEMA;
  }, [cacheRow]);

  const filteredTables = useMemo(() => {
    if (!databaseId) return [];
    return tables.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()));
  }, [databaseId, search, tables]);

  async function reloadSchema() {
    if (!databaseId) return;
    setLoading(true);
    setWaitElapsed(0);
    const startTs = Date.now();
    const tick = setInterval(() => setWaitElapsed(Math.floor((Date.now() - startTs) / 1000)), 250);
    try {
      const { command_id } = await enqueueCommand(databaseId, "list_tables", {});
      const row = await awaitCommandResult(command_id, { timeoutMs: 30_000, intervalMs: 1500 });
      clearInterval(tick);
      if (row.status === "success" && row.result?.tables) {
        const tablesData = row.result.tables;
        await supabase
          .from("schema_cache")
          .upsert(
            { database_id: databaseId, tables: tablesData, cached_at: new Date().toISOString() },
            { onConflict: "database_id" },
          );
        qc.invalidateQueries({ queryKey: ["schema-cache", databaseId] });
        toast.success(`Schema atualizado: ${tablesData.length} tabelas`);
      } else {
        toast.error(row.error_message ?? "Falha ao obter schema");
      }
    } catch (e: any) {
      clearInterval(tick);
      toast.error(e.message ?? "Timeout aguardando agente");
    } finally {
      setLoading(false);
    }
  }

  const cacheAge = cacheRow?.cached_at
    ? Math.floor((Date.now() - new Date(cacheRow.cached_at).getTime()) / 60000)
    : null;

  return (
    <div className="space-y-5">
      <Card className="p-4 bg-card border-border">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={databaseId} onValueChange={(v) => { setDatabaseId(v); setSelected(null); }}>
            <SelectTrigger className="w-[320px]"><SelectValue placeholder="Selecione um banco" /></SelectTrigger>
            <SelectContent>
              {databases.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.companies?.name} · {d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {selectedDb && (
            <Badge variant={selectedDb.status === "connected" ? "success" : "muted"}>
              {selectedDb.status === "connected" ? "CONECTADO" : "OFFLINE"}
            </Badge>
          )}
          {databaseId && (
            <>
              {cacheAge != null && (
                <Badge variant="muted" className="text-[10px] font-mono">
                  Cache {cacheAge}min atrás
                </Badge>
              )}
              <Button size="sm" variant="outline" onClick={reloadSchema} disabled={loading}>
                {loading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                Recarregar schema
              </Button>
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filtrar…" className="pl-8 font-mono text-xs" />
              </div>
            </>
          )}
        </div>
        {loading && (
          <div className="mt-3 p-3 rounded border border-dashed border-primary/30 bg-primary/5 flex items-center gap-3 text-xs font-mono">
            <Clock className="h-4 w-4 text-primary animate-pulse" />
            <span>Solicitando schema ao agente… ({waitElapsed}s / máx. 30s)</span>
          </div>
        )}
      </Card>

      {!databaseId ? (
        <Card className="p-12 text-center bg-card border-border">
          <TableIcon className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-mono text-sm font-semibold">Selecione um banco</h3>
          <p className="text-xs text-muted-foreground mt-1">O hub envia um comando ao agente, que retorna as tabelas via heartbeat.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Card className="lg:col-span-1 p-4 bg-card border-border">
            <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Tabelas ({filteredTables.length})
              {!cacheRow && <span className="ml-2 text-[10px] normal-case text-warning">(mock)</span>}
            </h3>
            <div className="space-y-1 max-h-[600px] overflow-y-auto">
              {filteredTables.map((t: any) => (
                <button
                  key={t.name}
                  onClick={() => setSelected(t)}
                  className={`w-full text-left p-2.5 rounded border transition-colors font-mono text-xs cursor-pointer ${
                    selected?.name === t.name ? "border-primary bg-primary/10 text-primary" : "border-border bg-background/40 hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold truncate">{t.name}</span>
                    {t.rows != null && <span className="text-[10px] text-muted-foreground">{Number(t.rows).toLocaleString("pt-BR")}</span>}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{t.columns?.length ?? 0} colunas</div>
                </button>
              ))}
            </div>
          </Card>

          <Card className="lg:col-span-2 p-4 bg-card border-border">
            {!selected ? (
              <div className="text-center py-12">
                <Columns3 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-xs text-muted-foreground">Selecione uma tabela para ver o schema.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <div className="font-mono text-base font-semibold text-primary">{selected.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 font-mono">
                      {(selected.rows ?? 0).toLocaleString("pt-BR")} registros · {selected.columns?.length ?? 0} colunas
                    </div>
                  </div>
                  {cacheRow && (
                    <span className="text-[10px] text-muted-foreground font-mono">
                      Última atualização: {formatRelative(cacheRow.cached_at)}
                    </span>
                  )}
                </div>
                <div className="overflow-x-auto border border-border rounded">
                  <table className="w-full text-xs font-mono">
                    <thead className="bg-background/80 border-b border-border">
                      <tr>
                        <th className="text-left px-3 py-2 w-8"></th>
                        <th className="text-left px-3 py-2 text-primary uppercase text-[10px]">Nome</th>
                        <th className="text-left px-3 py-2 text-primary uppercase text-[10px]">Tipo</th>
                        <th className="text-left px-3 py-2 text-primary uppercase text-[10px]">Null</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selected.columns ?? []).map((c: any) => (
                        <tr key={c.name} className="border-b border-border/50 hover:bg-background/40">
                          <td className="px-3 py-1.5">{c.pk && <Key className="h-3 w-3 text-warning" />}</td>
                          <td className="px-3 py-1.5">{c.name}</td>
                          <td className="px-3 py-1.5 text-secondary">{c.type}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">{c.nullable ? "YES" : "NO"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
