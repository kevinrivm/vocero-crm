"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User, Lock, CheckCircle2, AlertCircle, Shield, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { initials } from "@/lib/utils";
import {
  type UserProfileData,
  updateUserProfile,
  updateUserPassword,
} from "@/server/tenant/profile-actions";

export function ProfileClient({ profile }: { profile: UserProfileData }) {
  const router = useRouter();
  const [name, setName] = useState(profile.name);
  const [savingName, setSavingName] = useState(false);
  const [nameSuccess, setNameSuccess] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const isAgente = profile.role === "agent" || profile.role === "member";

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    setNameError(null);
    setNameSuccess(false);
    setSavingName(true);

    const res = await updateUserProfile({ name });
    setSavingName(false);

    if (!res.ok) {
      setNameError(res.error || "No se pudo actualizar el nombre");
    } else {
      setNameSuccess(true);
      router.refresh();
      setTimeout(() => setNameSuccess(false), 3000);
    }
  }

  async function handleSavePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (newPassword.length < 8) {
      setPasswordError("La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Las contraseñas no coinciden.");
      return;
    }

    setSavingPassword(true);
    const res = await updateUserPassword({ currentPassword, newPassword });
    setSavingPassword(false);

    if (!res.ok) {
      setPasswordError(res.error || "Error al cambiar la contraseña");
    } else {
      setPasswordSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPasswordSuccess(false), 4000);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-20">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Mi Perfil</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gestiona tus datos personales y credenciales de acceso a la plataforma.
        </p>
      </div>

      {/* Resumen del Usuario */}
      <Card className="border border-white/60 dark:border-white/10 bg-white/60 dark:bg-slate-900/40 backdrop-blur-md shadow-sm">
        <CardContent className="flex flex-col sm:flex-row items-center gap-5 p-6">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0F4C5C] to-[#3E2723] text-xl font-bold text-white shadow-md ring-2 ring-white/30">
            {initials(profile.name)}
          </div>
          <div className="flex-1 text-center sm:text-left space-y-1">
            <h2 className="text-xl font-bold text-foreground">{profile.name}</h2>
            <p className="text-sm text-muted-foreground">{profile.email}</p>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs font-semibold text-primary">
                <Shield className="h-3 w-3" />
                {isAgente ? "Agente (Ventas/Soporte)" : "Administrador / Propietario"}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-white/10 border border-slate-200 dark:border-white/10 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                <Building2 className="h-3 w-3" />
                {profile.organizationName}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Datos Personales */}
        <Card className="border border-white/60 dark:border-white/10 bg-white/60 dark:bg-slate-900/40 backdrop-blur-md shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Datos Personales</CardTitle>
            </div>
            <CardDescription>Tu nombre visible para el equipo y clientes.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveName} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Nombre Completo</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Tu nombre"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">Correo Electrónico</Label>
                <Input id="email" value={profile.email} disabled className="opacity-70 bg-muted/50" />
                <p className="text-[11px] text-muted-foreground">
                  El correo es administrado por la empresa.
                </p>
              </div>

              {nameError && (
                <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-xs font-medium text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{nameError}</span>
                </div>
              )}

              {nameSuccess && (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>Nombre actualizado con éxito.</span>
                </div>
              )}

              <Button type="submit" disabled={savingName} className="w-full">
                {savingName ? "Guardando…" : "Guardar Cambios"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Seguridad y Contraseña */}
        <Card className="border border-white/60 dark:border-white/10 bg-white/60 dark:bg-slate-900/40 backdrop-blur-md shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Seguridad y Contraseña</CardTitle>
            </div>
            <CardDescription>Actualiza tu contraseña de acceso.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSavePassword} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="currentPassword">Contraseña Actual</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="newPassword">Nueva Contraseña</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  placeholder="Mínimo 8 caracteres"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirmar Nueva Contraseña</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Confirma la contraseña"
                />
              </div>

              {passwordError && (
                <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-xs font-medium text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{passwordError}</span>
                </div>
              )}

              {passwordSuccess && (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>Contraseña actualizada correctamente.</span>
                </div>
              )}

              <Button type="submit" disabled={savingPassword} variant="outline" className="w-full">
                {savingPassword ? "Actualizando…" : "Actualizar Contraseña"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

