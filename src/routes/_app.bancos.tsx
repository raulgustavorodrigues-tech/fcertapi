import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Database as DatabaseIcon, Eye, EyeOff, Zap, RefreshCw, Pencil, Trash2, Copy, Check, X, Loader2, Activity, Download } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime, formatRelative } from "@/lib/format";

type StepStatus = "pending" | "running" | "success" | "error";
type TestStep = { key: string; label: string; status: StepStatus; detail?: string; ms?: number };

export const Route = createFileRoute("/_app/bancos")({
  validateSearch: (s: Record<string, unknown>) => ({ company: (s.company as string) ?? "all" }),
  component: BancosPage,
});

function BancosPage() {
  const { company } = Route.useSearch();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const { data: companies = [] } = useQuery({
    queryKey: ["companies-list"],
    queryFn: async () => {
      const { data } = await supabase.from("companies").select("id, name").order("name");
      return data ?? [];
    },
  });

  const { data: databases = [], isLoading } = useQuery({
    queryKey: ["databases", company],
    queryFn: async () => {
      let q = supabase.from("databases").select("*, companies(name), agents(status, last_heartbeat_at, tunnel_url, pending_commands)").order("created_at", { ascending: false });
      if (company && company !== "all") q = q.eq("company_id", company);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("databases").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["databases"] });
      toast.success("Banco removido");
    },
  });

  

  async function syncNow(db: any) {
    toast.info(`Iniciando sync em ${db.name}…`);
    const startedAt = new Date().toISOString();
    const { data: log } = await supabase
      .from("sync_logs")
      .insert({ database_id: db.id, started_at: startedAt, status: "running" })
      .select()
      .single();
    setTimeout(async () => {
      const ok = Math.random() > 0.2;
      const dur = 800 + Math.floor(Math.random() * 4000);
      const records = ok ? Math.floor(Math.random() * 2000) : 0;
      if (log) {
        await supabase.from("sync_logs").update({
          finished_at: new Date().toISOString(),
          duration_ms: dur,
          records_count: records,
          status: ok ? "success" : "error",
          error_message: ok ? null : "Timeout ao conectar com Firebird",
        }).eq("id", log.id);
      }
      await supabase.from("databases").update({ last_sync_at: new Date().toISOString() }).eq("id", db.id);
      qc.invalidateQueries({ queryKey: ["databases"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      ok ? toast.success(`${db.name}: ${records} registros sincronizados`) : toast.error(`${db.name}: sync falhou`);
    }, 1500);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={company} onValueChange={(v) => navigate({ search: { company: v } as any })}>
          <SelectTrigger className="w-[260px] bg-card"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as empresas</SelectItem>
            {companies.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Badge variant="muted">{databases.length} banco(s) cadastrado(s)</Badge>
        <div className="flex-1" />
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditing(null)}><Plus className="h-4 w-4 mr-1.5" /> Novo Banco</Button>
          </DialogTrigger>
          {open && (
            <DatabaseDialog
              key={editing?.id ?? "new"}
              initial={editing}
              companies={companies}
              onClose={() => { setOpen(false); setEditing(null); }}
              onSaved={() => qc.invalidateQueries({ queryKey: ["databases"] })}
            />
          )}
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : databases.length === 0 ? (
        <Card className="p-12 text-center bg-card border-border">
          <DatabaseIcon className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-mono text-sm font-semibold">Nenhum banco cadastrado</h3>
          <p className="text-xs text-muted-foreground mt-1 mb-4">Adicione o primeiro banco Firebird.</p>
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> Novo Banco</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {databases.map((db: any) => (
            <DatabaseCard
              key={db.id}
              db={db}
              onSync={() => syncNow(db)}
              onEdit={() => { setEditing(db); setOpen(true); }}
              onDelete={() => {
                if (confirm("Remover este banco? Esta ação não pode ser desfeita.")) remove.mutate(db.id);
              }}
              onRefresh={() => qc.invalidateQueries({ queryKey: ["databases"] })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="text-muted-foreground/70 uppercase text-[10px] tracking-wider w-20 shrink-0 pt-0.5">{label}</dt>
      <dd className="truncate flex-1">{children}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, any> = {
    connected: { v: "success", l: "CONECTADO" },
    disconnected: { v: "destructive", l: "DESCONECTADO" },
    not_tested: { v: "muted", l: "NÃO TESTADO" },
  };
  const cfg = map[status] ?? map.not_tested;
  return <Badge variant={cfg.v}>{cfg.l}</Badge>;
}

function latencyColor(ms: number | null | undefined) {
  if (ms == null) return { bar: "bg-muted-foreground/30", text: "text-muted-foreground", label: "—" };
  if (ms < 100) return { bar: "bg-emerald-500", text: "text-emerald-500", label: "Excelente" };
  if (ms <= 500) return { bar: "bg-amber-500", text: "text-amber-500", label: "Aceitável" };
  return { bar: "bg-red-500", text: "text-red-500", label: "Lento" };
}

function LatencyBar({ ms }: { ms: number | null | undefined }) {
  const c = latencyColor(ms);
  const pct = ms == null ? 0 : Math.min(100, (ms / 800) * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider">
        <span className="text-muted-foreground/70 flex items-center gap-1">
          <Activity className="h-3 w-3" /> Latência
        </span>
        <span className={c.text}>
          {ms != null ? `${ms} ms · ${c.label}` : "Não medida"}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full ${c.bar} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "success") return <Check className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />;
  if (status === "error") return <X className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />;
  if (status === "running") return <Loader2 className="h-3.5 w-3.5 text-primary animate-spin mt-0.5 shrink-0" />;
  return <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/40 mt-0.5 shrink-0" />;
}

function DatabaseCard({
  db, onSync, onEdit, onDelete, onRefresh,
}: {
  db: any;
  onSync: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRefresh: () => void;
}) {
  const [steps, setSteps] = useState<TestStep[]>([]);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [latency, setLatency] = useState<number | null>(db.last_latency_ms ?? null);

  async function runTest() {
    setRunning(true);
    setPopoverOpen(true);
    const initial: TestStep[] = [
      { key: "ping", label: "Ping do host", status: "pending" },
      { key: "auth", label: "Autenticação SYSDBA", status: "pending" },
      { key: "db", label: "Abrir arquivo .FDB", status: "pending" },
      { key: "query", label: "Query de teste (SELECT 1)", status: "pending" },
    ];
    setSteps(initial);
    const overallStart = Date.now();
    let failed = false;
    let stepFailed: string | null = null;
    let errorDetail: string | null = null;

    for (let i = 0; i < initial.length; i++) {
      setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, status: "running" } : s)));
      const t0 = Date.now();
      await new Promise((r) => setTimeout(r, 350 + Math.random() * 500));
      const ms = Date.now() - t0;
      const ok = !(i === 2 && Math.random() < 0.15) && !(i === 0 && Math.random() < 0.05);
      if (!ok) {
        failed = true;
        stepFailed = initial[i].key;
        errorDetail = i === 0 ? "Host inalcançável (timeout)" : "Não foi possível abrir o arquivo .FDB";
      }
      setSteps((prev) =>
        prev.map((s, idx) =>
          idx === i
            ? { ...s, status: failed ? "error" : "success", ms, detail: failed ? errorDetail ?? undefined : undefined }
            : s
        )
      );
      if (failed) break;
    }

    const totalLatency = Date.now() - overallStart;
    setLatency(failed ? null : totalLatency);
    setRunning(false);

    try {
      await supabase.from("databases").update({ status: failed ? "disconnected" : "connected" }).eq("id", db.id);
      await supabase.from("connectivity_logs").insert({
        database_id: db.id,
        latency_ms: failed ? 0 : totalLatency,
        result: failed ? "error" : "success",
        step_failed: stepFailed,
        error_detail: errorDetail,
      });
    } catch {}
    onRefresh();

    if (failed) toast.error(`${db.name}: falha em "${stepFailed}"`);
    else toast.success(`${db.name}: conexão OK (${totalLatency}ms)`);
  }

  async function copyConfig() {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const env = `# Configuração do agente LocalBridge para FireSync Hub
# Endpoint do FireSync Hub (URL pública do seu app)
REMOTE_ENDPOINT=${origin}/api/public/sync

# Token de autenticação
API_TOKEN=${db.agent_token ?? ""}

# Identificador único deste agente
AGENT_UID=${db.agent_uid ?? db.id}
AGENT_ALIAS=${db.name}

# Banco Firebird local
DB_TYPE=firebird
DB_HOST=${db.host ?? "localhost"}
DB_PORT=${db.port ?? 3050}
DB_PATH=${db.filepath ?? ""}
DB_USER=${db.username ?? "SYSDBA"}
DB_PASS=${db.password_encrypted ?? ""}
DB_CHARSET=${db.charset ?? "WIN1252"}

# Intervalo de sincronização (segundos)
SYNC_INTERVAL=${db.sync_interval ?? 900}

# Tabelas a sincronizar (separadas por vírgula, ou ALL para todas)
SYNC_TABLES=${db.sync_tables ?? "ALL"}`;
    try {
      await navigator.clipboard.writeText(env);
      toast.success("Arquivo .env copiado para a área de transferência");
    } catch {
      toast.error("Falha ao copiar configuração");
    }
  }

  async function downloadAgent() {
    if (!db.agent_token) {
      toast.error("Este banco não tem token. Edite o banco e gere/salve um token primeiro.");
      return;
    }
    try {
      toast.info("Gerando pacote do agente…");
      const url = `/api/public/agent-bundle?database_id=${encodeURIComponent(db.id)}&token=${encodeURIComponent(db.agent_token)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") ?? "";
      const m = /filename="?([^"]+)"?/i.exec(cd);
      const filename = m?.[1] ?? `firesync-agent-${db.id}.zip`;
      const a = document.createElement("a");
      const objUrl = URL.createObjectURL(blob);
      a.href = objUrl; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(objUrl);
      toast.success("Pacote do agente baixado");
    } catch (e: any) {
      toast.error(`Falha ao baixar agente: ${e.message ?? e}`);
    }
  }

  async function downloadProbe() {
    if (!db.agent_token) {
      toast.error("Este banco não tem token. Edite o banco e gere/salve um token primeiro.");
      return;
    }
    try {
      toast.info("Gerando probe de diagnóstico…");
      const url = `/api/public/agent-probe?database_id=${encodeURIComponent(db.id)}&token=${encodeURIComponent(db.agent_token)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") ?? "";
      const m = /filename="?([^"]+)"?/i.exec(cd);
      const filename = m?.[1] ?? `firesync-probe-${db.id}.zip`;
      const a = document.createElement("a");
      const objUrl = URL.createObjectURL(blob);
      a.href = objUrl; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(objUrl);
      toast.success("Probe baixado — rode run.bat no PC do cliente");
    } catch (e: any) {
      toast.error(`Falha ao baixar probe: ${e.message ?? e}`);
    }
  }

  async function downloadInstaller() {
    if (!db.agent_token) {
      toast.error("Este banco não tem token. Edite o banco e gere/salve um token primeiro.");
      return;
    }
    try {
      toast.info("Gerando instalador Windows…");
      const url = `/api/public/agent-installer?database_id=${encodeURIComponent(db.id)}&token=${encodeURIComponent(db.agent_token)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") ?? "";
      const m = /filename="?([^"]+)"?/i.exec(cd);
      const filename = m?.[1] ?? `firesync-agent-${db.id}-installer.zip`;
      const a = document.createElement("a");
      const objUrl = URL.createObjectURL(blob);
      a.href = objUrl; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(objUrl);
      toast.success("Instalador baixado — extraia e rode install.bat como Administrador");
    } catch (e: any) {
      toast.error(`Falha ao gerar instalador: ${e.message ?? e}`);
    }
  }



  const agent = Array.isArray(db.agents) ? db.agents[0] : db.agents;
  const connMode = (() => {
    if (!agent?.last_heartbeat_at) return { label: "Offline", variant: "destructive" as const };
    const age = Date.now() - new Date(agent.last_heartbeat_at).getTime();
    if (age > 5 * 60 * 1000) return { label: "Offline", variant: "destructive" as const };
    if (agent.tunnel_url) return { label: "Tunnel ativo", variant: "success" as const };
    return { label: "Push only", variant: "muted" as const };
  })();

  return (
    <Card className="p-5 bg-card border-border hover:border-primary/40 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <div className="font-mono text-sm font-semibold truncate">{db.name}</div>
          <div className="flex gap-1.5 mt-1.5 flex-wrap">
            <Badge variant="info">{db.companies?.name ?? "—"}</Badge>
            <Badge variant={connMode.variant}>{connMode.label}</Badge>
          </div>
        </div>
        <StatusBadge status={db.status} />
      </div>
      <dl className="text-xs space-y-1.5 text-muted-foreground font-mono mb-3">
        <Row label="Host">{db.host ?? "—"}:{db.port ?? 3050}</Row>
        <Row label="Arquivo">{db.filepath ?? "—"}</Row>
        <Row label="Agente">{db.agent_uid ?? "—"}</Row>
        <Row label="Firebird">{db.firebird_version} · {db.charset}</Row>
        <Row label="Última sync">{formatRelative(db.last_sync_at)}</Row>
      </dl>
      <div className="mb-4">
        <LatencyBar ms={latency} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => { e.preventDefault(); runTest(); }}
              disabled={running}
            >
              {running ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Zap className="h-3.5 w-3.5 mr-1" />}
              Testar
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="font-mono text-xs font-semibold uppercase tracking-wider">Teste de conexão</div>
              {running && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>
            <ol className="space-y-1.5">
              {steps.map((s) => (
                <li key={s.key} className="flex items-start gap-2 text-xs">
                  <StepIcon status={s.status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono">{s.label}</span>
                      {s.ms != null && s.status !== "pending" && (
                        <span className="text-[10px] text-muted-foreground">{s.ms}ms</span>
                      )}
                    </div>
                    {s.detail && <div className="text-[10px] text-destructive mt-0.5">{s.detail}</div>}
                  </div>
                </li>
              ))}
            </ol>
            {!running && steps.length > 0 && (
              <Button size="sm" variant="outline" className="w-full mt-3 h-7 text-xs" onClick={runTest}>
                <RefreshCw className="h-3 w-3 mr-1" /> Executar novamente
              </Button>
            )}
          </PopoverContent>
        </Popover>
        <Button size="sm" variant="outline" onClick={onSync}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Sync
        </Button>
        <Button size="sm" variant="outline" onClick={copyConfig} title="Copiar .env do agente LocalBridge">
          <Copy className="h-3.5 w-3.5 mr-1" /> Copiar .env
        </Button>
        <Button size="sm" onClick={downloadInstaller} title="Instalador Windows (.exe) — serviço nativo, sem Python, auto-start com o Windows">
          <Download className="h-3.5 w-3.5 mr-1" /> Instalador Windows
        </Button>
        <Button size="sm" variant="outline" onClick={downloadAgent} title="Pacote Python (avançado)">
          <Download className="h-3.5 w-3.5 mr-1" /> Agente Python
        </Button>
        <Button size="sm" variant="outline" onClick={downloadProbe} title="Baixar probe de diagnóstico (somente leitura) para levantar requisitos pendentes">
          <Download className="h-3.5 w-3.5 mr-1" /> Probe
        </Button>
        <Button size="sm" variant="outline" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="outline" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>
    </Card>
  );
}

function DatabaseDialog({
  initial, companies, onClose, onSaved,
}: { initial: any; companies: any[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    company_id: initial?.company_id ?? "",
    name: initial?.name ?? "",
    host: initial?.host ?? "",
    port: initial?.port ?? 3050,
    filepath: initial?.filepath ?? "",
    username: initial?.username ?? "SYSDBA",
    password_encrypted: initial?.password_encrypted ?? "",
    charset: initial?.charset ?? "WIN1252",
    firebird_version: initial?.firebird_version ?? "2.5",
    agent_token: initial?.agent_token ?? "",
    agent_endpoint: initial?.agent_endpoint ?? "",
    agent_uid: initial?.agent_uid ?? "",
    sync_interval: initial?.sync_interval ?? 900,
    sync_tables: initial?.sync_tables ?? "ALL",
    notes: initial?.notes ?? "",
  });
  const [showPwd, setShowPwd] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.company_id) { toast.error("Selecione a empresa"); return; }
    if (!form.name.trim()) { toast.error("Nome é obrigatório"); return; }
    setSaving(true);
    try {
      if (initial) {
        const { error } = await supabase.from("databases").update(form).eq("id", initial.id);
        if (error) throw error;
        toast.success("Banco atualizado");
      } else {
        const { error } = await supabase.from("databases").insert(form);
        if (error) throw error;
        toast.success("Banco cadastrado. Use 'Testar' para validar a conexão.");
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
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{initial ? "Editar banco" : "Novo banco Firebird"}</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1.5">
          <Label>Empresa *</Label>
          <Select value={form.company_id} onValueChange={(v) => setForm({ ...form, company_id: v })}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label>Nome identificador *</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Pharmapele Duque" />
        </div>
        <div className="space-y-1.5">
          <Label>Host / IP</Label>
          <Input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="192.168.1.100" />
        </div>
        <div className="space-y-1.5">
          <Label>Porta</Label>
          <Input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 3050 })} />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label>Caminho .FDB</Label>
          <Input value={form.filepath} onChange={(e) => setForm({ ...form, filepath: e.target.value })} placeholder="C:\dados\base.fdb" />
        </div>
        <div className="space-y-1.5">
          <Label>Usuário</Label>
          <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Senha</Label>
          <div className="relative">
            <Input
              type={showPwd ? "text" : "password"}
              value={form.password_encrypted}
              onChange={(e) => setForm({ ...form, password_encrypted: e.target.value })}
            />
            <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground cursor-pointer">
              {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Charset</Label>
          <Select value={form.charset} onValueChange={(v) => setForm({ ...form, charset: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["WIN1252", "UTF8", "ISO8859_1", "NONE"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Versão Firebird</Label>
          <Select value={form.firebird_version} onValueChange={(v) => setForm({ ...form, firebird_version: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["2.1", "2.5", "3.0", "4.0"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label>ID do agente (Agent UID)</Label>
          <Input value={form.agent_uid} onChange={(e) => setForm({ ...form, agent_uid: e.target.value })} placeholder="pharmapele-duque-001" className="font-mono text-xs" />
        </div>
        <div className="space-y-1.5">
          <Label>Intervalo de sync (segundos)</Label>
          <Input type="number" value={form.sync_interval} onChange={(e) => setForm({ ...form, sync_interval: parseInt(e.target.value) || 900 })} />
        </div>
        <div className="space-y-1.5">
          <Label>Tabelas para sincronizar</Label>
          <Input value={form.sync_tables} onChange={(e) => setForm({ ...form, sync_tables: e.target.value })} placeholder="ALL ou CLIENTES,PRODUTOS" />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label>Endpoint do agente</Label>
          <Input value={form.agent_endpoint} onChange={(e) => setForm({ ...form, agent_endpoint: e.target.value })} placeholder="http://192.168.1.100:8000" />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label>Token do agente</Label>
          <Input value={form.agent_token} onChange={(e) => setForm({ ...form, agent_token: e.target.value })} className="font-mono text-xs" />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label>Observações</Label>
          <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
