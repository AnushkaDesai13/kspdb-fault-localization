import React, { useState } from 'react';
import { Play, ShieldAlert, Zap, Wrench, RefreshCw, X } from 'lucide-react';

interface SimulatorControlsProps {
  onClose: () => void;
  onRefresh: () => void;
}

export const SimulatorControls: React.FC<SimulatorControlsProps> = ({
  onClose,
  onRefresh,
}) => {
  const [faultType, setFaultType] = useState<'span' | 'dt' | 'feeder'>('span');
  const [targetId, setTargetId] = useState('P-1015');
  const [noisePoleId, setNoisePoleId] = useState('P-1050');
  const [repairTargetId, setRepairTargetId] = useState('P-1015');
  const [log, setLog] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleInjectFault = async () => {
    setLoading(true);
    setLog(null);
    try {
      const res = await fetch('/api/simulator/inject-fault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: faultType, target_id: targetId }),
      });
      const data = await res.json();
      setLog(`⚡ Fault Injected: ${faultType.toUpperCase()} on ${targetId}. ${data.affected_poles_count} poles went dark.`);
      onRefresh();
    } catch (e: any) {
      setLog(`❌ Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleInjectNoise = async () => {
    setLoading(true);
    setLog(null);
    try {
      const res = await fetch('/api/simulator/inject-noise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pole_id: noisePoleId }),
      });
      const data = await res.json();
      setLog(`⚠️ Noise Injected: Dead sensor on ${noisePoleId}. Downstream poles remain live (Sensor Fault).`);
      onRefresh();
    } catch (e: any) {
      setLog(`❌ Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRepairFault = async () => {
    setLoading(true);
    setLog(null);
    try {
      const res = await fetch('/api/simulator/repair-fault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_id: repairTargetId }),
      });
      const data = await res.json();
      setLog(`✅ Repair Telemetry Sent: ${data.restored_poles_count} poles re-energized. Auto-verifying ticket.`);
      onRefresh();
    } catch (e: any) {
      setLog(`❌ Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleResetGrid = async () => {
    setLoading(true);
    setLog(null);
    try {
      const res = await fetch('/api/simulator/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      setLog(`🔄 Grid Reset Complete: All 3,300+ poles restored to 100% steady state live power.`);
      onRefresh();
    } catch (e: any) {
      setLog(`❌ Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem' }}>
            <Zap color="#ec4899" /> KSPDB Fault & Noise Simulator
          </h3>
          <button className="btn btn-secondary" style={{ padding: '6px' }} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {log && (
          <div style={{ background: 'rgba(0,0,0,0.4)', padding: '10px 14px', borderRadius: '6px', fontSize: '0.8rem', color: '#a7f3d0', marginBottom: '16px', border: '1px solid var(--border-color)' }}>
            {log}
          </div>
        )}

        {/* Fault Injection Panel */}
        <div className="section-box" style={{ marginBottom: '14px' }}>
          <div className="section-title">1. Inject Physical Outage Fault</div>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
            <select
              value={faultType}
              onChange={(e) => setFaultType(e.target.value as any)}
              style={{ background: '#1f2937', color: '#fff', border: '1px solid var(--border-color)', padding: '8px', borderRadius: '6px', fontSize: '0.85rem' }}
            >
              <option value="span">Span Fault (LT Line Cut)</option>
              <option value="dt">Distribution Transformer Outage</option>
              <option value="feeder">11kV Feeder Outage</option>
            </select>
            <input
              type="text"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              placeholder="e.g. P-1015 or D-01-01-1"
              style={{ flex: 1, background: '#1f2937', color: '#fff', border: '1px solid var(--border-color)', padding: '8px', borderRadius: '6px', fontSize: '0.85rem' }}
            />
          </div>
          <button className="btn btn-danger" style={{ width: '100%' }} onClick={handleInjectFault} disabled={loading}>
            <Play size={16} /> Trigger Fault Telemetry
          </button>
        </div>

        {/* Noise Injection Panel */}
        <div className="section-box" style={{ marginBottom: '14px' }}>
          <div className="section-title">2. Inject Dead Sensor Noise (False Alarm Test)</div>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
            <input
              type="text"
              value={noisePoleId}
              onChange={(e) => setNoisePoleId(e.target.value)}
              placeholder="e.g. P-1050"
              style={{ flex: 1, background: '#1f2937', color: '#fff', border: '1px solid var(--border-color)', padding: '8px', borderRadius: '6px', fontSize: '0.85rem' }}
            />
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={handleInjectNoise} disabled={loading}>
              <ShieldAlert size={16} /> Fail Sensor Only
            </button>
          </div>
        </div>

        {/* Repair & Auto-Verification Panel */}
        <div className="section-box" style={{ marginBottom: '14px' }}>
          <div className="section-title">3. Repair & Auto-Verify Telemetry</div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="text"
              value={repairTargetId}
              onChange={(e) => setRepairTargetId(e.target.value)}
              placeholder="Target Pole or DT ID"
              style={{ flex: 1, background: '#1f2937', color: '#fff', border: '1px solid var(--border-color)', padding: '8px', borderRadius: '6px', fontSize: '0.85rem' }}
            />
            <button className="btn" style={{ background: '#10b981', flex: 1 }} onClick={handleRepairFault} disabled={loading}>
              <Wrench size={16} /> Send Power Restored
            </button>
          </div>
        </div>

        {/* Reset Grid Button */}
        <button className="btn btn-secondary" style={{ width: '100%', borderColor: '#3b82f6', color: '#60a5fa' }} onClick={handleResetGrid} disabled={loading}>
          <RefreshCw size={16} /> Reset Entire Grid (Restore All Power to 100%)
        </button>
      </div>
    </div>
  );
};
