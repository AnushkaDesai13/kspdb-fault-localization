import React, { useState } from 'react';
import { AlertTriangle, CheckCircle, ShieldAlert, Clock, MapPin } from 'lucide-react';

interface IncidentData {
  id: string;
  fault_type: string;
  target_asset_id: string;
  lat: number;
  lon: number;
  pincode: string;
  ward: string;
  affected_pole_ids: string[];
  affected_households: number;
  confidence_score: number;
  confidence_reasoning: string;
  status: string;
  detected_at: string;
  assigned_crew?: string;
}

interface IncidentListProps {
  incidents: IncidentData[];
  selectedIncident: IncidentData | null;
  onSelectIncident: (inc: IncidentData) => void;
}

export const IncidentList: React.FC<IncidentListProps> = ({
  incidents,
  selectedIncident,
  onSelectIncident,
}) => {
  const [filter, setFilter] = useState<'ACTIVE' | 'SPAN' | 'DT' | 'CLOSED'>('ACTIVE');

  const filtered = incidents.filter((inc) => {
    if (filter === 'ACTIVE') return inc.status !== 'closed';
    if (filter === 'SPAN') return inc.fault_type === 'SPAN_FAULT' && inc.status !== 'closed';
    if (filter === 'DT') return (inc.fault_type === 'DT_FAULT' || inc.fault_type === 'FEEDER_FAULT') && inc.status !== 'closed';
    if (filter === 'CLOSED') return inc.status === 'closed';
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="sidebar-tabs">
        <button
          className={`tab-btn ${filter === 'ACTIVE' ? 'active' : ''}`}
          onClick={() => setFilter('ACTIVE')}
        >
          Active ({incidents.filter((i) => i.status !== 'closed').length})
        </button>
        <button
          className={`tab-btn ${filter === 'SPAN' ? 'active' : ''}`}
          onClick={() => setFilter('SPAN')}
        >
          Span Faults
        </button>
        <button
          className={`tab-btn ${filter === 'DT' ? 'active' : ''}`}
          onClick={() => setFilter('DT')}
        >
          DT / Feeder
        </button>
        <button
          className={`tab-btn ${filter === 'CLOSED' ? 'active' : ''}`}
          onClick={() => setFilter('CLOSED')}
        >
          Closed
        </button>
      </div>

      <div className="incident-feed">
        {filtered.length === 0 ? (
          <div style={{ padding: '30px', textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem' }}>
            <CheckCircle size={32} color="#10b981" style={{ marginBottom: '8px' }} /><br />
            No active fault incidents detected. Sub-division operational.
          </div>
        ) : (
          filtered.map((inc) => {
            const isSelected = selectedIncident?.id === inc.id;

            let badgeClass = 'badge-danger';
            if (inc.status === 'acknowledged') badgeClass = 'badge-warning';
            if (inc.status === 'crew_assigned') badgeClass = 'badge-info';
            if (inc.status === 'closed') badgeClass = 'badge-success';

            return (
              <div
                key={inc.id}
                className={`incident-card ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelectIncident(inc)}
              >
                <div className="card-top">
                  <span className={`badge ${badgeClass}`}>{inc.status}</span>
                  <span style={{ fontSize: '0.75rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={12} /> {new Date(inc.detected_at).toLocaleTimeString()}
                  </span>
                </div>

                <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertTriangle size={16} color="#ef4444" />
                  {inc.fault_type.replace('_', ' ')}
                </div>

                <div style={{ fontSize: '0.8rem', color: '#d1d5db', marginBottom: '6px' }}>
                  Target: <strong>{inc.target_asset_id}</strong>
                </div>

                <div className="card-meta">
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <MapPin size={12} /> PIN: {inc.pincode}
                  </span>
                  <span>{inc.affected_households} Households</span>
                  <span style={{ color: inc.confidence_score > 80 ? '#34d399' : '#fbbf24' }}>
                    {inc.confidence_score}% Conf.
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
