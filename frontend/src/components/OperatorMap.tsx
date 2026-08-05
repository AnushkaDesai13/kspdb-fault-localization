import React from 'react';
import { MapContainer, TileLayer, CircleMarker, Polyline, Popup, Marker } from 'react-leaflet';
import L from 'leaflet';

interface PoleData {
  pole_id: string;
  lat: number;
  lon: number;
  dt_id: string;
  energized: boolean;
  device_id: string | null;
}

interface IncidentData {
  id: string;
  fault_type: string;
  lat: number;
  lon: number;
  span_start_pole_id?: string;
  span_end_pole_id?: string;
  boundary_pole_ids: string[];
  status: string;
}

interface OperatorMapProps {
  poles: PoleData[];
  incidents: IncidentData[];
  selectedIncident: IncidentData | null;
  onSelectIncident: (inc: IncidentData) => void;
}

export const OperatorMap: React.FC<OperatorMapProps> = ({
  poles,
  incidents,
  selectedIncident,
  onSelectIncident,
}) => {
  const centerLat = selectedIncident ? selectedIncident.lat : 12.9350;
  const centerLon = selectedIncident ? selectedIncident.lon : 77.6100;

  // Active fault markers
  const activeIncidents = incidents.filter((i) => i.status !== 'closed');

  return (
    <div className="map-container">
      <MapContainer
        center={[centerLat, centerLon]}
        zoom={14}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; CartoDB'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        {/* Poles Markers */}
        {poles.slice(0, 800).map((pole) => {
          let color = pole.energized ? '#10b981' : '#ef4444';
          if (!pole.device_id) color = '#6b7280'; // unmonitored

          return (
            <CircleMarker
              key={pole.pole_id}
              center={[pole.lat, pole.lon]}
              radius={pole.energized ? 3 : 5}
              pathOptions={{
                color,
                fillColor: color,
                fillOpacity: 0.8,
                weight: pole.energized ? 1 : 2,
              }}
            >
              <Popup>
                <div style={{ color: '#000', fontSize: '0.8rem' }}>
                  <strong>Pole ID: {pole.pole_id}</strong><br />
                  DT: {pole.dt_id}<br />
                  Status: {pole.energized ? '⚡ Energized (Live)' : '🔴 Dark (No Power)'}<br />
                  Device: {pole.device_id || 'Unmonitored Pole'}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

        {/* Highlighted Fault Spans */}
        {activeIncidents.map((inc) => (
          <React.Fragment key={inc.id}>
            <CircleMarker
              center={[inc.lat, inc.lon]}
              radius={10}
              pathOptions={{
                color: '#ef4444',
                fillColor: '#ef4444',
                fillOpacity: 0.9,
                weight: 3,
              }}
              eventHandlers={{
                click: () => onSelectIncident(inc),
              }}
            >
              <Popup>
                <div style={{ color: '#000', fontSize: '0.85rem' }}>
                  <strong>🚨 {inc.fault_type}</strong><br />
                  ID: {inc.id}<br />
                  Status: {inc.status}
                </div>
              </Popup>
            </CircleMarker>
          </React.Fragment>
        ))}
      </MapContainer>
    </div>
  );
};
