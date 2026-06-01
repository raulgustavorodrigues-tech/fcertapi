import { Bell, ChevronRight, LogOut, User as UserIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const titles: Record<string, string> = {
  "/": "Dashboard",
  "/empresas": "Empresas",
  "/bancos": "Bancos de Dados",
  "/tabelas": "Tabelas",
  "/queries": "Queries",
  "/conectividade": "Conectividade",
  "/sincronizacao": "Sincronização",
  "/configuracoes": "Configurações",
};

export function AppHeader({ pathname }: { pathname: string }) {
  const { user, signOut } = useAuth();
  const segment = "/" + pathname.split("/")[1];
  const title = titles[segment] ?? "CONECTA API";
  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-20 h-16 bg-background/95 backdrop-blur border-b border-border flex items-center px-6 gap-4">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
          CONECTA
        </span>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
        <h1 className="font-mono font-semibold text-foreground text-base truncate">{title}</h1>
      </div>

      <div className="flex-1" />

      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
        <Bell className="h-4 w-4" />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="h-9 w-9 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center font-mono text-xs text-primary cursor-pointer hover:bg-primary/25 transition-colors duration-150"
          >
            {initials}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col gap-0.5">
              <p className="text-xs text-muted-foreground">Conectado como</p>
              <p className="text-sm truncate">{user?.email}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled className="gap-2">
            <UserIcon className="h-4 w-4" />
            Perfil
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => signOut()} className="gap-2 text-destructive focus:text-destructive cursor-pointer">
            <LogOut className="h-4 w-4" />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
