import React, { useState, useEffect } from 'react';
import { Zap, AlertTriangle, ShieldCheck, Cpu, SlidersHorizontal, RefreshCw } from 'lucide-react';
import { OperatorMap } from './components/OperatorMap';
import { IncidentList } from './components/IncidentList';
import { IncidentDetail } from './components/IncidentDetail';
import { SimulatorControls } from './components/SimulatorControls';

interface NetworkSummary {
  substations_count: number;
  feeders_count: number;
  dt_count: number;
  missing_topology_percentage: number;
  total_poles: number;
  monitored_poles: number;
  unmonitored_poles: number;
}

export function App() {
  const [summary, setSummary] = useState<NetworkSummary | null>(null);
  const [poles, setPoles] = useState<any[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<any | null>(null);
  const [showSimulator, setShowSimulator] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    try {
      const [sumRes, polesRes, incRes] = await Promise.all([
        fetch('/api/network/summary'),
        fetch('/api/network/poles'),
        fetch('/api/incidents'),
      ]);

      const sumData = await sumRes.json();
      const polesData = await polesRes.json();
      const incData = await incRes.json();

      setSummary(sumData);
      setPoles(polesData);
      setIncidents(incData);

      // Keep selected incident reference updated
      if (selectedIncident) {
        const found = incData.find((i: any) => i.id === selectedIncident.id);
        if (found) setSelectedIncident(found);
      }
    } catch (err) {
      console.error('Error fetching system telemetry:', err);
    }
  };

  useEffect(() => {
    fetchData();

    // WebSocket live feed subscription
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === 'INCIDENTS_UPDATED') {
          setIncidents(msg.data);
          fetchData();
        }
      } catch (e) {
        console.error(e);
      }
    };

    const interval = setInterval(fetchData, 5000);
    return () => {
      clearInterval(interval);
      ws.close();
    };
  }, []);

  const activeIncidentsCount = incidents.filter((i) => i.status !== 'closed').length;

  return (
    <div className="app-container">
      {/* Top Navbar */}
      <header className="navbar">
        <div className="brand">
          <div className="brand-logo">
            <Zap color="#fff" size={20} />
          </div>
          <div>
            <div className="brand-title">Karnataka State Power Distribution Board</div>
            <div className="brand-sub">Sub-division Control Room Outage Operations & Fault Localization Platform</div>
          </div>
        </div>

        <div className="nav-stats">
          <div className="stat-pill">
            <span className={`stat-dot ${activeIncidentsCount > 0 ? 'red' : 'green'}`} />
            <span>Active Outages: <strong>{activeIncidentsCount}</strong></span>
          </div>

          <div className="stat-pill">
            <Cpu size={14} color="#3b82f6" />
            <span>Topology Engine: <strong>60% Inferred (MST)</strong></span>
          </div>

          <div className="stat-pill">
            <ShieldCheck size={14} color="#10b981" />
            <span>Monitored Poles: <strong>{summary?.monitored_poles || 0}</strong> ({summary?.unmonitored_poles || 0} Gap)</span>
          </div>

          <button className="btn btn-secondary" style={{ padding: '6px 12px' }} onClick={fetchData}>
            <RefreshCw size={14} /> Sync
          </button>
        </div>
      </header>

      {/* Main Workplace: Map + Sidebar */}
      <div className="main-layout">
        <OperatorMap
          poles={poles}
          incidents={incidents}
          selectedIncident={selectedIncident}
          onSelectIncident={(inc) => setSelectedIncident(inc)}
        />

        <aside className="sidebar">
          <div className="sidebar-header">
            <h3 style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={18} color="#ef4444" /> Outage Incident Queue
            </h3>
          </div>

          {selectedIncident ? (
            <IncidentDetail
              incident={selectedIncident}
              onClose={() => setSelectedIncident(null)}
              onRefresh={fetchData}
            />
          ) : (
            <IncidentList
              incidents={incidents}
              selectedIncident={selectedIncident}
              onSelectIncident={(inc) => setSelectedIncident(inc)}
            />
          )}
        </aside>

        {/* Floating Simulator Trigger FAB */}
        <button className="fab-sim" onClick={() => setShowSimulator(true)}>
          <SlidersHorizontal size={18} /> Launch Fault Simulator
        </button>

        {/* Simulator Modal */}
        {showSimulator && (
          <SimulatorControls
            onClose={() => setShowSimulator(false)}
            onRefresh={fetchData}
          />
        )}
      </div>
    </div>
  );
}

export default App;
