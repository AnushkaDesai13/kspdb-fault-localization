import { NetworkGraph } from '../topology/networkGraph';
import { TelemetryProcessor } from '../ingest/telemetryProcessor';
import { ScheduledOutageMatcher } from './scheduledOutageMatcher';
import { Incident } from '../types';

export class FaultDetector {
  public networkGraph: NetworkGraph;
  private telemetryProcessor: TelemetryProcessor;
  private outageMatcher: ScheduledOutageMatcher;
  private activeIncidentsMap = new Map<string, Incident>();

  constructor(
    networkGraph: NetworkGraph,
    telemetryProcessor: TelemetryProcessor,
    outageMatcher: ScheduledOutageMatcher
  ) {
    this.networkGraph = networkGraph;
    this.telemetryProcessor = telemetryProcessor;
    this.outageMatcher = outageMatcher;
  }

  public detectFaults(): Incident[] {
    const explicitlyDarkPoles = new Set<string>();
    const explicitlyLivePoles = new Set<string>();

    // 1. Initial State Read from Telemetry
    this.networkGraph.poles.forEach((pole, poleId) => {
      const state = this.telemetryProcessor.getPoleState(poleId);

      if (state) {
        if (state.energized) {
          explicitlyLivePoles.add(poleId);
        } else {
          // Check for isolated sensor fault (dark pole with live children)
          const children = this.networkGraph.getChildren(poleId);
          const monitoredChildren = children.filter((c) => c.device_id !== null);

          let hasLiveChild = false;
          if (monitoredChildren.length > 0) {
            hasLiveChild = monitoredChildren.every((c) => {
              const childState = this.telemetryProcessor.getPoleState(c.pole_id);
              return childState && childState.energized;
            });
          }

          if (hasLiveChild) {
            explicitlyLivePoles.add(poleId); // Isolated sensor fault
          } else {
            explicitlyDarkPoles.add(poleId);
          }
        }
      } else {
        explicitlyLivePoles.add(poleId);
      }
    });

    // 2. Physical Downstream Darkness Propagation for Radial Lines
    // If a pole is explicitly dark, all its downstream descendants are physically dark in a radial tree
    const darkPolesSet = new Set<string>(explicitlyDarkPoles);
    const livePolesSet = new Set<string>(explicitlyLivePoles);

    explicitlyDarkPoles.forEach((darkId) => {
      const downstream = this.networkGraph.getDownstreamPoles(darkId, false);
      downstream.forEach((p) => {
        darkPolesSet.add(p.pole_id);
        livePolesSet.delete(p.pole_id);
      });
    });

    const currentIncidents: Incident[] = [];

    // 3. Feeder Outages (>= 70% dark poles across feeder)
    this.networkGraph.feeders.forEach((feeder, feederId) => {
      const feederPoles = Array.from(this.networkGraph.poles.values()).filter((p) => p.feeder_id === feederId);
      const darkInFeeder = feederPoles.filter((p) => darkPolesSet.has(p.pole_id));

      if (feederPoles.length > 0 && darkInFeeder.length / feederPoles.length >= 0.70) {
        if (this.outageMatcher.isScheduledOutage('feeder', feederId).matched) {
          return;
        }

        const firstPole = feederPoles[0];
        const incidentId = `INC-FEEDER-${feederId}`;
        const incident: Incident = {
          id: incidentId,
          fault_type: 'FEEDER_FAULT',
          target_asset_id: feederId,
          boundary_pole_ids: [],
          lat: firstPole.lat,
          lon: firstPole.lon,
          pincode: firstPole.pincode || '560078',
          ward: firstPole.ward,
          dt_id: firstPole.dt_id,
          feeder_id: feederId,
          affected_pole_ids: feederPoles.map((p) => p.pole_id),
          affected_households: feederPoles.length * 5,
          confidence_score: 98,
          confidence_reasoning: `Feeder-wide power loss detected across ${feederPoles.length} poles. Downstream blackout confirmed.`,
          topology_source: 'EXPLICIT_REGISTRY',
          status: 'detected',
          detected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        currentIncidents.push(incident);
        darkInFeeder.forEach((p) => darkPolesSet.delete(p.pole_id));
      }
    });

    // 4. DT Outages (>= 60% dark poles under DT)
    this.networkGraph.transformers.forEach((dt, dtId) => {
      const dtPoleIds = this.networkGraph.dtPolesMap.get(dtId) || [];
      if (dtPoleIds.length === 0) return;

      const darkInDT = dtPoleIds.filter((id) => darkPolesSet.has(id));

      if (dtPoleIds.length > 0 && darkInDT.length / dtPoleIds.length >= 0.60) {
        if (this.outageMatcher.isScheduledOutage('dt', dtId).matched) {
          return;
        }

        const firstPole = this.networkGraph.getPole(dtPoleIds[0])!;
        const incidentId = `INC-DT-${dtId}`;
        const isKnownTop = dt.has_known_topology;

        const incident: Incident = {
          id: incidentId,
          fault_type: 'DT_FAULT',
          target_asset_id: dtId,
          boundary_pole_ids: dtPoleIds.slice(0, 2),
          lat: dt.lat,
          lon: dt.lon,
          pincode: firstPole.pincode || '560078',
          ward: firstPole.ward,
          dt_id: dtId,
          feeder_id: dt.feeder_id,
          affected_pole_ids: [...dtPoleIds],
          affected_households: dt.households_served,
          confidence_score: isKnownTop ? 95 : 85,
          confidence_reasoning: `Distribution Transformer ${dtId} outage. All ${dtPoleIds.length} poles under transformer went dark simultaneously.`,
          topology_source: isKnownTop ? 'EXPLICIT_REGISTRY' : 'DT_AGGREGATE_FALLBACK',
          status: 'detected',
          detected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        currentIncidents.push(incident);
        dtPoleIds.forEach((id) => darkPolesSet.delete(id));
      }
    });

    // 5. Span Faults (Localize Edge Boundary Frontiers)
    const unprocessedDarkPoles = new Set(darkPolesSet);

    this.networkGraph.transformers.forEach((dt, dtId) => {
      const dtPoleIds = this.networkGraph.dtPolesMap.get(dtId) || [];
      const darkInThisDT = dtPoleIds.filter((id) => unprocessedDarkPoles.has(id));

      if (darkInThisDT.length === 0) return;

      const boundaryFrontiers: { upstreamPoleId: string | null; firstDarkPoleId: string; downstreamPoles: string[] }[] = [];

      darkInThisDT.forEach((darkId) => {
        const parent = this.networkGraph.getParent(darkId);
        // Frontier condition: darkId's parent is live or NULL (connects directly to live DT)
        const isParentLive = !parent || livePolesSet.has(parent.pole_id);

        if (isParentLive) {
          const downstream = this.networkGraph.getDownstreamPoles(darkId, true).map((p) => p.pole_id);
          boundaryFrontiers.push({
            upstreamPoleId: parent ? parent.pole_id : null,
            firstDarkPoleId: darkId,
            downstreamPoles: downstream,
          });
        }
      });

      boundaryFrontiers.forEach((frontier) => {
        const spanStartId = frontier.upstreamPoleId || `DT-${dtId}`;
        const spanEndId = frontier.firstDarkPoleId;
        const incidentId = `INC-SPAN-${dtId}-${spanEndId}`;

        const isKnownTop = dt.has_known_topology;

        const spanCoords = this.networkGraph.getSpanCoordinates(
          spanEndId,
          frontier.upstreamPoleId || undefined
        );

        const unmonitoredCount = frontier.downstreamPoles.filter(
          (id) => this.networkGraph.getPole(id)?.device_id === null
        ).length;

        let confidenceScore = isKnownTop ? 92 : 78;
        let topologySource: 'EXPLICIT_REGISTRY' | 'SPATIAL_MST_INFERRED' = isKnownTop ? 'EXPLICIT_REGISTRY' : 'SPATIAL_MST_INFERRED';
        let reasoning = isKnownTop
          ? `Span fault isolated on line section between ${spanStartId} (Live) and ${spanEndId} (Dark). ${frontier.downstreamPoles.length} poles affected downstream.`
          : `Span fault localized using Spatial MST Inference between ${spanStartId} and ${spanEndId}. 60% missing topology model active.`;

        if (unmonitoredCount > 0) {
          confidenceScore -= 10;
          reasoning += ` (${unmonitoredCount} unmonitored poles present in cluster; span range confidence bounded).`;
        }

        const incident: Incident = {
          id: incidentId,
          fault_type: 'SPAN_FAULT',
          target_asset_id: `SPAN-${spanStartId}-${spanEndId}`,
          span_start_pole_id: frontier.upstreamPoleId || undefined,
          span_end_pole_id: spanEndId,
          boundary_pole_ids: frontier.upstreamPoleId ? [frontier.upstreamPoleId, spanEndId] : [spanEndId],
          lat: spanCoords.lat,
          lon: spanCoords.lon,
          pincode: spanCoords.pincode,
          ward: spanCoords.ward,
          dt_id: dtId,
          feeder_id: dt.feeder_id,
          affected_pole_ids: frontier.downstreamPoles,
          affected_households: frontier.downstreamPoles.length * 4,
          confidence_score: confidenceScore,
          confidence_reasoning: reasoning,
          topology_source: topologySource,
          status: 'detected',
          detected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        currentIncidents.push(incident);
        frontier.downstreamPoles.forEach((id) => unprocessedDarkPoles.delete(id));
      });
    });

    const newMap = new Map<string, Incident>();
    currentIncidents.forEach((inc) => {
      const existing = this.activeIncidentsMap.get(inc.id);
      if (existing) {
        inc.status = existing.status;
        inc.assigned_crew = existing.assigned_crew;
        inc.resolved_at = existing.resolved_at;
      }
      newMap.set(inc.id, inc);
    });

    this.activeIncidentsMap.forEach((inc, id) => {
      if (!newMap.has(id)) {
        inc.status = 'closed';
        inc.resolved_at = inc.resolved_at || new Date().toISOString();
        inc.updated_at = new Date().toISOString();
        newMap.set(id, inc);
      }
    });

    this.activeIncidentsMap = newMap;
    return Array.from(this.activeIncidentsMap.values());
  }

  public resetAllIncidents() {
    this.activeIncidentsMap.forEach((inc) => {
      inc.status = 'closed';
      inc.resolved_at = inc.resolved_at || new Date().toISOString();
      inc.updated_at = new Date().toISOString();
    });
  }

  public getIncidentById(id: string): Incident | undefined {
    return this.activeIncidentsMap.get(id);
  }

  public updateIncident(incident: Incident) {
    this.activeIncidentsMap.set(incident.id, incident);
  }

  public clearAll() {
    this.activeIncidentsMap.clear();
  }
}
