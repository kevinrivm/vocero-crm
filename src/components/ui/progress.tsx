"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  indicatorClassName?: string;
}

export function Progress({
  className,
  value = 0,
  indicatorClassName,
  ...props
}: ProgressProps) {
  const percentage = Math.min(100, Math.max(0, value));

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percentage}
      className={cn(
        "relative h-2.5 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-800/80",
        className
      )}
      {...props}
    >
      <div
        className={cn(
          "h-full w-full flex-1 bg-gradient-to-r from-[#0F4C5C] to-[#155E75] transition-all duration-500 ease-in-out rounded-full",
          indicatorClassName
        )}
        style={{ transform: `translateX(-${100 - percentage}%)` }}
      />
    </div>
  );
}

