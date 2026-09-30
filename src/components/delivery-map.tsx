"use client";
// Teal marks what the courier reported; violet stays reserved for AI output.

import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import type { Position } from "@/domain/types";

// Only the last position the courier reported, not the trail: where the parcel is is what the reader needs.
// A circle marker instead of Leaflet's default image icon, which needs extra asset wiring in bundlers.
export default function DeliveryMap({ position, label }: { position: Position; label: string }) {
  const at: [number, number] = [position.lat, position.lng];
  return (
    <MapContainer center={at} zoom={14} scrollWheelZoom={false} className="h-64 w-full rounded-lg">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <CircleMarker center={at} radius={8} pathOptions={{ color: "#fff", fillColor: "#0e7c7b", fillOpacity: 1, weight: 3 }}>
        <Tooltip permanent direction="top">
          {label}
        </Tooltip>
      </CircleMarker>
    </MapContainer>
  );
}
