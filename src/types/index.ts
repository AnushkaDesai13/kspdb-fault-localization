export type FirmwareVersion = '1.4.2' | '1.3.0' | '1.2.0';

export interface Pole {
  pole_id: string;
  lat: number;
  lon: number;
  feeder_id: string;
  dt_id: string;
  seq_on_line: number | null; // null for ~60% missing topology
  parent_pole_id: string | null; // null for ~60% missing topology
  pole_type: string;
  ward: string;
  pincode: string | null; // null for ~3% rows
  device_id: string | null; // null for ~9% unmonitored poles
}

export interface DistributionTransformer {
  dt_id: string;
  feeder_id: string;
  lat: number;
  lon: number;
  capacity_kva: number;
  households_served: number;
  has_known_topology: boolean;
}

export interface Feeder {
  feeder_id: string;
  substation_id: string;
  name: string;
}

export interface Substation {
  substation_id: string;
  name: string;
  lat: number;
  lon: number;
}

export type EventType = 'heartbeat' | 'power_lost' | 'power_restored' | 'boot';

export interface TelemetryPayload {
  device_id: string;
  pole_id: string;
  event: EventType;
  energized: boolean;
  ts: string; // ISO 8601 string
  seq: number;
  battery_mv: number;
  rssi: number;
  fw: FirmwareVersion | string;
}

export type FaultType = 'SPAN_FAULT' | 'DT_FAULT' | 'FEEDER_FAULT' | 'SENSOR_FAULT';

export type TicketStatus = 'detected' | 'acknowledged' | 'crew_assigned' | 'resolved' | 'verified' | 'closed';

export interface Incident {
  id: string;
  fault_type: FaultType;
  target_asset_id: string; // span id (e.g. "P-010-P-011"), DT id, or Feeder id
  span_start_pole_id?: string;
  span_end_pole_id?: string;
  boundary_pole_ids: string[];
  lat: number;
  lon: number;
  pincode: string;
  ward: string;
  dt_id: string;
  feeder_id: string;
  affected_pole_ids: string[];
  affected_households: number;
  confidence_score: number; // 0 - 100
  confidence_reasoning: string;
  topology_source: 'EXPLICIT_REGISTRY' | 'SPATIAL_MST_INFERRED' | 'DT_AGGREGATE_FALLBACK';
  status: TicketStatus;
  detected_at: string;
  updated_at: string;
  resolved_at?: string;
  assigned_crew?: string;
  rejection_reason?: string;
  ai_dispatch_brief?: string;
}

export interface ScheduledOutage {
  id: string;
  scope: 'feeder' | 'dt';
  target_id: string;
  start: string;
  end: string;
  reason: string;
}

export interface IngestMetrics {
  total_processed: number;
  duplicates_rejected: number;
  stale_rejected: number;
  sensor_faults_isolated: number;
  last_burst_rate_mps: number;
}
