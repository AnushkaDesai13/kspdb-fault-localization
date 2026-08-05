import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';

import { generateSeedNetwork } from './seed/seedDataGenerator';
import { NetworkGraph } from './topology/networkGraph';
import { TelemetryProcessor } from './ingest/telemetryProcessor';
import { ScheduledOutageMatcher } from './localization/scheduledOutageMatcher';
import { FaultDetector } from './localization/faultDetector';
import { TicketEngine } from './tickets/ticketEngine';
import { AIDispatchBriefGenerator } from './ai/dispatchBrief';
import { FaultSimulator } from './simulator/faultSimulator';
import { TelemetryPayload, ScheduledOutage } from './types';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// 1. Initialize Network Data & Services
const seedData = generateSeedNetwork();
const networkGraph = new NetworkGraph();
networkGraph.initialize(seedData.substations, seedData.feeders, seedData.transformers, seedData.poles);

const telemetryProcessor = new TelemetryProcessor(networkGraph);
const outageMatcher = new ScheduledOutageMatcher();
const faultDetector = new FaultDetector(networkGraph, telemetryProcessor, outageMatcher);
const ticketEngine = new TicketEngine(faultDetector, telemetryProcessor);
const aiBriefGenerator = new AIDispatchBriefGenerator();
const faultSimulator = new FaultSimulator(networkGraph, telemetryProcessor, outageMatcher);

// Seed initial steady state telemetry
faultSimulator.initializeSteadyState();

// Seed initial mock scheduled outage
const initialOutages: ScheduledOutage[] = [
  {
    id: 'SO-2026-07-29-014',
    scope: 'feeder',
    target_id: 'F-01-03',
    start: new Date(Date.now() - 3600000).toISOString(),
    end: new Date(Date.now() + 3600000).toISOString(),
    reason: 'Planned maintenance - jumper replacement on 11kV line',
  },
];
outageMatcher.setOutages(initialOutages);

// Helper: Broadcast WebSocket updates to control room clients
function broadcast(event: string, data: any) {
  const payload = JSON.stringify({ event, data });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// Background loop for automatic ticket evaluation & verification (every 3 seconds)
setInterval(() => {
  const incidents = faultDetector.detectFaults();
  const autoVerified = ticketEngine.evaluateAutoVerification();

  if (autoVerified.length > 0) {
    broadcast('INCIDENTS_UPDATED', incidents);
  }
}, 3000);

// --- REST API ENDPOINTS ---

// Network Metadata Summary
app.get('/api/network/summary', (req, res) => {
  const totalPoles = networkGraph.poles.size;
  const knownTopDts = Array.from(networkGraph.transformers.values()).filter((dt) => dt.has_known_topology).length;
  const totalDts = networkGraph.transformers.size;

  res.json({
    substations_count: networkGraph.substations.size,
    feeders_count: networkGraph.feeders.size,
    dt_count: totalDts,
    known_topology_dts: knownTopDts,
    missing_topology_dts: totalDts - knownTopDts,
    missing_topology_percentage: Math.round(((totalDts - knownTopDts) / totalDts) * 100),
    total_poles: totalPoles,
    monitored_poles: Array.from(networkGraph.poles.values()).filter((p) => p.device_id !== null).length,
    unmonitored_poles: Array.from(networkGraph.poles.values()).filter((p) => p.device_id === null).length,
  });
});

// Get Poles for Map
app.get('/api/network/poles', (req, res) => {
  const poleList = Array.from(networkGraph.poles.values()).map((p) => {
    const state = telemetryProcessor.getPoleState(p.pole_id);
    return {
      ...p,
      energized: state ? state.energized : true,
      last_seen: state ? state.last_seen : null,
    };
  });
  res.json(poleList);
});

// Telemetry Single Ingestion Endpoint
app.post('/api/telemetry', (req, res) => {
  const payload: TelemetryPayload = req.body;
  const result = telemetryProcessor.processPayload(payload);

  const incidents = faultDetector.detectFaults();
  broadcast('INCIDENTS_UPDATED', incidents);

  res.json({ status: result.status, reason: result.reason });
});

// Telemetry Burst Ingestion Endpoint
app.post('/api/telemetry/burst', (req, res) => {
  const payloads: TelemetryPayload[] = req.body.payloads || [];
  const result = telemetryProcessor.processBatch(payloads);

  const incidents = faultDetector.detectFaults();
  broadcast('INCIDENTS_UPDATED', incidents);

  res.json(result);
});

// Get All Detected Incidents
app.get('/api/incidents', (req, res) => {
  const incidents = faultDetector.detectFaults();
  // Attach AI dispatch brief to each incident
  const enriched = incidents.map((inc) => ({
    ...inc,
    ai_dispatch_brief: aiBriefGenerator.generateBrief(inc),
  }));
  res.json(enriched);
});

// Single Incident Detail
app.get('/api/incidents/:id', (req, res) => {
  const incident = faultDetector.getIncidentById(req.params.id);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });

  res.json({
    ...incident,
    ai_dispatch_brief: aiBriefGenerator.generateBrief(incident),
  });
});

