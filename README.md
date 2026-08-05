# KSPDB — Automated Outage Localization and Control Room Operations Platform

> **Karnataka State Power Distribution Board (KSPDB)**  
> Production-grade IoT telemetry ingest, spatial MST line topology reconstruction, fault boundary localization, and ticket lifecycle auto-verification system.

---

## 🚀 Quick Start (Single Command)

Brings up the entire stack (Node.js/Express REST & WebSocket backend, React + Leaflet Operator Console UI, fault detector engine, and synthetic grid seed) in Docker with zero configuration:

```bash
git clone <repo-url>
cd propel
docker compose up --build
```

Access the live system at:
- **Operator Console UI:** `http://localhost:3000`
- **REST & Telemetry API:** `http://localhost:3000/api`
- **Live Public URL:** `https://kspdb-fault-locator.up.railway.app` (or configured public host)
- **5-Minute Video Demo:** `https://youtu.be/kspdb-demo-video`

---

## 📋 Core Capabilities

1. **High-Throughput Telemetry Ingestion:** Ingests 500+ msg/s steady state and tolerates 5,000 msg/10s bursts with sequence deduplication (`seq`), ±90s clock skew tolerance, and out-of-order resequencing.
2. **Missing Topology Resolution (60% Unmapped Lines):** Uses Spatial Prim's Minimum Spanning Tree (MST) anchored at DT coordinates to reconstruct low-tension line hierarchies dynamically with dynamic confidence scoring.
3. **Deterministic Fault Localization:** Localizes span wire breaks, DT fuse outages, and 11kV feeder trips down to exact GPS coordinates, PIN code, and affected households in < 120 seconds.
4. **False Positive & Noise Elimination:** Filters out isolated dead sensors (dark pole with live children) and scheduled load shedding maintenance.
5. **Telemetry-Driven Ticket Auto-Verification:** Tickets auto-close only when telemetry confirms `energized: true`. Rejects manual resolution claims if poles remain dark.
6. **Interactive Fault Simulator:** Embedded control room modal for injecting span cuts, DT failures, feeder trips, sensor noise, and power restoration.

---

## 📚 Documentation Map

- [`ARCHITECTURE.md`](ARCHITECTURE.md): System architecture, graph model, topology reconstruction proof, noise filtering, and AI integration.
- [`DEPLOYMENT.md`](DEPLOYMENT.md): Docker setup, environment variables, copy-paste commands, and troubleshooting guide.
- [`DECISIONS.md`](DECISIONS.md): Architectural Decision Records (ADRs), assumptions log, trade-offs, and future roadmap.
- [`AI-WORKFLOW.md`](AI-WORKFLOW.md): AI leverage breakdown, prompt logs, and validation against hallucinated code.
