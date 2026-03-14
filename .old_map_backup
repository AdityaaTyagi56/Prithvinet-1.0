import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import 'leaflet.heat';

interface MapLocation {
  location_id: string;
  location_name: string;
  latitude: number;
  longitude: number;
  pm25: number;
  recorded_at: string;
}

// Fix Leaflet default icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function HeatmapLayer({ points }: { points: [number, number, number][] }) {
  const map = useMap();
  
  useEffect(() => {
    if (!map) return;
    const heat = (L as any).heatLayer(points, { radius: 25, blur: 15, maxZoom: 10 }).addTo(map);
    return () => {
      map.removeLayer(heat);
    };
  }, [map, points]);
  
  return null;
}

export function PollutionMap({ locations = [] }: { locations?: MapLocation[] }) {
  const center: [number, number] = locations.length
    ? [locations[0].latitude, locations[0].longitude]
    : [21.2514, 81.6296];

  const heatPoints: [number, number, number][] = locations.map((loc) => [
    loc.latitude,
    loc.longitude,
    Math.min(Math.max(loc.pm25 / 200, 0.1), 1),
  ]);

  return (
    <div className="h-[500px] w-full rounded overflow-hidden border border-gray-200">
      <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {heatPoints.length > 0 && <HeatmapLayer points={heatPoints} />}
        {locations.map((loc) => (
          <Marker key={loc.location_id} position={[loc.latitude, loc.longitude]}>
            <Popup>
              <div className="font-semibold">{loc.location_name}</div>
              <div className="text-sm text-slate-500">PM2.5: {Math.round(loc.pm25)} ug/m3</div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