// Ticket Workflow Endpoints
app.post('/api/incidents/:id/acknowledge', (req, res) => {
  try {
    const updated = ticketEngine.acknowledgeTicket(req.params.id);
    broadcast('INCIDENTS_UPDATED', faultDetector.detectFaults());
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/incidents/:id/assign-crew', (req, res) => {
  try {
    const crewName = req.body.crew_name || 'Line Crew Alpha-4';
    const updated = ticketEngine.assignCrew(req.params.id, crewName);
    broadcast('INCIDENTS_UPDATED', faultDetector.detectFaults());
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/incidents/:id/resolve', (req, res) => {
  try {
    const result = ticketEngine.resolveTicketManual(req.params.id);
    broadcast('INCIDENTS_UPDATED', faultDetector.detectFaults());

    if (!result.success) {
      return res.status(422).json({ error: result.message, incident: result.incident });
    }
    res.json(result.incident);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Scheduled Outages Feed Endpoint
app.get('/api/scheduled-outages', (req, res) => {
  res.json(initialOutages);
});

app.post('/api/scheduled-outages', (req, res) => {
  const newOutage: ScheduledOutage = req.body;
  initialOutages.push(newOutage);
  outageMatcher.setOutages(initialOutages);
  res.json({ status: 'CREATED', outage: newOutage });
});

// Simulator Trigger Endpoints
app.post('/api/simulator/inject-fault', (req, res) => {
  const { type, target_id } = req.body; // type: 'span' | 'dt' | 'feeder'
  if (!type || !target_id) return res.status(400).json({ error: 'Missing type or target_id' });

  const result = faultSimulator.injectFault(type, target_id);
  const incidents = faultDetector.detectFaults();
  broadcast('INCIDENTS_UPDATED', incidents);

  res.json(result);
});

app.post('/api/simulator/inject-noise', (req, res) => {
  const { pole_id } = req.body;
  if (!pole_id) return res.status(400).json({ error: 'Missing pole_id' });

  const result = faultSimulator.injectSensorNoise(pole_id);
  const incidents = faultDetector.detectFaults();
  broadcast('INCIDENTS_UPDATED', incidents);

  res.json(result);
});

app.post('/api/simulator/repair-fault', (req, res) => {
  const { target_id } = req.body; // fault_id or target_id
  if (!target_id) return res.status(400).json({ error: 'Missing target_id' });

  const result = faultSimulator.repairFault(target_id);

  // Trigger auto verification evaluation
  ticketEngine.evaluateAutoVerification();
  const incidents = faultDetector.detectFaults();
  broadcast('INCIDENTS_UPDATED', incidents);

  res.json(result);
});

app.post('/api/simulator/reset', (req, res) => {
  faultSimulator.initializeSteadyState();
  faultDetector.resetAllIncidents();
  ticketEngine.evaluateAutoVerification();
  const incidents = faultDetector.detectFaults();
  broadcast('INCIDENTS_UPDATED', incidents);
  res.json({ status: 'RESET', message: 'All grid poles restored to steady-state live telemetry.' });
});

app.get('/api/simulator/active-faults', (req, res) => {
  res.json(faultSimulator.getActiveFaults());
});

app.get('/api/ingest/metrics', (req, res) => {
  res.json(telemetryProcessor.getMetrics());
});

// Serve frontend static files in production
const frontendBuildPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendBuildPath));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'API endpoint not found' });
  res.sendFile(path.join(frontendBuildPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`⚡ KSPDB Control Room Operations Server running on http://localhost:${PORT}`);
});
