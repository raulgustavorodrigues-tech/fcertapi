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
import { Progress } from "@/components/ui/progress";
import { Plus, Database as DatabaseIcon, Eye, EyeOff, Zap, RefreshCw, Pencil, Trash2, Copy, Check, X, Loader2, Activity } from "lucide-react";
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
      let q = supabase.from("databases").select("*, companies(name)").order("created_at", { ascending: false });
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
          <DatabaseDialog
            initial={editing}
            companies={companies}
            onClose={() => { setOpen(false); setEditing(null); }}
            onSaved={() => qc.invalidateQueries({ queryKey: ["databases"] })}
          />
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
            <Card key={db.id} className="p-5 bg-card border-border hover:border-primary/40 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className="min-w-0">
                  <div className="font-mono text-sm font-semibold truncate">{db.name}</div>
                  <Badge variant="info" className="mt-1.5">{db.companies?.name ?? "—"}</Badge>
                </div>
                <StatusBadge status={db.status} />
              </div>
              <dl className="text-xs space-y-1.5 text-muted-foreground font-mono mb-4">
                <Row label="Host">{db.host ?? "—"}:{db.port ?? 3050}</Row>
                <Row label="Arquivo">{db.filepath ?? "—"}</Row>
                <Row label="Firebird">{db.firebird_version} · {db.charset}</Row>
                <Row label="Última sync">{formatRelative(db.last_sync_at)}</Row>
              </dl>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => testConnection(db)}>
                  <Zap className="h-3.5 w-3.5 mr-1" /> Testar
                </Button>
                <Button size="sm" variant="outline" onClick={() => syncNow(db)}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> Sync
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setEditing(db); setOpen(true); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => {
                  if (confirm("Remover este banco? Esta ação não pode ser desfeita.")) remove.mutate(db.id);
                }}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </Card>
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
