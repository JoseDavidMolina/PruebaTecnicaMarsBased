"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";

const selectClass = "h-9 rounded-md border border-input bg-card px-2.5 text-sm";

/**
 * Native select that submits its form once a choice is made (user switcher, filters). A pointer pick submits at
 * once. From the keyboard, arrow keys change the value on every press (Chrome and Firefox on Windows), so they only
 * browse: the choice is submitted with Enter, or when focus leaves the field.
 */
export function AutoSubmitSelect({ className, ...props }: React.ComponentProps<"select">) {
  const fromKeyboard = useRef(false);
  const pending = useRef(false);
  const submit = (select: HTMLSelectElement) => {
    pending.current = false;
    select.form?.requestSubmit();
  };
  return (
    <select
      {...props}
      className={cn(selectClass, className)}
      onPointerDown={() => (fromKeyboard.current = false)}
      onKeyDown={(e) => {
        fromKeyboard.current = true;
        if (e.key === "Enter" && pending.current) {
          e.preventDefault();
          submit(e.currentTarget);
        }
      }}
      onChange={(e) => (fromKeyboard.current ? (pending.current = true) : submit(e.currentTarget))}
      onBlur={(e) => pending.current && submit(e.currentTarget)}
    />
  );
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

/**
 * Re-renders the server components on an interval, so ops sees new operator updates without reloading.
 * Only re-fetches: the demo clock and the cookies it reads are unchanged, so the demo stays deterministic.
 */
export function LiveRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
