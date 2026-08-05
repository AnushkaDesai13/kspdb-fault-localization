# System Architecture & Technical Specification

## 1. System Dataflow & Diagram

```
 [Pole Devices (34,900)] ──(HTTPS/Telemetry)──> [Ingest Pipeline / Dedup Queue]
                                                         │
                                               [Network Graph & State]
                                                         │
                                        ┌────────────────┴────────────────┐
                                        ▼                                 ▼
                         [Scheduled Outage Matcher]           [Spatial MST Engine]
                                        │                     (60% Missing Data)
                                        └────────────────┬────────────────┘
                                                         │
                                                         ▼
                                             [Fault Detector Engine]
                                            (Frontier Boundary Graph)
                                                         │
                                                         ▼
                                              [Ticket Engine & Auto-Verifier]
                                                         │
                                           ┌─────────────┴─────────────┐
                                           ▼                           ▼
                             [AI Dispatch Brief Gen]     [WebSocket Live Broadcast]
                                           │                           │
                                           └─────────────┬─────────────┘
                                                         │
                                                         ▼
                                           [Operator Console UI (React)]
```

---

## 2. Ingestion & Resilient Data Pipeline

- **Volume Handling:** 39 msg/s steady state; 5,000 msg/10s burst buffer handled via non-blocking memory queue.
- **Sequence Number (`seq`):** Monotonic sequence counter per device. Rejects duplicates and late out-of-order packets. Resets on `boot`.
- **Clock Skew Window:** Accepts device timestamps within a ±90s jitter window without discarding valid event data.
- **Firmware 1.2.x & Capacitor Exhaustion:** Detects missed heartbeats (>30 mins) for fw 1.2 devices; handles 30% lost `power_lost` packets by analyzing downstream node states.

---

## 3. Storage & Topology Model (Handling 60% Missing Data)

The network is a radial tree graph. For 40% of DTs with explicit registry data (`seq_on_line`, `parent_pole_id`), parent links are directly mapped.

For 60% of DTs with missing line ordering:
- **Spatial MST Reconstruction:** Applies Prim's Minimum Spanning Tree algorithm anchored at the Distribution Transformer GPS location using Euclidean/Haversine distance between poles.
- **Confidence Scoring:**
  - Explicit Registry: 95% Confidence
  - Spatial MST Inferred: 75–85% Confidence
  - Unmonitored Poles Present: Reduces confidence by 10% and expands span range bounding box.

---

## 4. Fault Localization Algorithm

- **Edge Frontier Analysis:** Finds the last LIVE pole (`P_upstream`) and first DARK pole (`P_downstream`). Fault is localized to the span between them.
- **Symptom Aggregation:** Aggregates all dark poles downstream of `P_downstream` into **1 single incident ticket** (preventing 40 separate alerts).
- **Equipment Fault Isolation:**
  - 100% dark poles under DT → `DT_FAULT` at Transformer.
  - 85%+ dark poles across feeder → `FEEDER_FAULT` at Substation breaker.
- **Noise Elimination:**
  - **Dead Sensor:** Isolated dark pole with live downstream children → Flagged as `SENSOR_FAULT` (no outage ticket).
  - **Scheduled Load Shedding:** Checked against scheduled outage feed with ±40 min overrun grace window → Suppresses emergency alerts.

---

## 5. AI Integration (Lineman Dispatch Brief Generator)

- **Role of LLM:** Translates verified deterministic graph boundaries, GPS coordinates, PIN code, and affected households into a structured field dispatch work order for linemen.
- **Why this spot?** Fault localization MUST be 100% deterministic (graph traversal is instant, free, zero hallucination). Natural language synthesis excels at translating technical telemetry into crew equipment recommendations (e.g. 50m ACSR wire, 9m PCC pole kit, ladder truck).
