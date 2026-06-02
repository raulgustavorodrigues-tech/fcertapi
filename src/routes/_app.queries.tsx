import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Code2, Star, Play, Pencil, Trash2, Search, Copy, Wand2, Download, FileJson, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { formatRelative } from "@/lib/format";

// ---------- SQL formatter (simple, dependency-free) ----------
function formatSQL(sql: string): string {
  const breakBefore = [
    "SELECT", "FROM", "WHERE", "LEFT JOIN", "RIGHT JOIN", "INNER JOIN",
    "OUTER JOIN", "JOIN", "ORDER BY", "GROUP BY", "HAVING", "LIMIT",
    "OFFSET", "UNION ALL", "UNION", "INSERT INTO", "VALUES", "UPDATE",
    "SET", "DELETE FROM", "RETURNING",
  ];
  let s = sql.replace(/\s+/g, " ").trim();
  // Uppercase keywords
  const kw = /\b(select|from|where|left join|right join|inner join|outer join|join|order by|group by|having|limit|offset|union all|union|insert into|values|update|set|delete from|returning|and|or|on|as|in|is|not|null|distinct|case|when|then|else|end)\b/gi;
  s = s.replace(kw, (m) => m.toUpperCase());
  // Line breaks before major clauses
  for (const k of breakBefore) {
    const re = new RegExp(`\\s+${k.replace(/ /g, "\\s+")}\\b`, "g");
    s = s.replace(re, `\n${k}`);
  }
  // Indent AND/OR on WHERE
  s = s.replace(/\s+(AND|OR)\b/g, "\n  $1");
  // After SELECT: split columns
  s = s.replace(/^SELECT\s+(.+?)(?=\n|$)/m, (_m, cols) => {
    const parts = cols.split(/,(?![^(]*\))/).map((c: string) => c.trim());
    if (parts.length <= 1) return `SELECT ${cols.trim()}`;
    return "SELECT\n  " + parts.join(",\n  ");
  });
  // Ensure trailing semicolon stays on its own
  s = s.replace(/\s*;\s*$/, ";");
  return s.trim();
}

// ---------- Parameter helpers (:name) ----------
function extractParams(sql: string): string[] {
  const re = /(?<!:):([a-zA-Z_][a-zA-Z0-9_]*)/g;
  const set = new Set<string>();
  let m;
  while ((m = re.exec(sql))) set.add(m[1]);
  return Array.from(set);
}

function applyParams(sql: string, params: Record<string, string>): string {
  return sql.replace(/(?<!:):([a-zA-Z_][a-zA-Z0-9_]*)/g, (_m, name) => {
    if (!(name in params)) return `:${name}`;
    const v = params[name];
    if (v === "" || v == null) return "NULL";
    if (/^-?\d+(\.\d+)?$/.test(v)) return v;
    return `'${v.replace(/'/g, "''")}'`;
  });
}

