import { useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { Plus, Trash2, Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { enqueueCommand, awaitCommandResult } from "@/lib/commands";

const FB_TYPES = [
  "INTEGER", "BIGINT", "SMALLINT", "DOUBLE PRECISION", "NUMERIC(15,2)",
  "VARCHAR(60)", "VARCHAR(120)", "VARCHAR(200)", "CHAR(1)",
  "DATE", "TIME", "TIMESTAMP", "BLOB SUB_TYPE TEXT", "BLOB",
];

type ColDef = { name: string; type: string; nullable: boolean; pk: boolean; defaultVal: string };

function emptyCol(): ColDef {
  return { name: "", type: "VARCHAR(60)", nullable: true, pk: false, defaultVal: "" };
}

function buildCreateSQL(tableName: string, cols: ColDef[]): string {
  const lines = cols.filter((c) => c.name.trim()).map((c) => {
    const parts = [`"${c.name.toUpperCase()}"`, c.type];
    if (c.defaultVal.trim()) parts.push(`DEFAULT ${c.defaultVal.trim()}`);
    if (!c.nullable) parts.push("NOT NULL");
    return "  " + parts.join(" ");
  });
  const pks = cols.filter((c) => c.pk && c.name.trim()).map((c) => `"${c.name.toUpperCase()}"`);
  if (pks.length) lines.push(`  PRIMARY KEY (${pks.join(", ")})`);
  return `CREATE TABLE "${tableName.toUpperCase()}" (\n${lines.join(",\n")}\n)`;
}

type Mode = "create" | "alter";

export function SchemaEditorDialog({
  open, onOpenChange, databaseId, mode, table, onApplied,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  databaseId: string;
  mode: Mode;
  table?: { name: string; columns?: { name: string; type: string }[] } | null;
  onApplied?: () => void;
}) {
  // CREATE state
  const [tableName, setTableName] = useState("");
  const [cols, setCols] = useState<ColDef[]>([
    { name: "ID", type: "INTEGER", nullable: false, pk: true, defaultVal: "" },
    emptyCol(),
  ]);

  // ALTER state
  const [alterTab, setAlterTab] = useState<"add" | "drop" | "rename" | "raw">("add");
  const [newCol, setNewCol] = useState<ColDef>(emptyCol());
  const [dropColName, setDropColName] = useState("");
  const [renameFrom, setRenameFrom] = useState("");
  const [renameTo, setRenameTo] = useState("");
  const [rawSQL, setRawSQL] = useState("");

  const [running, setRunning] = useState(false);

  const createSQL = mode === "create" && tableName.trim() ? buildCreateSQL(tableName, cols) : "";

  function buildAlterSQL(): string {
    if (!table) return "";
    const t = `"${table.name.toUpperCase()}"`;
    if (alterTab === "add" && newCol.name.trim()) {
      const parts = [`"${newCol.name.toUpperCase()}"`, newCol.type];
      if (newCol.defaultVal.trim()) parts.push(`DEFAULT ${newCol.defaultVal.trim()}`);
      if (!newCol.nullable) parts.push("NOT NULL");
      return `ALTER TABLE ${t} ADD ${parts.join(" ")}`;
    }
    if (alterTab === "drop" && dropColName.trim()) {
      return `ALTER TABLE ${t} DROP "${dropColName.toUpperCase()}"`;
    }
    if (alterTab === "rename" && renameFrom.trim() && renameTo.trim()) {
      return `ALTER TABLE ${t} ALTER COLUMN "${renameFrom.toUpperCase()}" TO "${renameTo.toUpperCase()}"`;
    }
    if (alterTab === "raw") return rawSQL.trim();
    return "";
  }

  const sql = mode === "create" ? createSQL : buildAlterSQL();

  async function execute() {
    if (!databaseId) { toast.error("Selecione um banco"); return; }
    if (!sql) { toast.error("Defina o SQL antes de executar"); return; }
    setRunning(true);
    try {
      const { command_id } = await enqueueCommand(databaseId, "run_query", { sql });
      const row = await awaitCommandResult(command_id, { timeoutMs: 45_000, intervalMs: 1500 });
      if (row.status === "success") {
        toast.success(mode === "create" ? "Tabela criada" : "Alteração aplicada");
        onApplied?.();
        onOpenChange(false);
      } else {
        toast.error(row.error_message ?? "Falha ao executar");
      }
    } catch (e: any) {
      toast.error(e.message ?? "Timeout aguardando agente");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-mono">
            {mode === "create" ? "Criar nova tabela" : `Alterar tabela: ${table?.name ?? ""}`}
          </DialogTitle>
          <DialogDescription className="text-xs">
            O SQL é executado pelo agente local conectado ao Firebird. Use com cautela em produção.
          </DialogDescription>
        </DialogHeader>

        {mode === "create" ? (
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Nome da tabela</Label>
              <Input
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                placeholder="EX: PEDIDOS"
                className="font-mono"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Colunas</Label>
                <Button size="sm" variant="outline" onClick={() => setCols([...cols, emptyCol()])}>
                  <Plus className="h-3 w-3 mr-1" /> Coluna
                </Button>
              </div>
              <div className="border border-border rounded overflow-hidden">
                <table className="w-full text-xs font-mono">
                  <thead className="bg-background/80 border-b border-border">
                    <tr>
                      <th className="text-left px-2 py-1.5 text-primary uppercase text-[10px]">Nome</th>
                      <th className="text-left px-2 py-1.5 text-primary uppercase text-[10px]">Tipo</th>
                      <th className="text-left px-2 py-1.5 text-primary uppercase text-[10px]">Default</th>
                      <th className="px-2 py-1.5 text-primary uppercase text-[10px]">Null</th>
                      <th className="px-2 py-1.5 text-primary uppercase text-[10px]">PK</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cols.map((c, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="px-1 py-1">
                          <Input
                            value={c.name}
                            onChange={(e) => {
                              const next = [...cols]; next[i] = { ...c, name: e.target.value }; setCols(next);
                            }}
                            className="h-7 text-xs font-mono"
                          />
                        </td>
                        <td className="px-1 py-1 min-w-[140px]">
                          <Select
                            value={c.type}
                            onValueChange={(v) => {
                              const next = [...cols]; next[i] = { ...c, type: v }; setCols(next);
                            }}
                          >
                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {FB_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-1 py-1">
                          <Input
                            value={c.defaultVal}
                            onChange={(e) => {
                              const next = [...cols]; next[i] = { ...c, defaultVal: e.target.value }; setCols(next);
                            }}
                            placeholder="—"
                            className="h-7 text-xs font-mono"
                          />
                        </td>
                        <td className="px-2 py-1 text-center">
                          <Checkbox
                            checked={c.nullable}
                            onCheckedChange={(v) => {
                              const next = [...cols]; next[i] = { ...c, nullable: !!v }; setCols(next);
                            }}
                          />
                        </td>
                        <td className="px-2 py-1 text-center">
                          <Checkbox
                            checked={c.pk}
                            onCheckedChange={(v) => {
                              const next = [...cols]; next[i] = { ...c, pk: !!v, nullable: v ? false : c.nullable }; setCols(next);
                            }}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <Button
                            size="icon" variant="ghost" className="h-7 w-7"
                            onClick={() => setCols(cols.filter((_, j) => j !== i))}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <Tabs value={alterTab} onValueChange={(v) => setAlterTab(v as any)}>
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="add">Adicionar coluna</TabsTrigger>
              <TabsTrigger value="drop">Remover coluna</TabsTrigger>
              <TabsTrigger value="rename">Renomear coluna</TabsTrigger>
              <TabsTrigger value="raw">SQL livre</TabsTrigger>
            </TabsList>
            <TabsContent value="add" className="space-y-3 pt-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Nome</Label>
                  <Input value={newCol.name} onChange={(e) => setNewCol({ ...newCol, name: e.target.value })} className="font-mono" />
                </div>
                <div>
                  <Label className="text-xs">Tipo</Label>
                  <Select value={newCol.type} onValueChange={(v) => setNewCol({ ...newCol, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{FB_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Default (opcional)</Label>
                  <Input value={newCol.defaultVal} onChange={(e) => setNewCol({ ...newCol, defaultVal: e.target.value })} className="font-mono" />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Checkbox checked={newCol.nullable} onCheckedChange={(v) => setNewCol({ ...newCol, nullable: !!v })} />
                  <Label className="text-xs">Permite NULL</Label>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="drop" className="space-y-3 pt-3">
              <Label className="text-xs">Coluna a remover</Label>
              <Select value={dropColName} onValueChange={setDropColName}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>
                  {(table?.columns ?? []).map((c) => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </TabsContent>
            <TabsContent value="rename" className="space-y-3 pt-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">De</Label>
                  <Select value={renameFrom} onValueChange={setRenameFrom}>
                    <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                    <SelectContent>
                      {(table?.columns ?? []).map((c) => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Para</Label>
                  <Input value={renameTo} onChange={(e) => setRenameTo(e.target.value)} className="font-mono" />
                </div>
              </div>
            </TabsContent>
            <TabsContent value="raw" className="space-y-2 pt-3">
              <Label className="text-xs">SQL (DDL) — executa diretamente</Label>
              <Textarea
                value={rawSQL} onChange={(e) => setRawSQL(e.target.value)}
                rows={6} className="font-mono text-xs"
                placeholder={`ALTER TABLE "${table?.name ?? "MINHA_TABELA"}" ADD "NOVO" VARCHAR(60)`}
              />
            </TabsContent>
          </Tabs>
        )}

        <div className="rounded border border-border bg-background/40 p-3">
          <Label className="text-[10px] uppercase text-muted-foreground">SQL gerado</Label>
          <pre className="text-xs font-mono whitespace-pre-wrap text-secondary mt-1 max-h-48 overflow-auto">
            {sql || "—"}
          </pre>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>Cancelar</Button>
          <Button onClick={execute} disabled={running || !sql}>
            {running ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1.5" />}
            Executar no agente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
