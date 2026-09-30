"use client"; // error boundaries must be Client Components

export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="space-y-3 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">The page could not be shown. Nothing was changed.</p>
      <button
        type="button"
        onClick={() => retry()}
        className="inline-flex h-9 items-center rounded-md bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800"
      >
        Try again
      </button>
    </div>
  );
}
