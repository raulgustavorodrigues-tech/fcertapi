import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table as TableIcon, Search, Key, Columns3, Eye } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/tabelas")({ component: Page });

// Mock schema introspection (representativo)
const MOCK_SCHEMA = [
  { name: "CLIENTES", rows: 12450, columns: [
    { name: "ID", type: "INTEGER", pk: true, nullable: false },
    { name: "NOME", type: "VARCHAR(120)", pk: false, nullable: false },
    { name: "CPF_CNPJ", type: "VARCHAR(18)", pk: false, nullable: true },
    { name: "EMAIL", type: "VARCHAR(80)", pk: false, nullable: true },
    { name: "TELEFONE", type: "VARCHAR(20)", pk: false, nullable: true },
    { name: "DATA_CADASTRO", type: "TIMESTAMP", pk: false, nullable: false },
    { name: "ATIVO", type: "CHAR(1)", pk: false, nullable: false },
  ]},
  { name: "PRODUTOS", rows: 3287, columns: [
    { name: "ID", type: "INTEGER", pk: true, nullable: false },
    { name: "CODIGO", type: "VARCHAR(20)", pk: false, nullable: false },
    { name: "DESCRICAO", type: "VARCHAR(200)", pk: false, nullable: false },
    { name: "PRECO_VENDA", type: "NUMERIC(15,2)", pk: false, nullable: false },
    { name: "ESTOQUE", type: "NUMERIC(10,3)", pk: false, nullable: false },
    { name: "ID_CATEGORIA", type: "INTEGER", pk: false, nullable: true },
  ]},
  { name: "VENDAS", rows: 89234, columns: [
    { name: "ID", type: "INTEGER", pk: true, nullable: false },
    { name: "DATA", type: "DATE", pk: false, nullable: false },
    { name: "ID_CLIENTE", type: "INTEGER", pk: false, nullable: false },
    { name: "TOTAL", type: "NUMERIC(15,2)", pk: false, nullable: false },
    { name: "STATUS", type: "VARCHAR(20)", pk: false, nullable: false },
    { name: "OBSERVACAO", type: "BLOB SUB_TYPE TEXT", pk: false, nullable: true },
  ]},
  { name: "VENDA_ITENS", rows: 245890, columns: [
    { name: "ID", type: "INTEGER", pk: true, nullable: false },
    { name: "ID_VENDA", type: "INTEGER", pk: false, nullable: false },
    { name: "ID_PRODUTO", type: "INTEGER", pk: false, nullable: false },
    { name: "QUANTIDADE", type: "NUMERIC(10,3)", pk: false, nullable: false },
    { name: "PRECO_UNIT", type: "NUMERIC(15,2)", pk: false, nullable: false },
  ]},
  { name: "FORNECEDORES", rows: 542, columns: [
    { name: "ID", type: "INTEGER", pk: true, nullable: false },
    { name: "RAZAO_SOCIAL", type: "VARCHAR(150)", pk: false, nullable: false },
    { name: "CNPJ", type: "VARCHAR(18)", pk: false, nullable: false },
    { name: "ATIVO", type: "CHAR(1)", pk: false, nullable: false },
  ]},
  { name: "CATEGORIAS", rows: 87, columns: [
    { name: "ID", type: "INTEGER", pk: true, nullable: false },
    { name: "DESCRICAO", type: "VARCHAR(80)", pk: false, nullable: false },
  ]},
  { name: "USUARIOS", rows: 24, columns: [
    { name: "ID", type: "INTEGER", pk: true, nullable: false },
    { name: "LOGIN", type: "VARCHAR(40)", pk: false, nullable: false },
    { name: "NOME", type: "VARCHAR(80)", pk: false, nullable: false },
    { name: "PERFIL", type: "VARCHAR(20)", pk: false, nullable: false },
  ]},
  { name: "MOVIMENTO_CAIXA", rows: 18293, columns: [
    { name: "ID", type: "INTEGER", pk: true, nullable: false },
    { name: "DATA", type: "TIMESTAMP", pk: false, nullable: false },
    { name: "TIPO", type: "CHAR(1)", pk: false, nullable: false },
    { name: "VALOR", type: "NUMERIC(15,2)", pk: false, nullable: false },
    { name: "HISTORICO", type: "VARCHAR(200)", pk: false, nullable: true },
  ]},
];