// ---------- Export helpers ----------
function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function rowsToCSV(cols: string[], rows: any[]): string {
  const esc = (v: any) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

export const Route = createFileRoute("/_app/queries")({ component: QueriesPage });

const SQL_KEYWORDS = /\b(SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AS|AND|OR|NOT|NULL|IS|IN|LIKE|BETWEEN|ORDER BY|GROUP BY|HAVING|LIMIT|OFFSET|DISTINCT|COUNT|SUM|AVG|MIN|MAX|CREATE|TABLE|ALTER|DROP|INDEX|VIEW|UNION|ALL|CASE|WHEN|THEN|ELSE|END|FIRST|SKIP|GENERATOR|TRIGGER|PROCEDURE)\b/gi;

function highlight(sql: string) {
  const escaped = sql.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped
    .replace(/('([^']|'')*')/g, '<span class="text-success">$1</span>')
    .replace(/(--[^\n]*)/g, '<span class="text-muted-foreground italic">$1</span>')
    .replace(/\b(\d+)\b/g, '<span class="text-secondary">$1</span>')
    .replace(SQL_KEYWORDS, '<span class="text-primary font-semibold">$&</span>');
}

function QueriesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterFav, setFilterFav] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [runner, setRunner] = useState<any>(null);

  const { data: queries = [], isLoading } = useQuery({
    queryKey: ["saved_queries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("saved_queries")
        .select("*, databases(name, companies(name))")
        .order("favorite", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    return queries.filter((q: any) => {
      if (filterFav && !q.favorite) return false;
      if (search && !q.name.toLowerCase().includes(search.toLowerCase()) && !(q.description ?? "").toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [queries, search, filterFav]);

  const toggleFav = useMutation({
    mutationFn: async ({ id, favorite }: any) => {
      const { error } = await supabase.from("saved_queries").update({ favorite }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved_queries"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("saved_queries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saved_queries"] });
      toast.success("Query removida");
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-[320px] max-w-full">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar queries…" className="pl-8 bg-card font-mono text-xs" />
        </div>
        <Button variant={filterFav ? "default" : "outline"} size="sm" onClick={() => setFilterFav(!filterFav)}>
          <Star className={`h-3.5 w-3.5 mr-1.5 ${filterFav ? "fill-current" : ""}`} /> Favoritas
        </Button>
        <Badge variant="muted">{filtered.length} query(s)</Badge>
        <div className="flex-1" />
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditing(null)}><Plus className="h-4 w-4 mr-1.5" /> Nova Query</Button>
          </DialogTrigger>
          <QueryDialog
            initial={editing}
            onClose={() => { setOpen(false); setEditing(null); }}
            onSaved={() => qc.invalidateQueries({ queryKey: ["saved_queries"] })}
          />
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center bg-card border-border">
          <Code2 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-mono text-sm font-semibold">Nenhuma query salva</h3>
          <p className="text-xs text-muted-foreground mt-1 mb-4">Crie sua biblioteca de SQLs reutilizáveis.</p>
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> Nova Query</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((q: any) => (
            <Card key={q.id} className="p-4 bg-card border-border hover:border-primary/40 transition-colors flex flex-col">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold truncate">{q.name}</span>
                    {q.favorite && <Star className="h-3.5 w-3.5 fill-warning text-warning shrink-0" />}
                  </div>
                  {q.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{q.description}</p>}
                </div>
              </div>
              {q.databases && (
                <div className="flex gap-1.5 mb-2 flex-wrap">
                  <Badge variant="info">{q.databases.companies?.name}</Badge>
                  <Badge variant="muted">{q.databases.name}</Badge>
                </div>
              )}
              <pre
                className="text-[11px] font-mono bg-background/60 border border-border rounded p-2.5 overflow-x-auto max-h-32 leading-relaxed flex-1"
                dangerouslySetInnerHTML={{ __html: highlight(q.sql_content) }}
              />
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
                  {q.last_run_at ? `Exec. ${formatRelative(q.last_run_at)}` : "Nunca executada"}
                </span>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => toggleFav.mutate({ id: q.id, favorite: !q.favorite })}>
                    <Star className={`h-3.5 w-3.5 ${q.favorite ? "fill-warning text-warning" : ""}`} />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(q.sql_content); toast.success("SQL copiado"); }}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setRunner(q)}>
                    <Play className="h-3.5 w-3.5 mr-1" /> Executar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setEditing(q); setOpen(true); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { if (confirm("Remover esta query?")) remove.mutate(q.id); }}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {runner && <RunnerDialog query={runner} onClose={() => setRunner(null)} onRan={() => qc.invalidateQueries({ queryKey: ["saved_queries"] })} />}
    </div>
  );
}

function QueryDialog({ initial, onClose, onSaved }: any) {
  const { data: databases = [] } = useQuery({
    queryKey: ["databases-list"],
    queryFn: async () => {
      const { data } = await supabase.from("databases").select("id, name, companies(name)").order("name");
      return data ?? [];
    },
  });

  const [form, setForm] = useState({
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    sql_content: initial?.sql_content ?? "SELECT FIRST 10 * FROM TABELA",
    database_id: initial?.database_id ?? null,
    favorite: initial?.favorite ?? false,
    tags: (initial?.tags ?? []).join(", "),
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.name.trim()) { toast.error("Nome é obrigatório"); return; }
    if (!form.sql_content.trim()) { toast.error("SQL não pode estar vazio"); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        description: form.description || null,
        sql_content: form.sql_content,
        database_id: form.database_id || null,
        favorite: form.favorite,
        tags: form.tags ? form.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : [],
      };
      if (initial) {
        const { error } = await supabase.from("saved_queries").update(payload).eq("id", initial.id);
        if (error) throw error;
        toast.success("Query atualizada");
      } else {
        const { error } = await supabase.from("saved_queries").insert(payload);
        if (error) throw error;
        toast.success("Query salva");
      }
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogContent
      className="max-w-3xl max-h-[90vh] overflow-y-auto"
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          if (!saving) save();
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>{initial ? "Editar query" : "Nova query"}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Vendas do dia" />
          </div>
          <div className="space-y-1.5">
            <Label>Banco vinculado (opcional)</Label>
            <Select value={form.database_id ?? "none"} onValueChange={(v) => setForm({ ...form, database_id: v === "none" ? null : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Genérica —</SelectItem>
                {databases.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.companies?.name} · {d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Descrição</Label>
          <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>SQL *</Label>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground font-mono">{form.sql_content.length} chars</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setForm((f: any) => ({ ...f, sql_content: formatSQL(f.sql_content) }));
                  toast.success("SQL formatado");
                }}
              >
                <Wand2 className="h-3.5 w-3.5 mr-1.5" /> Formatar SQL
              </Button>
            </div>
          </div>
          <div className="relative rounded border border-border bg-background/60">
            <pre
              className="absolute inset-0 p-3 font-mono text-xs whitespace-pre-wrap pointer-events-none overflow-hidden leading-relaxed"
              aria-hidden
              dangerouslySetInnerHTML={{ __html: highlight(form.sql_content) + "\n" }}
            />
            <Textarea
              value={form.sql_content}
              onChange={(e) => setForm({ ...form, sql_content: e.target.value })}
              rows={12}
              spellCheck={false}
              className="relative bg-transparent text-transparent caret-primary font-mono text-xs leading-relaxed resize-none border-0 focus-visible:ring-0"
            />
          </div>
          <p className="text-[10px] text-muted-foreground font-mono">
            Atalho: <kbd className="px-1 py-0.5 rounded bg-muted">Ctrl+S</kbd> salva · use <code>:nome</code> para parâmetros
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Tags (separadas por vírgula)</Label>
            <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="vendas, relatorio" />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={form.favorite} onChange={(e) => setForm({ ...form, favorite: e.target.checked })} />
              Marcar como favorita
            </label>
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function RunnerDialog({ query, onClose, onRan }: any) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const paramNames = useMemo(() => extractParams(query.sql_content), [query.sql_content]);
  const [params, setParams] = useState<Record<string, string>>(
    () => Object.fromEntries(paramNames.map((p) => [p, ""])),
  );

  const finalSQL = useMemo(() => applyParams(query.sql_content, params), [query.sql_content, params]);

  async function exec() {
    setRunning(true);
    setResult(null);
    const start = Date.now();
    setTimeout(async () => {
      const ok = Math.random() > 0.15;
      const duration = Date.now() - start + Math.floor(Math.random() * 600);
      if (ok) {
        const rowCount = Math.floor(Math.random() * 50) + 1;
        const cols = ["ID", "DESCRICAO", "VALOR", "DATA"];
        const rows = Array.from({ length: Math.min(rowCount, 10) }).map((_, i) => ({
          ID: 1000 + i,
          DESCRICAO: `Registro ${i + 1}`,
          VALOR: (Math.random() * 1000).toFixed(2),
          DATA: new Date(Date.now() - i * 86400000).toISOString().split("T")[0],
        }));
        setResult({ ok: true, cols, rows, total: rowCount, duration });
        await supabase.from("saved_queries").update({ last_run_at: new Date().toISOString() }).eq("id", query.id);
        onRan();
        toast.success(`${rowCount} registros em ${duration}ms`);
      } else {
        setResult({ ok: false, error: "ISC ERROR CODE:335544569 - Dynamic SQL Error / Token unknown" });
        toast.error("Erro de execução");
      }
      setRunning(false);
    }, 900);
  }

  function exportCSV() {
    if (!result?.ok) return;
    downloadFile(`${query.name}.csv`, rowsToCSV(result.cols, result.rows), "text/csv;charset=utf-8");
    toast.success("CSV exportado");
  }
  function exportJSON() {
    if (!result?.ok) return;
    downloadFile(`${query.name}.json`, JSON.stringify(result.rows, null, 2), "application/json");
    toast.success("JSON exportado");
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] overflow-y-auto"
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            if (!running && query.database_id) exec();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-4 w-4 text-primary" /> {query.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <pre
            className="text-xs font-mono bg-background/60 border border-border rounded p-3 overflow-x-auto leading-relaxed max-h-40"
            dangerouslySetInnerHTML={{ __html: highlight(query.sql_content) }}
          />

          {paramNames.length > 0 && (
            <div className="space-y-2 rounded border border-border bg-background/40 p-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-mono uppercase tracking-wider text-primary">
                  Parâmetros ({paramNames.length})
                </Label>
                <span className="text-[10px] text-muted-foreground font-mono">
                  Strings entre aspas, números literais, vazio = NULL
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {paramNames.map((p) => (
                  <div key={p} className="space-y-1">
                    <Label className="text-[11px] font-mono text-secondary">:{p}</Label>
                    <Input
                      value={params[p] ?? ""}
                      onChange={(e) => setParams({ ...params, [p]: e.target.value })}
                      placeholder={`valor para :${p}`}
                      className="h-8 font-mono text-xs"
                    />
                  </div>
                ))}
              </div>
              <details className="text-[11px] font-mono">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Ver SQL com parâmetros substituídos
                </summary>
                <pre
                  className="mt-2 p-2 bg-background/60 border border-border rounded overflow-x-auto"
                  dangerouslySetInnerHTML={{ __html: highlight(finalSQL) }}
                />
              </details>
            </div>
          )}

          {!query.database_id && (
            <div className="text-xs text-warning bg-warning/10 border border-warning/30 rounded p-2.5 font-mono">
              ⚠ Esta query não tem banco vinculado. Selecione um banco no Editor.
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button onClick={exec} disabled={running || !query.database_id} className="flex-1">
              <Play className="h-4 w-4 mr-1.5" /> {running ? "Executando…" : "Executar no agente"}
            </Button>
            <span className="text-[10px] font-mono text-muted-foreground">
              <kbd className="px-1 py-0.5 rounded bg-muted">Ctrl+Enter</kbd>
            </span>
          </div>
          {result && (
            <div className="space-y-2">
              {result.ok ? (
                <>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3 text-xs font-mono">
                      <Badge variant="success">SUCESSO</Badge>
                      <span className="text-muted-foreground">{result.total} registros · {result.duration}ms</span>
                    </div>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" onClick={exportCSV}>
                        <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" /> CSV
                      </Button>
                      <Button size="sm" variant="outline" onClick={exportJSON}>
                        <FileJson className="h-3.5 w-3.5 mr-1.5" /> JSON
                      </Button>
                    </div>
                  </div>
                  <div className="overflow-x-auto border border-border rounded">
                    <table className="w-full text-xs font-mono">
                      <thead className="bg-background/80 border-b border-border">
                        <tr>{result.cols.map((c: string) => <th key={c} className="text-left px-3 py-2 text-primary uppercase text-[10px]">{c}</th>)}</tr>
                      </thead>
                      <tbody>
                        {result.rows.map((r: any, i: number) => (
                          <tr key={i} className="border-b border-border/50 hover:bg-background/40">
                            {result.cols.map((c: string) => <td key={c} className="px-3 py-1.5">{String(r[c])}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="text-xs font-mono bg-destructive/10 border border-destructive/30 rounded p-3 text-destructive whitespace-pre-wrap">
                  {result.error}
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

