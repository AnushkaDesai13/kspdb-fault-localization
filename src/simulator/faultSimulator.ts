import { NetworkGraph } from '../topology/networkGraph';
import { TelemetryProcessor } from '../ingest/telemetryProcessor';
import { ScheduledOutageMatcher } from '../localization/scheduledOutageMatcher';
import { TelemetryPayload, ScheduledOutage } from '../types';

export class FaultSimulator {
  private networkGraph: NetworkGraph;
  private telemetryProcessor: TelemetryProcessor;
  private outageMatcher: ScheduledOutageMatcher;
  private activeSimulatedFaults = new Map<string, { type: string; affectedPoleIds: string[]; injectedAt: string }>();

  constructor(
    networkGraph: NetworkGraph,
    telemetryProcessor: TelemetryProcessor,
    outageMatcher: ScheduledOutageMatcher
  ) {
    this.networkGraph = networkGraph;
    this.telemetryProcessor = telemetryProcessor;
    this.outageMatcher = outageMatcher;
  }

  /**
   * Initializes steady-state telemetry: All monitored poles reporting energized: true heartbeats.
   */
  public initializeSteadyState() {
    const now = new Date().toISOString();
    const payloads: TelemetryPayload[] = [];

    let seq = 100;
    this.networkGraph.poles.forEach((pole) => {
      if (pole.device_id) {
        payloads.push({
          device_id: pole.device_id,
          pole_id: pole.pole_id,
          event: 'heartbeat',
          energized: true,
          ts: now,
          seq: seq++,
          battery_mv: 3600,
          rssi: -75,
          fw: (pole.pole_id.endsWith('7') ? '1.2.0' : '1.4.2'),
        });
      }
    });

    this.telemetryProcessor.processBatch(payloads);
  }

  /**
   * Inject a Span, DT, or Feeder fault.
   */
  public injectFault(type: 'span' | 'dt' | 'feeder', targetId: string): { fault_id: string; affected_poles_count: number } {
    let affectedPoleIds: string[] = [];
    const faultId = `SIM-FAULT-${type.toUpperCase()}-${Date.now()}`;

    if (type === 'span') {
      // targetId is pole_id where fault starts
      affectedPoleIds = this.networkGraph.getDownstreamPoles(targetId, true).map((p) => p.pole_id);
    } else if (type === 'dt') {
      affectedPoleIds = this.networkGraph.dtPolesMap.get(targetId) || [];
    } else if (type === 'feeder') {
      affectedPoleIds = Array.from(this.networkGraph.poles.values())
        .filter((p) => p.feeder_id === targetId)
        .map((p) => p.pole_id);
    }

    const payloads: TelemetryPayload[] = [];
    const now = Date.now();

    affectedPoleIds.forEach((poleId, idx) => {
      const pole = this.networkGraph.getPole(poleId);
      if (!pole || !pole.device_id) return;

      const fw = pole.pole_id.endsWith('7') ? '1.2.0' : '1.4.2';

      // FW 1.2.0 does NOT send power_lost at all
      if (fw === '1.2.0') return;

      // 30% lost dying packets due to capacitor reserve exhaustion
      if (idx % 10 < 3) return; // Drop 30%

      // ±90s clock skew jitter
      const jitterMs = (Math.random() * 180 - 90) * 1000;
      const ts = new Date(now + jitterMs).toISOString();

      payloads.push({
        device_id: pole.device_id,
        pole_id: pole.pole_id,
        event: 'power_lost',
        energized: false,
        ts,
        seq: Date.now() + idx,
        battery_mv: 3300,
        rssi: -82,
        fw,
      });
    });

    this.telemetryProcessor.processBatch(payloads);

    this.activeSimulatedFaults.set(faultId, {
      type,
      affectedPoleIds,
      injectedAt: new Date().toISOString(),
    });

    return { fault_id: faultId, affected_poles_count: affectedPoleIds.length };
  }

  /**
   * Inject sensor fault noise (single dead sensor while power remains fine).
   */
  public injectSensorNoise(poleId: string): { status: string; message: string } {
    const pole = this.networkGraph.getPole(poleId);
    if (!pole || !pole.device_id) {
      throw new Error(`Pole ${poleId} has no telemetry device`);
    }

    this.telemetryProcessor.processPayload({
      device_id: pole.device_id,
      pole_id: pole.pole_id,
      event: 'power_lost',
      energized: false,
      ts: new Date().toISOString(),
      seq: Date.now(),
      battery_mv: 2800, // capacitor failure
      rssi: -105,
      fw: '1.4.2',
    });

    return { status: 'NOISE_INJECTED', message: `Sensor failure injected on device ${pole.device_id} at Pole ${poleId}` };
  }

  /**
   * Inject scheduled outage.
   */
  public injectScheduledOutage(outage: ScheduledOutage) {
    const current = this.outageMatcher;
    // Push into scheduled outages feed
    current.setOutages([outage]);
  }

  /**
   * Repair a fault and transmit restoration telemetry.
   */
  public repairFault(targetId: string): { restored_poles_count: number } {
    let poleIdsToRestore: string[] = [];

    // Find if targetId is a fault_id or pole_id/dt_id/feeder_id
    if (this.activeSimulatedFaults.has(targetId)) {
      poleIdsToRestore = this.activeSimulatedFaults.get(targetId)!.affectedPoleIds;
      this.activeSimulatedFaults.delete(targetId);
    } else {
      // Find matching poles
      const pole = this.networkGraph.getPole(targetId);
      if (pole) {
        poleIdsToRestore = this.networkGraph.getDownstreamPoles(targetId, true).map((p) => p.pole_id);
      } else {
        poleIdsToRestore = this.networkGraph.dtPolesMap.get(targetId) || [];
      }
    }

    const payloads: TelemetryPayload[] = [];
    const now = new Date().toISOString();

    poleIdsToRestore.forEach((poleId, idx) => {
      const pole = this.networkGraph.getPole(poleId);
      if (!pole || !pole.device_id) return;

      payloads.push({
        device_id: pole.device_id,
        pole_id: pole.pole_id,
        event: 'power_restored',
        energized: true,
        ts: now,
        seq: Date.now() + idx + 1000,
        battery_mv: 3700,
        rssi: -72,
        fw: '1.4.2',
      });
    });

    this.telemetryProcessor.processBatch(payloads);

    return { restored_poles_count: poleIdsToRestore.length };
  }

  public getActiveFaults() {
    return Array.from(this.activeSimulatedFaults.entries()).map(([id, val]) => ({ id, ...val }));
  }
}
