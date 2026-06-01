import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Settings } from "lucide-react";

export const Route = createFileRoute("/_app/configuracoes")({ component: Page });

function Page() {
  return (
    <Card className="p-12 text-center bg-card border-border">
      <Settings className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
      <h3 className="font-mono text-sm font-semibold">Configurações</h3>
      <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
        Conta, API, notificações, retenção e exportação de dados. Módulo em construção.
      </p>
    </Card>
  );
}
