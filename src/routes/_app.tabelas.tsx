import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useMemo, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table as TableIcon, Search, Key, Columns3, RefreshCw, Loader2, Clock, Plus, Pencil, Save, CheckSquare, Square, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { formatRelative } from "@/lib/format";
import { enqueueCommand, awaitCommandResult } from "@/lib/commands";
import { SchemaEditorDialog } from "@/components/conecta/SchemaEditorDialog";

/** Parse sync_tables ("ALL" ou "T1,T2,T3") num Set normalizado em UPPERCASE. */
function parseSyncTables(raw: string | null | undefined): { mode: "ALL" | "SELECTED"; set: Set<string> } {
  const v = (raw ?? "ALL").trim();
  if (!v || v.toUpperCase() === "ALL") return { mode: "ALL", set: new Set() };
  const set = new Set(
    v.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
  );
  return { mode: "SELECTED", set };
}
function serializeSyncTables(mode: "ALL" | "SELECTED", set: Set<string>): string {
  if (mode === "ALL") return "ALL";
  const arr = Array.from(set).map((s) => s.toUpperCase()).sort();
  return arr.length === 0 ? "" : arr.join(",");
}

function getTableRowCount(table: any): number {
  return Number(table?.row_count ?? table?.rows ?? 0);
}

export const Route = createFileRoute("/_app/tabelas")({ component: Page });

// MOCK_SCHEMA removido — o schema agora vem exclusivamente de schema_cache
// (populado pelo comando list_tables enviado ao agente).

