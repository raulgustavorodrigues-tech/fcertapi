import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listApiCatalog, saveApiCatalog } from "@/lib/api-keys.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plug, Plus, Pencil } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/apis")({
  head: () => ({
    meta: [
      { title: "APIs — CONECTA API" },
      { name: "description", content: "Catálogo de APIs e empresas habilitadas." },
      { property: "og:title", content: "APIs — CONECTA API" },
      { property: "og:description", content: "Catálogo de APIs e empresas habilitadas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ApisPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">Erro: {String((error as Error).message)}</div>
  ),
});

const STATUS: Record<string, { label: string; variant: any }> = {
  active: { label: "ATIVA", variant: "success" },
  testing: { label: "EM TESTE", variant: "muted" },
  disabled: { label: "DESATIVADA", variant: "muted" },
};

const empty = { slug: "", name: "", description: "", path: "/api/v1/", scope: "", status: "testing" };

function ApisPage() {
  const qc = useQueryClient();
  const list = useServerFn(listApiCatalog);
  const save = useServerFn(saveApiCatalog);
  const [edit, setEdit] = useState<any | null>(null);
  const { data: apis = [], isLoading, error } = useQuery({ queryKey: ["api-catalog"], queryFn: () => list() });

  const saveMut = useMutation({
    mutationFn: (v: any) => save({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-catalog"] });
      setEdit(null);
      toast.success("API salva");
    },
    onError: (e: any) => toast.error(e?.message ?? "Dados inválidos"),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Plug className="h-5 w-5 text-primary" /> APIs
          </h1>
          <p className="text-sm text-muted-foreground">
            Catálogo de APIs. Habilite cada uma por empresa no botão "APIs" em Empresas.
          </p>
        </div>
        <Button onClick={() => setEdit({ ...empty })}>
          <Plus className="h-4 w-4 mr-1.5" /> Nova API
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">Somente administradores acessam este módulo.</p>}
      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      <div className="grid gap-4 md:grid-cols-2">
        {apis.map((a: any) => (
          <Card key={a.id} className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <div className="font-medium flex-1">{a.name}</div>
              <Badge variant={STATUS[a.status]?.variant}>{STATUS[a.status]?.label ?? a.status}</Badge>
              <Button size="sm" variant="outline" onClick={() => setEdit({ ...a })}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
            {a.description && <p className="text-xs text-muted-foreground">{a.description}</p>}
            <div className="font-mono text-xs">{a.path}</div>
            <div className="text-xs text-muted-foreground">Permissão: <code>{a.scope}</code></div>
            <div className="text-xs">
              <span className="text-muted-foreground">Empresas ({a.companies.length}): </span>
              {a.companies.length ? a.companies.join(", ") : "nenhuma"}
            </div>
          </Card>
        ))}
      </div>

      {edit && (
        <Dialog open onOpenChange={(v) => !v && setEdit(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{edit.id ? "Editar API" : "Nova API"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {([
                ["name", "Nome"], ["slug", "Identificador (ex.: pedidos)"],
                ["path", "Endereço (ex.: /api/v1/pedidos)"], ["scope", "Permissão (ex.: pedidos:read)"],
              ] as const).map(([k, l]) => (
                <div key={k} className="space-y-1">
                  <Label className="text-xs">{l}</Label>
                  <Input
                    value={edit[k]}
                    disabled={!!edit.id && k === "slug"}
                    onChange={(e) => setEdit({ ...edit, [k]: e.target.value })}
                  />
                </div>
              ))}
              <div className="space-y-1">
                <Label className="text-xs">Descrição</Label>
                <Textarea value={edit.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Situação</Label>
                <Select value={edit.status} onValueChange={(v) => setEdit({ ...edit, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Ativa</SelectItem>
                    <SelectItem value="testing">Em teste</SelectItem>
                    <SelectItem value="disabled">Desativada (bloqueia todas as empresas)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                Cadastrar aqui controla quem pode usar a API; o endereço precisa já existir no sistema para responder.
              </p>
              <Button
                className="w-full"
                disabled={saveMut.isPending}
                onClick={() =>
                  saveMut.mutate({
                    id: edit.id, slug: edit.slug, name: edit.name, description: edit.description ?? "",
                    path: edit.path, scope: edit.scope, status: edit.status,
                  })
                }
              >
                Salvar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
