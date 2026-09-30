"use client";

import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip } from "react-leaflet";
import type { Place, Position } from "@/domain/types";

// Circle markers instead of Leaflet's default image icons, which need extra asset wiring in bundlers.
export default function DeliveryMap({ positions, destination, lastLabel }: { positions: Position[]; destination: Place; lastLabel: string }) {
  const route = positions.map((p) => [p.lat, p.lng] as [number, number]);
  const current = route.at(-1)!;
  const bounds: [number, number][] = [...route, [destination.lat, destination.lng]];

  return (
    <MapContainer bounds={bounds} boundsOptions={{ padding: [24, 24] }} scrollWheelZoom={false} className="h-64 w-full rounded-lg">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Polyline positions={route} pathOptions={{ color: "#7c3aed", weight: 4, opacity: 0.8 }} />
      <CircleMarker center={[destination.lat, destination.lng]} radius={7} pathOptions={{ color: "#0f172a", fillColor: "#fff", fillOpacity: 1, weight: 3 }}>
        <Tooltip>{destination.name}</Tooltip>
      </CircleMarker>
      <CircleMarker center={current} radius={8} pathOptions={{ color: "#fff", fillColor: "#7c3aed", fillOpacity: 1, weight: 3 }}>
        <Tooltip permanent direction="top">{lastLabel}</Tooltip>
      </CircleMarker>
    </MapContainer>
  );
}