function Page() {
  const qc = useQueryClient();
  const [databaseId, setDatabaseId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [waitElapsed, setWaitElapsed] = useState(0);
  const [loadStage, setLoadStage] = useState<"enqueue" | "delivered" | "scanning" | "finalizing">("enqueue");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "alter">("create");

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

  // Carrega sync_tables atual do banco selecionado
  const { data: dbRow } = useQuery({
    queryKey: ["database-sync-tables", databaseId],
    queryFn: async () => {
      if (!databaseId) return null;
      const { data } = await supabase
        .from("databases")
        .select("id, name, sync_tables")
        .eq("id", databaseId)
        .maybeSingle();
      return data;
    },
    enabled: !!databaseId,
  });

  // Estado local do escopo de sincronização (modo + set)
  const [syncMode, setSyncMode] = useState<"ALL" | "SELECTED">("ALL");
  const [syncSet, setSyncSet] = useState<Set<string>>(new Set());
  const [savingSync, setSavingSync] = useState(false);

  // Sincroniza estado local quando o banco/registro muda
  useEffect(() => {
    const parsed = parseSyncTables(dbRow?.sync_tables);
    setSyncMode(parsed.mode);
    setSyncSet(parsed.set);
  }, [dbRow?.id, dbRow?.sync_tables]);

  const tables: any[] = useMemo(() => {
    if (cacheRow?.tables && Array.isArray(cacheRow.tables)) {
      return cacheRow.tables as any[];
    }
    return [];
  }, [cacheRow]);

  const filteredTables = useMemo(() => {
    if (!databaseId) return [];
    return tables.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()));
  }, [databaseId, search, tables]);

  // Marca se uma tabela está no escopo (ALL ⇒ todas; SELECTED ⇒ set)
  function isInScope(name: string): boolean {
    if (syncMode === "ALL") return true;
    return syncSet.has(name.toUpperCase());
  }

  function toggleTable(name: string, checked: boolean) {
    const key = name.toUpperCase();
    const next = new Set(syncSet);
    if (checked) next.add(key); else next.delete(key);
    setSyncSet(next);
    if (syncMode !== "SELECTED") setSyncMode("SELECTED");
  }

  function selectAllVisible() {
    const next = new Set(syncSet);
    for (const t of filteredTables) next.add(String(t.name).toUpperCase());
    setSyncSet(next);
    setSyncMode("SELECTED");
  }
  function clearAllVisible() {
    const next = new Set(syncSet);
    for (const t of filteredTables) next.delete(String(t.name).toUpperCase());
    setSyncSet(next);
    setSyncMode("SELECTED");
  }

  const originalParsed = parseSyncTables(dbRow?.sync_tables);
  const currentSerialized = serializeSyncTables(syncMode, syncSet);
  const originalSerialized = serializeSyncTables(originalParsed.mode, originalParsed.set);
  const isDirty = currentSerialized !== originalSerialized;

  async function saveSyncScope() {
    if (!databaseId) return;
    if (syncMode === "SELECTED" && syncSet.size === 0) {
      toast.error("Selecione ao menos uma tabela ou volte para o modo ‘Sincronizar todas’.");
      return;
    }
    setSavingSync(true);
    try {
      const value = syncMode === "ALL" ? "ALL" : serializeSyncTables("SELECTED", syncSet);
      const { error } = await supabase
        .from("databases")
        .update({ sync_tables: value })
        .eq("id", databaseId);
      if (error) throw error;
      toast.success(
        syncMode === "ALL"
          ? "Escopo atualizado: sincronizar TODAS as tabelas."
          : `Escopo atualizado: ${syncSet.size} tabela(s) selecionada(s).`,
      );
      qc.invalidateQueries({ queryKey: ["database-sync-tables", databaseId] });
      qc.invalidateQueries({ queryKey: ["databases"] });
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao salvar seleção");
    } finally {
      setSavingSync(false);
    }
  }

  async function reloadSchema() {
    if (!databaseId) return;
    setLoading(true);
    setWaitElapsed(0);
    setLoadStage("enqueue");
    const startTs = Date.now();
    const tick = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTs) / 1000);
      setWaitElapsed(elapsed);
      // Heurística de estágio quando o agente ainda não atualizou o status
      setLoadStage((prev) => {
        if (prev === "finalizing") return prev;
        if (elapsed >= 8 && prev === "delivered") return "scanning";
        return prev;
      });
    }, 250);
    try {
      const { command_id } = await enqueueCommand(databaseId, "list_tables", {});
      const row = await awaitCommandResult(command_id, {
        timeoutMs: 120_000,
        intervalMs: 1500,
        onUpdate: (r) => {
          if (r?.status === "processing") setLoadStage("scanning");
          else if (r?.status === "pending") {
            setLoadStage((prev) => (prev === "enqueue" ? "delivered" : prev));
          }
        },
      });
      setLoadStage("finalizing");
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

  const STAGES: Array<{ key: typeof loadStage; label: string; hint: string }> = [
    { key: "enqueue", label: "Enfileirando comando", hint: "Registrando pedido no hub" },
    { key: "delivered", label: "Aguardando agente", hint: "Heartbeat entrega o comando ao serviço local" },
    { key: "scanning", label: "Varrendo tabelas", hint: "Agente lê metadados do Firebird (pode levar até 2min)" },
    { key: "finalizing", label: "Finalizando", hint: "Salvando cache do schema" },
  ];
  const stageIndex = STAGES.findIndex((s) => s.key === loadStage);


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
              <Button size="sm" onClick={() => { setEditorMode("create"); setEditorOpen(true); }}>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Nova tabela
              </Button>
              <Button
                size="sm" variant="outline"
                disabled={!selected}
                onClick={() => { setEditorMode("alter"); setEditorOpen(true); }}
              >
                <Pencil className="h-3.5 w-3.5 mr-1.5" /> Alterar
              </Button>
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filtrar…" className="pl-8 font-mono text-xs" />
              </div>
            </>
          )}
        </div>
        {loading && (
          <div className="mt-3 p-3 rounded border border-dashed border-primary/30 bg-primary/5 space-y-3">
            <div className="flex items-center justify-between gap-3 text-xs font-mono">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary animate-pulse" />
                <span className="font-semibold">
                  {STAGES[stageIndex]?.label ?? "Solicitando schema ao agente"}
                </span>
                <span className="text-muted-foreground">— {STAGES[stageIndex]?.hint}</span>
              </div>
              <span className="text-[10px] text-muted-foreground">{waitElapsed}s / máx. 120s</span>
            </div>
            <ol className="grid grid-cols-4 gap-2">
              {STAGES.map((s, i) => {
                const done = i < stageIndex;
                const active = i === stageIndex;
                return (
                  <li
                    key={s.key}
                    className={`flex items-center gap-2 rounded px-2 py-1.5 border text-[10px] font-mono transition-colors ${
                      done
                        ? "border-success/40 bg-success/10 text-success"
                        : active
                          ? "border-primary/50 bg-primary/10 text-primary"
                          : "border-border bg-background/40 text-muted-foreground"
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded-full border text-[9px] ${
                        done
                          ? "border-success bg-success text-background"
                          : active
                            ? "border-primary text-primary"
                            : "border-muted-foreground/40"
                      }`}
                    >
                      {done ? "✓" : i + 1}
                    </span>
                    <span className="truncate">{s.label}</span>
                    {active && <Loader2 className="h-3 w-3 ml-auto animate-spin" />}
                  </li>
                );
              })}
            </ol>
            <div className="h-1 rounded bg-border overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${((stageIndex + 1) / STAGES.length) * 100}%` }}
              />
            </div>
          </div>
        )}
      </Card>

      {databaseId && (
        <Card className="p-4 bg-card border-border">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-primary" />
                <h3 className="font-mono text-sm font-semibold">Escopo de sincronização</h3>
                {syncMode === "ALL" ? (
                  <Badge variant="success" className="text-[10px] font-mono">TODAS AS TABELAS</Badge>
                ) : (
                  <Badge variant="info" className="text-[10px] font-mono">
                    {syncSet.size} SELECIONADA{syncSet.size === 1 ? "" : "S"}
                  </Badge>
                )}
                {isDirty && (
                  <Badge variant="warning" className="text-[10px] font-mono">ALTERAÇÕES NÃO SALVAS</Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground max-w-2xl">
                Bancos com milhares de tabelas ficam lentos ao sincronizar tudo. Escolha aqui somente as tabelas
                que a API deve replicar. O agente aplica o filtro na próxima sincronização — sem redeploy.
              </p>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Switch
                  id="sync-all"
                  checked={syncMode === "ALL"}
                  onCheckedChange={(v) => setSyncMode(v ? "ALL" : "SELECTED")}
                />
                <Label htmlFor="sync-all" className="text-xs cursor-pointer">Sincronizar todas</Label>
              </div>
              {syncMode === "SELECTED" && filteredTables.length > 0 && (
                <>
                  <Button size="sm" variant="outline" onClick={selectAllVisible}>
                    <CheckSquare className="h-3.5 w-3.5 mr-1.5" /> Marcar visíveis
                  </Button>
                  <Button size="sm" variant="outline" onClick={clearAllVisible}>
                    <Square className="h-3.5 w-3.5 mr-1.5" /> Desmarcar visíveis
                  </Button>
                </>
              )}
              <Button size="sm" onClick={saveSyncScope} disabled={!isDirty || savingSync}>
                {savingSync ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                Salvar seleção
              </Button>
            </div>
          </div>

          {/* Filtro de busca dedicado ao escopo de sincronização */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar tabela para incluir/excluir da sincronização…"
                className="pl-8 font-mono text-xs"
                disabled={syncMode === "ALL"}
              />
            </div>
            <span className="text-[10px] text-muted-foreground font-mono">
              {search
                ? `${filteredTables.length} de ${tables.length} tabela(s) visível(is)`
                : `${tables.length} tabela(s) no schema`}
            </span>
            {search && (
              <Button size="sm" variant="ghost" onClick={() => setSearch("")} className="text-[10px] h-7">
                Limpar filtro
              </Button>
            )}
            {syncMode === "SELECTED" && (
              <span className="text-[10px] text-muted-foreground font-mono ml-auto">
                Dica: filtre e use <span className="text-primary">Marcar visíveis</span> para selecionar em lote.
              </span>
            )}
          </div>
          {syncMode === "SELECTED" && syncSet.size > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {Array.from(syncSet).sort().map((n) => (
                <Badge key={n} variant="muted" className="font-mono text-[10px] gap-1">
                  {n}
                  <button
                    onClick={() => {
                      const next = new Set(syncSet); next.delete(n); setSyncSet(next);
                    }}
                    className="ml-1 hover:text-destructive"
                    title="Remover"
                  >×</button>
                </Badge>
              ))}
            </div>
          )}
        </Card>
      )}

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
            </h3>
            <div className="space-y-1 max-h-[600px] overflow-y-auto">
              {filteredTables.length === 0 ? (
                <div className="text-center py-8 px-3 border border-dashed border-border rounded">
                  <p className="text-[11px] text-muted-foreground font-mono">
                    {cacheRow ? "Nenhuma tabela encontrada." : "Nenhum schema em cache."}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Clique em <span className="text-primary">Recarregar schema</span> para solicitar ao agente.
                  </p>
                </div>
              ) : (
                filteredTables.map((t: any) => {
                  const inScope = isInScope(t.name);
                  return (
                    <div
                      key={t.name}
                      className={`flex items-center gap-2 p-2.5 rounded border transition-colors font-mono text-xs ${
                        selected?.name === t.name ? "border-primary bg-primary/10 text-primary" : "border-border bg-background/40 hover:border-primary/40"
                      }`}
                    >
                      <Checkbox
                        checked={syncMode === "ALL" ? true : syncSet.has(String(t.name).toUpperCase())}
                        disabled={syncMode === "ALL"}
                        onCheckedChange={(v) => toggleTable(t.name, Boolean(v))}
                        title={syncMode === "ALL" ? "Modo ‘Todas as tabelas’ ativo — desligue para selecionar" : "Incluir/remover do escopo de sincronização"}
                      />
                      <button
                        onClick={() => setSelected(t)}
                        className="flex-1 text-left cursor-pointer"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold truncate">{t.name}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {inScope && syncMode === "SELECTED" && (
                              <Badge variant="success" className="text-[9px] font-mono px-1 py-0">SYNC</Badge>
                            )}
                            {(t.row_count != null || t.rows != null) && (
                              <span className="text-[10px] text-muted-foreground">{getTableRowCount(t).toLocaleString("pt-BR")}</span>
                            )}
                          </div>
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{t.columns?.length ?? 0} colunas</div>
                      </button>
                    </div>
                  );
                })
              )}
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
                      {getTableRowCount(selected).toLocaleString("pt-BR")} registros · {selected.columns?.length ?? 0} colunas
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

      <SchemaEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        databaseId={databaseId}
        mode={editorMode}
        table={editorMode === "alter" ? selected : null}
        onApplied={reloadSchema}
      />
    </div>
  );
}
