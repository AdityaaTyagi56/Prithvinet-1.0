import React, { useEffect, useMemo, useState } from "react";
import { useAlertStore } from "../../store/alertStore";
import { useReadingsStore } from "../../store/readingsStore";
import { useLiveReadings } from "../../hooks/useLiveReadings";
import { AlertTriangle, Activity, Wifi, WifiOff } from "lucide-react";
import { api } from "../../lib/api";
import { PARAMS_BY_TYPE, UNITS, LIMITS } from "../../lib/mockData";
import type { PollutionType } from "../../lib/mockData";

interface LocationItem {
  id: string;
  name: string;
}

interface DashboardPageProps {
  pollutionType: PollutionType;
}

const TYPE_LABELS: Record<PollutionType, string> = {
  air: "🌬️ Air Quality — Continuous Emission Monitoring",
  water: "💧 Water Quality — Effluent & River Monitoring",
  noise: "🔊 Noise Level — Ambient Sound Monitoring",
};

export function DashboardPage({ pollutionType }: DashboardPageProps) {
  const alerts = useAlertStore((state) => state.alerts);
  const latestReadings = useReadingsStore((state) => state.latestReadings);
  const addReading = useReadingsStore((state) => state.addReading);

  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [isLoadingReadings, setIsLoadingReadings] = useState(false);

  const { isConnected } = useLiveReadings(selectedLocationId);

  const params = PARAMS_BY_TYPE[pollutionType];

  useEffect(() => {
    async function loadLocations() {
      try {
        const res = await api.get(`/locations?type=${pollutionType}`);
        const fetched = (res.data || []).map((loc: any) => ({
          id: loc.id,
          name: loc.name,
        }));
        setLocations(fetched);

        setSelectedLocationId((prev) => {
          if (prev && fetched.some((l: LocationItem) => l.id === prev))
            return prev;
          return fetched.length > 0 ? fetched[0].id : "";
        });
      } catch (error) {
        console.error("Failed to load locations", error);
        setLocations([]);
        setSelectedLocationId("");
      }
    }

    loadLocations();
  }, [pollutionType]);

  useEffect(() => {
    async function loadLatestFromBackend() {
      if (!selectedLocationId) return;
      setIsLoadingReadings(true);
      try {
        const res = await api.get(
          `/readings/latest/${selectedLocationId}?type=${pollutionType}`,
        );
        const rows = Array.isArray(res.data) ? res.data : [];

        rows.forEach((row: any) => {
          const parameter =
            row.parameter || row.parameter_name || row.parameter_id || row.name;

          if (!parameter) return;

          addReading({
            location_id: String(row.location_id || selectedLocationId),
            parameter_id: String(row.parameter_id || parameter),
            parameter: String(parameter),
            value: Number(row.value),
            recorded_at: row.recorded_at || new Date().toISOString(),
          });
        });
      } catch (error) {
        console.error("Failed to load latest readings", error);
      } finally {
        setIsLoadingReadings(false);
      }
    }

    loadLatestFromBackend();
  }, [selectedLocationId, pollutionType, addReading]);

  const selectedLocation = useMemo(
    () => locations.find((l) => l.id === selectedLocationId),
    [locations, selectedLocationId],
  );

  const locationReadings = selectedLocationId
    ? latestReadings[selectedLocationId] || {}
    : {};

  const getStatusColor = (param: string, value: number) => {
    const limit = LIMITS[param] || 100;

    if (param === "pH") {
      if (value < 6.5 || value > 8.5) return "text-red-600";
      if (value < 6.8 || value > 8.2) return "text-amber-600";
      return "text-green-600";
    }

    if (param === "DO") {
      if (value < limit) return "text-red-600";
      if (value < limit * 1.3) return "text-amber-600";
      return "text-green-600";
    }

    if (value > limit) return "text-red-600";
    if (value > limit * 0.75) return "text-amber-600";
    return "text-green-600";
  };

  return (
    <div className="space-y-6">
      <div className="gov-card overflow-hidden">
        <div className="gov-card-header flex items-center justify-between">
          <span>{TYPE_LABELS[pollutionType]} — Live Telemetry</span>
          <div className="flex items-center gap-3">
            <div
              className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded ${
                isConnected
                  ? "bg-green-100 text-green-700"
                  : "bg-amber-100 text-amber-700"
              }`}
              title={
                isConnected ? "WebSocket connected" : "WebSocket disconnected"
              }
            >
              {isConnected ? (
                <Wifi className="h-3.5 w-3.5" />
              ) : (
                <WifiOff className="h-3.5 w-3.5" />
              )}
              {isConnected ? "LIVE" : "OFFLINE"}
            </div>

            <select
              className="rounded border border-white/30 px-3 py-1 text-sm bg-white/10 text-white focus:outline-none"
              value={selectedLocationId}
              onChange={(e) => setSelectedLocationId(e.target.value)}
            >
              {locations.length === 0 && (
                <option value="">No locations found</option>
              )}
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id} className="text-gray-800">
                  {loc.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="p-5">
          {selectedLocation && (
            <div className="text-sm text-gray-600 mb-4">
              Station:{" "}
              <span className="font-semibold text-[#1a365d]">
                {selectedLocation.name}
              </span>
              <span className="ml-2 inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                {isConnected ? "LIVE STREAM" : "SNAPSHOT"}
              </span>
            </div>
          )}

          {alerts.length > 0 && (
            <div className="bg-red-50 border border-red-200 p-4 rounded mb-4 flex items-center space-x-3">
              <AlertTriangle className="text-red-600 h-5 w-5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-red-800 font-semibold text-sm">
                  ⚠ ALERT: {alerts[0].type.replace("_", " ").toUpperCase()}
                </p>
                <p className="text-red-600 text-sm">
                  {alerts[0].parameter_id} exceeded threshold{" "}
                  {alerts[0].threshold} {UNITS[alerts[0].parameter_id] || ""} —
                  recorded value: {alerts[0].value}{" "}
                  {UNITS[alerts[0].parameter_id] || ""}
                </p>
              </div>
              <span className="badge-critical uppercase">
                {alerts[0].severity}
              </span>
            </div>
          )}

          <div
            className={`grid grid-cols-2 md:grid-cols-3 ${params.length > 3 ? "xl:grid-cols-6" : ""} gap-3`}
          >
            {params.map((param) => {
              const reading = locationReadings[param];
              const value = reading?.value;
              const unit = UNITS[param] || "";
              const limit = LIMITS[param];

              return (
                <div
                  key={param}
                  className="bg-gray-50 p-4 rounded border border-gray-200 hover:shadow transition-shadow"
                >
                  <div className="flex justify-between items-start">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {param}
                    </p>
                    <Activity className="text-[#1a365d]/40 h-4 w-4" />
                  </div>

                  <h3
                    className={`text-2xl font-bold mt-2 ${
                      value != null
                        ? getStatusColor(param, value)
                        : "text-gray-400"
                    }`}
                  >
                    {value != null
                      ? Number(value).toFixed(1)
                      : isLoadingReadings
                        ? "..."
                        : "--"}
                  </h3>

                  <div className="text-[10px] text-gray-400 mt-1">
                    {unit} {limit ? `(Limit: ${limit})` : ""}
                  </div>

                  <div className="mt-2 text-[10px] text-gray-400">
                    {reading
                      ? new Date(reading.recorded_at).toLocaleTimeString()
                      : isLoadingReadings
                        ? "Loading latest reading..."
                        : "Awaiting data..."}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