function generatePreviewRows(table: typeof MOCK_SCHEMA[0]) {
  return Array.from({ length: 8 }).map((_, i) => {
    const row: Record<string, any> = {};
    table.columns.forEach((col) => {
      if (col.pk) row[col.name] = 1000 + i;
      else if (col.type.startsWith("VARCHAR") || col.type.startsWith("CHAR")) row[col.name] = `${col.name.toLowerCase()}_${i + 1}`;
      else if (col.type.startsWith("NUMERIC")) row[col.name] = (Math.random() * 1000).toFixed(2);
      else if (col.type === "INTEGER") row[col.name] = Math.floor(Math.random() * 9999);
      else if (col.type.includes("DATE") || col.type.includes("TIMESTAMP")) row[col.name] = new Date(Date.now() - i * 86400000).toISOString().split("T")[0];
      else row[col.name] = "—";
    });
    return row;
  });
}

function Page() {
  const [databaseId, setDatabaseId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<typeof MOCK_SCHEMA[0] | null>(null);
  const [previewRows, setPreviewRows] = useState<any[] | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const { data: databases = [] } = useQuery({
    queryKey: ["databases-list-schema"],
    queryFn: async () => {
      const { data } = await supabase.from("databases").select("id, name, status, companies(name)").order("name");
      return data ?? [];
    },
  });

  const selectedDb = databases.find((d: any) => d.id === databaseId);

  const filteredTables = useMemo(() => {
    if (!databaseId) return [];
    return MOCK_SCHEMA.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()));
  }, [databaseId, search]);

  function loadPreview(table: typeof MOCK_SCHEMA[0]) {
    setSelected(table);
    setPreviewRows(null);
    setLoadingPreview(true);
    setTimeout(() => {
      setPreviewRows(generatePreviewRows(table));
      setLoadingPreview(false);
      toast.success(`${table.name}: 8 registros carregados`);
    }, 600);
  }

  return (
    <div className="space-y-5">
      <Card className="p-4 bg-card border-border">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={databaseId} onValueChange={(v) => { setDatabaseId(v); setSelected(null); setPreviewRows(null); }}>
            <SelectTrigger className="w-[320px]"><SelectValue placeholder="Selecione um banco para introspecção" /></SelectTrigger>
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
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filtrar tabelas…" className="pl-8 font-mono text-xs" />
            </div>
          )}
        </div>
      </Card>

      {!databaseId ? (
        <Card className="p-12 text-center bg-card border-border">
          <TableIcon className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-mono text-sm font-semibold">Selecione um banco</h3>
          <p className="text-xs text-muted-foreground mt-1">Escolha um banco cadastrado para listar as tabelas via agente.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Card className="lg:col-span-1 p-4 bg-card border-border">
            <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Tabelas ({filteredTables.length})
            </h3>
            <div className="space-y-1 max-h-[600px] overflow-y-auto">
              {filteredTables.map((t) => (
                <button
                  key={t.name}
                  onClick={() => { setSelected(t); setPreviewRows(null); }}
                  className={`w-full text-left p-2.5 rounded border transition-colors font-mono text-xs cursor-pointer ${
                    selected?.name === t.name ? "border-primary bg-primary/10 text-primary" : "border-border bg-background/40 hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold truncate">{t.name}</span>
                    <span className="text-[10px] text-muted-foreground">{t.rows.toLocaleString("pt-BR")}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{t.columns.length} colunas</div>
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
                      {selected.rows.toLocaleString("pt-BR")} registros · {selected.columns.length} colunas
                    </div>
                  </div>
                  <Button size="sm" onClick={() => loadPreview(selected)} disabled={loadingPreview}>
                    <Eye className="h-3.5 w-3.5 mr-1.5" /> {loadingPreview ? "Carregando…" : "Preview (10 linhas)"}
                  </Button>
                </div>

                <div>
                  <h4 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Colunas</h4>
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
                        {selected.columns.map((c) => (
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

                {previewRows && (
                  <div>
                    <h4 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Preview de dados</h4>
                    <div className="overflow-x-auto border border-border rounded">
                      <table className="w-full text-xs font-mono">
                        <thead className="bg-background/80 border-b border-border">
                          <tr>{selected.columns.map((c) => <th key={c.name} className="text-left px-3 py-2 text-primary uppercase text-[10px]">{c.name}</th>)}</tr>
                        </thead>
                        <tbody>
                          {previewRows.map((r, i) => (
                            <tr key={i} className="border-b border-border/50 hover:bg-background/40">
                              {selected.columns.map((c) => <td key={c.name} className="px-3 py-1.5 truncate max-w-[160px]">{String(r[c.name])}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
