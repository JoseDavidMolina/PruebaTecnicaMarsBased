"use client"; // error boundaries must be Client Components

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="space-y-3 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">This page could not be shown</h1>
      <p className="text-sm text-muted-foreground">Nothing was changed. Try again, or go back to your shipments.</p>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Try again
        </button>
        <Link href="/" className="inline-flex items-center gap-1 text-sm font-medium hover:underline">
          <ArrowLeft className="size-4" /> Back to your shipments
        </Link>
      </div>
    </div>
  );
}
