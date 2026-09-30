"use client";

import dynamic from "next/dynamic";

// Leaflet touches `window` on import, so it only loads in the browser.
export const DeliveryMap = dynamic(() => import("./delivery-map"), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse rounded-lg bg-muted" />,
});
