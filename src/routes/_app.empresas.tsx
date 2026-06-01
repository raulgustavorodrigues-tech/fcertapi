import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Building2, Database as DatabaseIcon, Pencil, Power } from "lucide-react";
import { toast } from "sonner";
import { formatCNPJ, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_app/empresas")({
  component: EmpresasPage,
});

type Company = {
  id: string;
  name: string;
  cnpj: string | null;
  razao_social: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
};

function EmpresasPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [editing, setEditing] = useState<Company | null>(null);
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Company | null>(null);

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("*, databases(count)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const toggleActive = useMutation({
    mutationFn: async (c: Company) => {
      const { error } = await supabase
        .from("companies")
        .update({ active: !c.active })
        .eq("id", c.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["companies"] });
      toast.success("Status atualizado");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteCompany = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("companies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["companies"] });
      toast.success("Empresa removida");
      setToDelete(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = companies.filter((c: any) => {
    if (filter === "active" && !c.active) return false;
    if (filter === "inactive" && c.active) return false;
    if (search) {
      const q = search.toLowerCase();
      return c.name.toLowerCase().includes(q) || (c.cnpj ?? "").includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou CNPJ"
            className="pl-9 bg-card"
          />
        </div>
        <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
          <SelectTrigger className="w-[180px] bg-card"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="inactive">Inativos</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditing(null)}>
              <Plus className="h-4 w-4 mr-1.5" /> Nova Empresa
            </Button>
          </DialogTrigger>
          <CompanyDialog
            initial={editing}
            onClose={() => { setOpen(false); setEditing(null); }}
            onSaved={() => qc.invalidateQueries({ queryKey: ["companies"] })}
          />
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center bg-card border-border">
          <Building2 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-mono text-sm font-semibold">Nenhuma empresa</h3>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            Cadastre a primeira empresa para começar.
          </p>
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="h-4 w-4 mr-1.5" /> Nova Empresa
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((c: any) => {
            const initials = c.name.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();
            const dbCount = c.databases?.[0]?.count ?? 0;
            return (
              <Card key={c.id} className="p-5 bg-card border-border hover:border-primary/40 transition-colors">
                <div className="flex items-start gap-3 mb-4">
                  <div className="h-11 w-11 rounded-md bg-primary/15 border border-primary/30 flex items-center justify-center font-mono text-sm text-primary shrink-0">
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{c.name}</div>
                    <div className="text-xs text-muted-foreground font-mono truncate">{c.cnpj ?? "—"}</div>
                  </div>
                  <Badge variant={c.active ? "success" : "muted"}>
                    {c.active ? "ATIVO" : "INATIVO"}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground space-y-1 mb-4">
                  <div className="flex items-center gap-1.5">
                    <DatabaseIcon className="h-3.5 w-3.5" /> {dbCount} banco(s) vinculado(s)
                  </div>
                  <div>Cadastrada em {formatDateTime(c.created_at)}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setEditing(c); setOpen(true); }}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/bancos" search={{ company: c.id } as any}>
                      <DatabaseIcon className="h-3.5 w-3.5 mr-1" /> Ver Bancos
                    </Link>
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => toggleActive.mutate(c)}>
                    <Power className="h-3.5 w-3.5 mr-1" /> {c.active ? "Desativar" : "Ativar"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover empresa?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita e removerá também os bancos vinculados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => toDelete && deleteCompany.mutate(toDelete.id)}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CompanyDialog({
  initial, onClose, onSaved,
}: { initial: Company | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    cnpj: initial?.cnpj ?? "",
    razao_social: initial?.razao_social ?? "",
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    city: initial?.city ?? "",
    state: initial?.state ?? "",
    notes: initial?.notes ?? "",
    active: initial?.active ?? true,
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.name.trim()) { toast.error("Nome é obrigatório"); return; }
    setSaving(true);
    try {
      if (initial) {
        const { error } = await supabase.from("companies").update(form).eq("id", initial.id);
        if (error) throw error;
        toast.success("Empresa atualizada");
      } else {
        const { error } = await supabase.from("companies").insert(form);
        if (error) throw error;
        toast.success("Empresa cadastrada");
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
    <DialogContent className="max-w-xl">
      <DialogHeader>
        <DialogTitle>{initial ? "Editar empresa" : "Nova empresa"}</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1.5">
          <Label>Nome *</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>CNPJ</Label>
          <Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: formatCNPJ(e.target.value) })} />
        </div>
        <div className="space-y-1.5">
          <Label>Razão social</Label>
          <Input value={form.razao_social} onChange={(e) => setForm({ ...form, razao_social: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>E-mail</Label>
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Telefone</Label>
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Cidade</Label>
          <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Estado</Label>
          <Input maxLength={2} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })} />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label>Observações</Label>
          <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div className="col-span-2 flex items-center justify-between border-t border-border pt-3">
          <Label className="cursor-pointer">Empresa ativa</Label>
          <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
