import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { Server, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { signIn, signUp, user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) {
    throw redirect({ to: "/" });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "login") {
        await signIn(email, password);
        toast.success("Bem-vindo de volta");
      } else {
        await signUp(email, password);
        toast.success("Conta criada. Verifique seu e-mail.");
      }
      navigate({ to: "/" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha na autenticação";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background bg-grid-dots flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="h-14 w-14 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center mb-4">
            <Server className="h-7 w-7 text-primary" />
          </div>
          <h1 className="font-mono text-2xl font-semibold">
            CONECTA<span className="text-primary"> API</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-2 text-center">
            Plataforma de integração Firebird → Cloud
          </p>
        </div>

        <div className="bg-card border border-border rounded-lg p-6 shadow-2xl">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="admin@empresa.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder="••••••••"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {mode === "login" ? "Entrar" : "Criar conta"}
            </Button>
          </form>

          <div className="mt-4 text-center text-xs text-muted-foreground">
            {mode === "login" ? (
              <>
                Não tem conta?{" "}
                <button
                  onClick={() => setMode("signup")}
                  className="text-primary hover:underline cursor-pointer"
                >
                  Criar agora
                </button>
              </>
            ) : (
              <>
                Já tem conta?{" "}
                <button
                  onClick={() => setMode("login")}
                  className="text-primary hover:underline cursor-pointer"
                >
                  Entrar
                </button>
              </>
            )}
          </div>
          <div className="mt-2 text-center">
            <button className="text-xs text-muted-foreground hover:text-foreground cursor-pointer">
              Esqueci minha senha
            </button>
          </div>
        </div>

        <p className="text-center text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-6">
          v1.0.0 · Sistema seguro
        </p>
      </div>
    </div>
  );
}
