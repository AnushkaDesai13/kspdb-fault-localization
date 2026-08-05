import React, { useState } from 'react';
import { AlertCircle, UserCheck, Wrench, CheckCircle2, Bot, Sparkles, Navigation, X } from 'lucide-react';

interface IncidentData {
  id: string;
  fault_type: string;
  target_asset_id: string;
  lat: number;
  lon: number;
  pincode: string;
  ward: string;
  dt_id: string;
  feeder_id: string;
  affected_pole_ids: string[];
  affected_households: number;
  confidence_score: number;
  confidence_reasoning: string;
  topology_source: string;
  status: string;
  detected_at: string;
  assigned_crew?: string;
  rejection_reason?: string;
  ai_dispatch_brief?: string;
}

interface IncidentDetailProps {
  incident: IncidentData;
  onClose: () => void;
  onRefresh: () => void;
}

export const IncidentDetail: React.FC<IncidentDetailProps> = ({
  incident,
  onClose,
  onRefresh,
}) => {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(incident.rejection_reason || null);

  const handleAcknowledge = async () => {
    setLoading(true);
    try {
      await fetch(`/api/incidents/${incident.id}/acknowledge`, { method: 'POST' });
      onRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignCrew = async () => {
    setLoading(true);
    try {
      await fetch(`/api/incidents/${incident.id}/assign-crew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crew_name: 'Lineman Unit Alpha-07' }),
      });
      onRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/incidents/${incident.id}/resolve`, { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to resolve ticket');
      }
      onRefresh();
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="detail-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span className="badge badge-danger">{incident.status}</span>
          <h2 style={{ fontSize: '1.1rem', marginTop: '4px' }}>{incident.fault_type.replace('_', ' ')}</h2>
        </div>
        <button className="btn btn-secondary" style={{ padding: '6px' }} onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      {errorMsg && (
        <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171', padding: '10px 14px', borderRadius: '8px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={18} /> {errorMsg}
        </div>
      )}

      {/* Target & Coordinates Box */}
      <div className="section-box">
        <div className="section-title">Fault Localization Target</div>
        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#60a5fa', marginBottom: '8px' }}>
          {incident.target_asset_id}
        </div>
        <div style={{ fontSize: '0.82rem', color: '#d1d5db', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div><Navigation size={14} style={{ display: 'inline', marginRight: '6px' }} /> <strong>Coordinates:</strong> {incident.lat.toFixed(6)}° N, {incident.lon.toFixed(6)}° E</div>
          <div>📍 <strong>PIN Code:</strong> {incident.pincode} (Ward {incident.ward})</div>
          <div>⚡ <strong>DT / Feeder:</strong> {incident.dt_id} / {incident.feeder_id}</div>
          <div>🏘️ <strong>Impact:</strong> {incident.affected_households} Households ({incident.affected_pole_ids.length} Poles dark)</div>
        </div>
      </div>

      {/* Confidence & Reasoning */}
      <div className="section-box">
        <div className="section-title">Algorithmic Diagnostic Reasoning</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '0.85rem' }}>Confidence Score:</span>
          <span style={{ fontSize: '1rem', fontWeight: 700, color: incident.confidence_score > 80 ? '#34d399' : '#fbbf24' }}>
            {incident.confidence_score}%
          </span>
        </div>
        <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginBottom: '6px' }}>
          Topology Engine: <strong style={{ color: '#e5e7eb' }}>{incident.topology_source}</strong>
        </div>
        <div style={{ fontSize: '0.8rem', color: '#d1d5db', background: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: '6px' }}>
          {incident.confidence_reasoning}
        </div>
      </div>

      {/* AI Lineman Dispatch Brief */}
      {incident.ai_dispatch_brief && (
        <div className="section-box" style={{ border: '1px solid rgba(139,92,246,0.3)', background: 'rgba(139,92,246,0.05)' }}>
          <div className="section-title" style={{ color: '#c084fc', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Sparkles size={14} /> AI Lineman Dispatch Work Order
          </div>
          <pre className="mono-box" style={{ background: 'rgba(15,23,42,0.8)', color: '#e2e8f0', fontSize: '0.75rem' }}>
            {incident.ai_dispatch_brief}
          </pre>
        </div>
      )}

      {/* Workflow Action Buttons */}
      <div style={{ display: 'flex', gap: '10px', marginTop: 'auto' }}>
        {incident.status === 'detected' && (
          <button className="btn" style={{ flex: 1 }} onClick={handleAcknowledge} disabled={loading}>
            <UserCheck size={16} /> Acknowledge
          </button>
        )}

        {(incident.status === 'detected' || incident.status === 'acknowledged') && (
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={handleAssignCrew} disabled={loading}>
            <Wrench size={16} /> Assign Crew
          </button>
        )}

        {incident.status !== 'closed' && (
          <button className="btn btn-danger" style={{ flex: 1 }} onClick={handleResolve} disabled={loading}>
            <CheckCircle2 size={16} /> Mark Resolved
          </button>
        )}
      </div>
    </div>
  );
};
