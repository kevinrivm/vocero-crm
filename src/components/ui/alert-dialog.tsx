"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface AlertDialogContextType {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const AlertDialogContext = React.createContext<AlertDialogContextType | null>(null);

export function AlertDialog({
  children,
  open: controlledOpen,
  onOpenChange,
}: {
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const setOpen = React.useCallback(
    (value: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(value);
      }
      onOpenChange?.(value);
    },
    [isControlled, onOpenChange]
  );

  return (
    <AlertDialogContext.Provider value={{ open, setOpen }}>
      {children}
    </AlertDialogContext.Provider>
  );
}

export function AlertDialogTrigger({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const ctx = React.useContext(AlertDialogContext);
  return (
    <button
      type="button"
      onClick={() => ctx?.setOpen(true)}
      className={className}
      {...props}
    >
      {children}
    </button>
  );
}

export function AlertDialogContent({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const ctx = React.useContext(AlertDialogContext);
  const isOpen = ctx ? ctx.open : true;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-150">
      <div
        role="alertdialog"
        aria-modal="true"
        className={cn(
          "w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl text-foreground p-6 animate-in zoom-in-95 duration-150",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </div>
  );
}

export function AlertDialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col space-y-2 text-center sm:text-left", className)}
      {...props}
    />
  );
}

export function AlertDialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 pt-4 border-t border-border mt-4 gap-2",
        className
      )}
      {...props}
    />
  );
}

export function AlertDialogTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-lg font-bold leading-none tracking-tight text-foreground", className)}
      {...props}
    />
  );
}

export function AlertDialogDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-xs text-muted-foreground leading-relaxed", className)}
      {...props}
    />
  );
}

export function AlertDialogAction({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center rounded-xl bg-destructive text-destructive-foreground px-4 py-2 text-xs font-semibold shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function AlertDialogCancel({
  children,
  className,
  onClick,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const ctx = React.useContext(AlertDialogContext);
  return (
    <button
      type="button"
      onClick={(e) => {
        ctx?.setOpen(false);
        onClick?.(e);
      }}
      className={cn(
        "inline-flex items-center justify-center rounded-xl bg-white/50 border border-slate-300 text-slate-700 hover:bg-slate-100 px-4 py-2 text-xs font-medium transition-colors disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children || "Cancelar"}
    </button>
  );
}

