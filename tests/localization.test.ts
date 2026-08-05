import { generateSeedNetwork } from '../src/seed/seedDataGenerator';
import { NetworkGraph } from '../src/topology/networkGraph';
import { TelemetryProcessor } from '../src/ingest/telemetryProcessor';
import { ScheduledOutageMatcher } from '../src/localization/scheduledOutageMatcher';
import { FaultDetector } from '../src/localization/faultDetector';
import { TicketEngine } from '../src/tickets/ticketEngine';
import { FaultSimulator } from '../src/simulator/faultSimulator';

describe('KSPDB Fault Localization Engine Test Suite', () => {
  let networkGraph: NetworkGraph;
  let telemetryProcessor: TelemetryProcessor;
  let outageMatcher: ScheduledOutageMatcher;
  let faultDetector: FaultDetector;
  let ticketEngine: TicketEngine;
  let faultSimulator: FaultSimulator;

  beforeEach(() => {
    const seed = generateSeedNetwork();
    networkGraph = new NetworkGraph();
    networkGraph.initialize(seed.substations, seed.feeders, seed.transformers, seed.poles);

    telemetryProcessor = new TelemetryProcessor(networkGraph);
    outageMatcher = new ScheduledOutageMatcher();
    faultDetector = new FaultDetector(networkGraph, telemetryProcessor, outageMatcher);
    ticketEngine = new TicketEngine(faultDetector, telemetryProcessor);
    faultSimulator = new FaultSimulator(networkGraph, telemetryProcessor, outageMatcher);

    faultSimulator.initializeSteadyState();
  });

  test('Single Span Fault produces exactly 1 localized SPAN_FAULT incident ticket', () => {
    const dt = Array.from(networkGraph.transformers.values()).find((d) => d.has_known_topology)!;
    const poles = networkGraph.dtPolesMap.get(dt.dt_id)!;
    const targetPoleId = poles[40];

    faultSimulator.injectFault('span', targetPoleId);

    const incidents = faultDetector.detectFaults();
    const spanFaults = incidents.filter((i) => i.fault_type === 'SPAN_FAULT' && i.status !== 'closed');

    expect(spanFaults.length).toBe(1);
    expect(spanFaults[0].dt_id).toBe(dt.dt_id);
    expect(spanFaults[0].span_end_pole_id).toBeDefined();
    expect(spanFaults[0].confidence_score).toBeGreaterThanOrEqual(90);
  });

  test('DT Outage creates exactly 1 DT_FAULT incident and groups all dark poles', () => {
    const dt = Array.from(networkGraph.transformers.values())[0];

    faultSimulator.injectFault('dt', dt.dt_id);

    const incidents = faultDetector.detectFaults();
    const dtFaults = incidents.filter((i) => i.fault_type === 'DT_FAULT' && i.status !== 'closed');

    expect(dtFaults.length).toBe(1);
    expect(dtFaults[0].target_asset_id).toBe(dt.dt_id);
    expect(dtFaults[0].affected_pole_ids.length).toBe(70);
  });

  test('Missing Topology (60%) DT produces valid SPAN_FAULT ticket using Spatial MST', () => {
    const dt = Array.from(networkGraph.transformers.values()).find((d) => !d.has_known_topology)!;
    const poles = networkGraph.dtPolesMap.get(dt.dt_id)!;

    faultSimulator.injectFault('span', poles[5]);

    const incidents = faultDetector.detectFaults();
    const spanFaults = incidents.filter((i) => i.dt_id === dt.dt_id && i.status !== 'closed');

    expect(spanFaults.length).toBeGreaterThanOrEqual(1);
    expect(spanFaults[0].topology_source).toBe('SPATIAL_MST_INFERRED');
  });

  test('Dead sensor noise produces ZERO outage tickets (Isolated Sensor Fault)', () => {
    const dt = Array.from(networkGraph.transformers.values())[0];
    const poles = networkGraph.dtPolesMap.get(dt.dt_id)!;
    const parentPoleId = poles[5];

    faultSimulator.injectSensorNoise(parentPoleId);

    const incidents = faultDetector.detectFaults();
    const activeOutageIncidents = incidents.filter((i) => i.status !== 'closed');

    expect(activeOutageIncidents.length).toBe(0);
  });

  test('Scheduled load shedding produces ZERO emergency fault tickets', () => {
    const dt = Array.from(networkGraph.transformers.values())[0];

    // Add scheduled outage entry
    outageMatcher.setOutages([
      {
        id: 'SO-TEST',
        scope: 'dt',
        target_id: dt.dt_id,
        start: new Date(Date.now() - 60000).toISOString(),
        end: new Date(Date.now() + 3600000).toISOString(),
        reason: 'Scheduled maintenance',
      },
    ]);

    faultSimulator.injectFault('dt', dt.dt_id);

    const incidents = faultDetector.detectFaults();
    const dtIncidents = incidents.filter((i) => i.target_asset_id === dt.dt_id && i.status !== 'closed');

    expect(dtIncidents.length).toBe(0);
  });

  test('Telemetry restoration auto-verifies and closes ticket', () => {
    const dt = Array.from(networkGraph.transformers.values())[0];
    const faultRes = faultSimulator.injectFault('dt', dt.dt_id);

    let incidents = faultDetector.detectFaults();
    expect(incidents.length).toBe(1);
    expect(incidents[0].status).toBe('detected');

    // Repair fault
    faultSimulator.repairFault(faultRes.fault_id);

    // Run auto-verification
    ticketEngine.evaluateAutoVerification();
    incidents = faultDetector.detectFaults();

    const closed = incidents.find((i) => i.target_asset_id === dt.dt_id);
    expect(closed).toBeDefined();
    expect(closed!.status).toBe('closed');
  });

  test('Manual resolution is REJECTED if telemetry shows poles remain dark', () => {
    const dt = Array.from(networkGraph.transformers.values())[0];
    faultSimulator.injectFault('dt', dt.dt_id);

    const incidents = faultDetector.detectFaults();
    const incidentId = incidents[0].id;

    // Attempt manual resolution while poles are dark
    const res = ticketEngine.resolveTicketManual(incidentId);

    expect(res.success).toBe(false);
    expect(res.message).toContain('Resolution rejected');
  });
});
