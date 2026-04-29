"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export type FloatingFieldProps = {
  id: string;
  name: string;
  type: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  disabled?: boolean;
  required?: boolean;
  endAdornment?: React.ReactNode;
};

/** Champ floating-label façon iOS : label qui flotte au-dessus de la valeur. */
export function FloatingField({
  id,
  name,
  type,
  label,
  value,
  onChange,
  autoComplete,
  disabled,
  required,
  endAdornment,
}: FloatingFieldProps) {
  const [focused, setFocused] = useState(false);
  const floated = focused || value.length > 0;

  return (
    <div
      className={cn(
        "group relative rounded-2xl bg-white/80 ring-1 ring-inset transition-all duration-200",
        focused
          ? "ring-violet-500 shadow-[0_0_0_4px_rgba(139,92,246,0.12)]"
          : "ring-zinc-200 hover:ring-zinc-300",
        disabled && "opacity-60"
      )}
    >
      <label
        htmlFor={id}
        className={cn(
          "pointer-events-none absolute left-4 origin-left select-none text-zinc-400 transition-all duration-200 ease-out",
          floated
            ? "top-2 text-[11px] font-medium tracking-wide text-violet-600"
            : "top-1/2 -translate-y-1/2 text-[15px]"
        )}
      >
        {label}
      </label>

      <input
        id={id}
        name={name}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoComplete={autoComplete}
        disabled={disabled}
        required={required}
        className={cn(
          "h-14 w-full rounded-2xl bg-transparent px-4 pb-1.5 pt-5 text-[15px] text-zinc-900 outline-none placeholder:text-transparent",
          endAdornment && "pr-12"
        )}
      />

      {endAdornment && (
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
          {endAdornment}
        </div>
      )}
    </div>
  );
}
