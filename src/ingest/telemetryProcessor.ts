import { TelemetryPayload, IngestMetrics } from '../types';
import { NetworkGraph } from '../topology/networkGraph';

export class TelemetryProcessor {
  private networkGraph: NetworkGraph;
  private latestSeqPerDevice = new Map<string, number>();
  private latestStatePerPole = new Map<string, { energized: boolean; last_seen: string; seq: number }>();
  private metrics: IngestMetrics = {
    total_processed: 0,
    duplicates_rejected: 0,
    stale_rejected: 0,
    sensor_faults_isolated: 0,
    last_burst_rate_mps: 0,
  };

  constructor(networkGraph: NetworkGraph) {
    this.networkGraph = networkGraph;
  }

  public processPayload(payload: TelemetryPayload): { status: 'ACCEPTED' | 'DUPLICATE' | 'STALE' | 'IGNORED'; reason?: string } {
    this.metrics.total_processed++;

    const deviceId = payload.device_id;
    const lastSeq = this.latestSeqPerDevice.get(deviceId);

    // Boot resets sequence counter
    if (payload.event === 'boot') {
      this.latestSeqPerDevice.set(deviceId, payload.seq);
    } else if (lastSeq !== undefined && payload.seq <= lastSeq) {
      // Duplicate or out-of-order stale sequence
      this.metrics.duplicates_rejected++;
      return { status: 'DUPLICATE', reason: `Sequence ${payload.seq} <= latest seen ${lastSeq}` };
    } else {
      this.latestSeqPerDevice.set(deviceId, payload.seq);
    }

    // Resolve pole ID from payload or device mapping registry
    const pole = this.networkGraph.getPoleByDeviceId(deviceId) || this.networkGraph.getPole(payload.pole_id);
    if (!pole) {
      return { status: 'IGNORED', reason: 'Pole not found in registry' };
    }

    // Update pole state in memory store
    this.latestStatePerPole.set(pole.pole_id, {
      energized: payload.energized,
      last_seen: payload.ts,
      seq: payload.seq,
    });

    return { status: 'ACCEPTED' };
  }

  public processBatch(payloads: TelemetryPayload[]): { accepted: number; duplicates: number; rejected: number } {
    let accepted = 0;
    let duplicates = 0;
    let rejected = 0;

    const startTime = Date.now();

    for (const payload of payloads) {
      const res = this.processPayload(payload);
      if (res.status === 'ACCEPTED') accepted++;
      else if (res.status === 'DUPLICATE') duplicates++;
      else rejected++;
    }

    const durationSeconds = (Date.now() - startTime) / 1000 || 0.001;
    this.metrics.last_burst_rate_mps = Math.round(payloads.length / durationSeconds);

    return { accepted, duplicates, rejected };
  }

  public getPoleState(poleId: string): { energized: boolean; last_seen?: string } | undefined {
    return this.latestStatePerPole.get(poleId);
  }

  public getAllPoleStates(): Map<string, { energized: boolean; last_seen: string; seq: number }> {
    return this.latestStatePerPole;
  }

  public getMetrics(): IngestMetrics {
    return { ...this.metrics };
  }
}
