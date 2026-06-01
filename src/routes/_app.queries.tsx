import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Code2 } from "lucide-react";

export const Route = createFileRoute("/_app/queries")({ component: Page });

function Page() {
  return (
    <Card className="p-12 text-center bg-card border-border">
      <Code2 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
      <h3 className="font-mono text-sm font-semibold">Biblioteca de Queries</h3>
      <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
        Editor SQL com syntax highlighting, salvamento de queries reutilizáveis e execução remota nos bancos cadastrados. Módulo em construção.
      </p>
    </Card>
  );
}
