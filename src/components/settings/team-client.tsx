"use client";

import { useCallback, useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { ContactAvatar } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Member = {
  id: string;
  role: string;
  name: string;
  email: string;
  createdAt: string;
};

export function TeamClient() {
  const [members, setMembers] = useState<Member[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "agente">("agente");
  const [tempPassword, setTempPassword] = useState("");
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/settings/team").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { members: Member[] };
    setMembers(data.members);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  function generatePassword() {
    const alphabet =
      "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = new Uint32Array(14);
    crypto.getRandomValues(bytes);
    setTempPassword(
      Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")
    );
  }

  async function create() {
    setSaving(true);
    setError(null);
    setCreated(null);
    const res = await fetch("/api/settings/team", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, email, password: tempPassword, role }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "No se pudo crear la cuenta");
      return;
    }
    setCreated({ email, password: tempPassword });
    setName("");
    setEmail("");
    setRole("agente");
    setTempPassword("");
    void refetch();
  }

  function formatRole(r: string) {
    if (r === "superadmin") return "Súper Admin";
    if (r === "owner" || r === "admin") return "Administrador";
    return "Agente";
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Crear cuenta de equipo</CardTitle>
          <CardDescription>
            Sin correos ni invitaciones: comparte tú mismo la contraseña
            temporal con tu compañero (se muestra UNA sola vez).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="team-name">Nombre</Label>
              <Input
                id="team-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="team-email">Correo</Label>
              <Input
                id="team-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="team-role">Rol en la empresa</Label>
              <select
                id="team-role"
                value={role}
                onChange={(e) => setRole(e.target.value as "admin" | "agente")}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="agente" className="bg-popover text-popover-foreground">
                  Agente (solo atiende chats)
                </option>
                <option value="admin" className="bg-popover text-popover-foreground">
                  Administrador (configuración y equipo)
                </option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="team-password">Contraseña temporal</Label>
              <div className="flex gap-2">
                <Input
                  id="team-password"
                  value={tempPassword}
                  onChange={(e) => setTempPassword(e.target.value)}
                  placeholder="mínimo 8 caracteres"
                />
                <Button variant="outline" type="button" onClick={generatePassword}>
                  Generar
                </Button>
              </div>
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {created && (
            <div className="rounded-md border border-success-soft bg-success-tint p-3 text-sm">
              <p className="font-medium text-success-text">Cuenta creada ✓</p>
              <p className="mt-1 text-success-text opacity-90">
                Comparte estos datos ahora (no se volverán a mostrar):
                <br />
                <code>{created.email}</code> · contraseña{" "}
                <code>{created.password}</code>
              </p>
            </div>
          )}
          <Button
            disabled={
              saving || !name.trim() || !email.trim() || tempPassword.length < 8
            }
            onClick={() => void create()}
          >
            <UserPlus className="h-4 w-4" />
            {saving ? "Creando…" : "Crear cuenta"}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Miembros
        </p>
        {members.map((m) => (
          <div
            key={m.id}
            className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3"
          >
            <ContactAvatar name={m.name} seed={m.id} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{m.name}</p>
              <p className="text-xs text-muted-foreground">{m.email}</p>
            </div>
            <Badge
              variant={
                m.role === "owner" || m.role === "admin" || m.role === "superadmin"
                  ? "default"
                  : "secondary"
              }
            >
              {formatRole(m.role)}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
