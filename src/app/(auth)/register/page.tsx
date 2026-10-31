"use client";
import { systemText } from "@/lib/i18n";

import { useI18n } from "@/components/i18n-provider";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signUp } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RegisterPage() {
  const { t: tr } = useI18n();

  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await signUp.email({ name, email, password });
    setLoading(false);
    if (err) {
      if (err.status === 403) {
        setError(
          tr("El registro está cerrado: esta instancia ya tiene su organización. Pide acceso al propietario.")
        );
      } else if (err.status === 429) {
        setError(tr("Demasiados intentos. Espera unos minutos."));
      } else {
        setError(err.message ?? tr("No se pudo crear la cuenta."));
      }
      return;
    }
    // A la raíz, no a la Bandeja: ahí se decide si toca la guía de inicio
    // (#86) o la Bandeja de siempre.
    router.push("/");
    router.refresh();
  }

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle>{tr("Crear cuenta")}</CardTitle>
        <CardDescription>
          {tr("El primer registro crea la organización de esta instancia y queda como propietario.")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">{tr("Tu nombre")}</Label>
            <Input
              id="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">{tr("Correo")}</Label>
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
            <Label htmlFor="password">{tr("Contraseña")}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{systemText(tr.locale, error)}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? tr("Creando…") : tr("Crear cuenta")}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {tr("¿Ya tienes cuenta?")}{" "}
            <Link href="/login" className="text-primary hover:underline">
              {tr("Inicia sesión")}</Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
