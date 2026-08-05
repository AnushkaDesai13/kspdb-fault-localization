# Architectural Decision Records (ADRs) & Assumptions Log

## ADR 001: Deterministic Graph Traversal over LLM for Fault Localization
- **Status:** Accepted
- **Context:** Brief interrogated whether an LLM should perform fault localization.
- **Decision:** Use 100% deterministic graph frontier analysis.
- **Rationale:** Graph traversal is O(V+E), instantaneous (< 10ms), free, 100% reproducible, and zero hallucination risk. An LLM is slow, expensive, and non-deterministic for graph boundaries.

## ADR 002: Spatial Minimum Spanning Tree (MST) for Missing 60% Topology
- **Status:** Accepted
- **Context:** 60% of DTs have missing `seq_on_line` and `parent_pole_id`.
- **Decision:** Construct a spatial MST anchored at DT coordinates using Haversine physical distance.
- **Rationale:** Physical low-tension pole lines follow shortest physical paths along streets. MST provides a highly accurate topological tree approximation while degrading confidence score transparently (75–85%) in the UI.

## ADR 003: Isolated Dark Pole Sensor Fault Filtering
- **Status:** Accepted
- **Context:** Devices fail independently; single dark poles can confuse operators.
- **Decision:** If a dark pole's downstream monitored children are LIVE, flag state as `SENSOR_FAULT` and suppress outage ticket.
- **Rationale:** Physically impossible for a line cut to leave downstream poles energized. Prevents operator alert fatigue.

## ADR 004: Telemetry-Driven Ticket Auto-Verification
- **Status:** Accepted
- **Context:** Linemen often mark tickets fixed prematurely.
- **Decision:** Ticket status transitions to `closed` only when telemetry confirms `energized: true` across all affected poles. Rejects manual resolution claims if dark poles persist.
- **Rationale:** Guarantees control room operations reflect physical truth rather than manual guesswork.

---

## Assumptions Log

1. **Topology Stability:** Pole locations and DT mappings remain static during active outage incidents.
2. **Scheduled Outage Grace Period:** Planned load shedding maintenance can overrun by up to 40 minutes; matcher includes a 40-minute grace window before treating dark poles as unscheduled emergency faults.
3. **Pincode Fallback:** Missing pincodes (~3%) default to nearest pole ward pincode (`560078`).
