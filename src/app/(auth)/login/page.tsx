"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import nexiaLogo from "@/app/icon.png";
import { signIn } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await signIn.email({ email, password });
    setLoading(false);
    if (err) {
      setError(
        err.status === 429
          ? "Demasiados intentos. Espera unos minutos."
          : err.message || "Correo o contraseña incorrectos."
      );
      return;
    }
    // A la raíz, no a la Bandeja: ahí se decide si toca la guía de inicio
    // (#86) o la Bandeja de siempre.
    router.push("/");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex items-center justify-center">
          <Image
            src={nexiaLogo}
            alt="Nexia"
            priority
            className="h-16 w-16 object-contain drop-shadow-md"
          />
        </div>

        <h1 className="text-[22px] font-bold leading-tight tracking-[-0.03em] text-foreground">
          El CRM inteligente{" "}
          <span
            className="bg-clip-text font-serif text-[1.15em] font-normal italic tracking-[-0.01em] text-transparent"
            style={{
              backgroundImage:
                "linear-gradient(92deg, #0F4C5C 15%, #3E2723 85%)",
            }}
          >
            con Agente IA.
          </span>
        </h1>
      </div>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle>Iniciar sesión</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Correo</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Entrando…" : "Entrar"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              ¿Primera vez aquí?{" "}
              <Link href="/register" className="text-primary hover:underline">
                Crear la cuenta inicial
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
