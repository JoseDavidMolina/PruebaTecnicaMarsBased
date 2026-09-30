"use client";

import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";

const selectClass =
  "h-9 rounded-md border border-input bg-background px-2.5 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** Native select that submits its form on change (user switcher, filters). */
export function AutoSubmitSelect({ className, ...props }: React.ComponentProps<"select">) {
  return <select {...props} className={cn(selectClass, className)} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}

export function SubmitButton({ children, pendingText, className }: { children: React.ReactNode; pendingText: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors disabled:opacity-60 [&>svg]:size-4",
        className,
      )}
    >
      {pending ? pendingText : children}
    </button>
  );
}
