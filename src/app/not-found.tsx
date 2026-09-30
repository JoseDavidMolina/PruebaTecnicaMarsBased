import Link from "next/link";
import { ArrowLeft } from "lucide-react";

// Same page for an unknown id and for a shipment outside the user's perimeter, so it reveals nothing.
export default function NotFound() {
  return (
    <div className="space-y-3 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Not found</h1>
      <p className="text-sm text-muted-foreground">
        This page or shipment doesn&apos;t exist, or it isn&apos;t visible to the user you are viewing as.
      </p>
      <Link href="/" className="inline-flex items-center gap-1 text-sm font-medium hover:underline">
        <ArrowLeft className="size-4" /> Back to your shipments
      </Link>
    </div>
  );
}
