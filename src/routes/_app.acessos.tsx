import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  listUsers, grantRole, revokeRole,
  linkUserCompany, unlinkUserCompany,
} from "@/lib/access.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ShieldCheck, ShieldOff, Building2, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_app/acessos")({
  component: AcessosPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">
      Erro ao carregar acessos: {String((error as Error).message)}
    </div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Página não encontrada.</div>,
});

function AcessosPage() {
  const qc = useQueryClient();
  const fetchUsers = useServerFn(listUsers);
  const doGrant = useServerFn(grantRole);
  const doRevoke = useServerFn(revokeRole);
  const doLink = useServerFn(linkUserCompany);
  const doUnlink = useServerFn(unlinkUserCompany);

  const usersQ = useQuery({
    queryKey: ["access", "users"],
    queryFn: () => fetchUsers(),
    retry: false,
  });

  const companiesQ = useQuery({
    queryKey: ["access", "companies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const [pickCompany, setPickCompany] = useState<Record<string, string>>({});

  const invalidate = () => qc.invalidateQueries({ queryKey: ["access", "users"] });

  const grantM   = useMutation({ mutationFn: (v: any) => doGrant({ data: v }),   onSuccess: () => { toast.success("Papel concedido"); invalidate(); }, onError: (e: any) => toast.error(String(e?.message ?? e)) });
  const revokeM  = useMutation({ mutationFn: (v: any) => doRevoke({ data: v }),  onSuccess: () => { toast.success("Papel removido");  invalidate(); }, onError: (e: any) => toast.error(String(e?.message ?? e)) });
  const linkM    = useMutation({ mutationFn: (v: any) => doLink({ data: v }),    onSuccess: () => { toast.success("Empresa vinculada"); invalidate(); }, onError: (e: any) => toast.error(String(e?.message ?? e)) });
  const unlinkM  = useMutation({ mutationFn: (v: any) => doUnlink({ data: v }),  onSuccess: () => { toast.success("Vínculo removido"); invalidate(); }, onError: (e: any) => toast.error(String(e?.message ?? e)) });

  if (usersQ.isError) {
    return (
      <div className="p-6 space-y-2">
        <h1 className="font-mono text-xl font-semibold">Acessos</h1>
        <Card className="p-4 text-sm text-destructive">
          Você precisa ser <b>administrador</b> para acessar esta página.
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="font-mono text-xl font-semibold flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" /> Acessos
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie papéis e o vínculo entre usuários e empresas.
          Apenas administradores enxergam esta tela.
        </p>
      </div>

      {usersQ.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-24" /><Skeleton className="h-24" />
        </div>
      ) : (
        <div className="space-y-4">
          {(usersQ.data ?? []).map((u) => {
            const isAdmin = u.roles.includes("admin");
            const availableCompanies = (companiesQ.data ?? []).filter(
              (c) => !u.companies.some((uc) => uc.company_id === c.id),
            );
            const pending = pickCompany[u.id] ?? "";

            return (
              <Card key={u.id} className="p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-medium">{u.email || "(sem email)"}</div>
                    <div className="text-xs text-muted-foreground font-mono">{u.id}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Criado {formatDateTime(u.created_at)}
                      {u.last_sign_in_at && ` · último acesso ${formatDateTime(u.last_sign_in_at)}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isAdmin ? (
                      <Badge className="bg-primary/15 text-primary hover:bg-primary/15">admin</Badge>
                    ) : (
                      <Badge variant="secondary">user</Badge>
                    )}
                    {isAdmin ? (
                      <Button
                        size="sm" variant="outline"
                        onClick={() => revokeM.mutate({ user_id: u.id, role: "admin" })}
                        disabled={revokeM.isPending}
                      >
                        <ShieldOff className="h-3.5 w-3.5 mr-1" /> Rebaixar
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => grantM.mutate({ user_id: u.id, role: "admin" })}
                        disabled={grantM.isPending}
                      >
                        <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Promover a admin
                      </Button>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t">
                  <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5" /> Empresas com acesso
                    {isAdmin && <span className="text-[10px]">(admin vê todas por padrão)</span>}
                  </div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {u.companies.length === 0 && (
                      <span className="text-xs text-muted-foreground">Nenhuma empresa vinculada.</span>
                    )}
                    {u.companies.map((c) => (
                      <Badge key={c.company_id} variant="outline" className="gap-1 pr-1">
                        {c.name}
                        <button
                          className="hover:text-destructive rounded p-0.5"
                          onClick={() => unlinkM.mutate({ user_id: u.id, company_id: c.company_id })}
                          disabled={unlinkM.isPending}
                          aria-label="Remover vínculo"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2 items-center">
                    <Select
                      value={pending}
                      onValueChange={(v) => setPickCompany((p) => ({ ...p, [u.id]: v }))}
                    >
                      <SelectTrigger className="h-8 max-w-xs">
                        <SelectValue placeholder="Selecionar empresa…" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableCompanies.length === 0 && (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">
                            Sem empresas disponíveis.
                          </div>
                        )}
                        {availableCompanies.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm" variant="outline"
                      disabled={!pending || linkM.isPending}
                      onClick={() => {
                        linkM.mutate({ user_id: u.id, company_id: pending });
                        setPickCompany((p) => ({ ...p, [u.id]: "" }));
                      }}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Vincular
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
