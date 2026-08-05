import { Substation, Feeder, DistributionTransformer, Pole } from '../types';
import { reconstructTopologyMST, haversineDistanceMeters } from './mstInference';

export class NetworkGraph {
  public substations = new Map<string, Substation>();
  public feeders = new Map<string, Feeder>();
  public transformers = new Map<string, DistributionTransformer>();
  public poles = new Map<string, Pole>();
  public deviceToPoleMap = new Map<string, string>(); // device_id -> pole_id

  // Tree structures: pole_id -> parent_pole_id
  public parentMap = new Map<string, string | null>();
  // pole_id -> child_pole_ids[]
  public childrenMap = new Map<string, string[]>();
  // dt_id -> pole_ids[]
  public dtPolesMap = new Map<string, string[]>();

  public initialize(substations: Substation[], feeders: Feeder[], dtList: DistributionTransformer[], poleList: Pole[]) {
    substations.forEach((s) => this.substations.set(s.substation_id, s));
    feeders.forEach((f) => this.feeders.set(f.feeder_id, f));
    dtList.forEach((dt) => {
      this.transformers.set(dt.dt_id, dt);
      this.dtPolesMap.set(dt.dt_id, []);
    });

    poleList.forEach((p) => {
      this.poles.set(p.pole_id, p);
      if (p.device_id) {
        this.deviceToPoleMap.set(p.device_id, p.pole_id);
      }
      if (this.dtPolesMap.has(p.dt_id)) {
        this.dtPolesMap.get(p.dt_id)!.push(p.pole_id);
      }
    });

    // Build parent-child relationships
    dtList.forEach((dt) => {
      const dtPoles = (this.dtPolesMap.get(dt.dt_id) || []).map((id) => this.poles.get(id)!);

      if (dt.has_known_topology) {
        // Use explicit parent_pole_id
        dtPoles.forEach((p) => {
          this.parentMap.set(p.pole_id, p.parent_pole_id);
        });
      } else {
        // Use Spatial MST inference for 60% missing topology
        const inferredParents = reconstructTopologyMST(dt, dtPoles);
        inferredParents.forEach((parentId, poleId) => {
          this.parentMap.set(poleId, parentId);
        });
      }
    });

    // Populate children map
    this.poles.forEach((_, poleId) => {
      this.childrenMap.set(poleId, []);
    });
    this.parentMap.forEach((parentId, childId) => {
      if (parentId && this.childrenMap.has(parentId)) {
        this.childrenMap.get(parentId)!.push(childId);
      }
    });
  }

  public getPole(poleId: string): Pole | undefined {
    return this.poles.get(poleId);
  }

  public getPoleByDeviceId(deviceId: string): Pole | undefined {
    const poleId = this.deviceToPoleMap.get(deviceId);
    return poleId ? this.poles.get(poleId) : undefined;
  }

  public getParent(poleId: string): Pole | undefined {
    const parentId = this.parentMap.get(poleId);
    return parentId ? this.poles.get(parentId) : undefined;
  }

  public getChildren(poleId: string): Pole[] {
    const childIds = this.childrenMap.get(poleId) || [];
    return childIds.map((id) => this.poles.get(id)!).filter(Boolean);
  }

  /**
   * Returns all downstream descendant poles of a given pole (inclusive or exclusive).
   */
  public getDownstreamPoles(startPoleId: string, includeSelf = true): Pole[] {
    const result: Pole[] = [];
    const queue: string[] = includeSelf ? [startPoleId] : (this.childrenMap.get(startPoleId) || []);

    while (queue.length > 0) {
      const currId = queue.shift()!;
      const pole = this.poles.get(currId);
      if (pole) {
        result.push(pole);
        const children = this.childrenMap.get(currId) || [];
        queue.push(...children);
      }
    }
    return result;
  }

  /**
   * Calculates span midpoint coordinates and PIN code between two poles (or pole and DT).
   */
  public getSpanCoordinates(poleAId: string, poleBId?: string): { lat: number; lon: number; pincode: string; ward: string } {
    const poleA = this.poles.get(poleAId)!;
    let lat = poleA.lat;
    let lon = poleA.lon;
    const pincode = poleA.pincode || '560078';
    const ward = poleA.ward;

    if (poleBId) {
      const poleB = this.poles.get(poleBId);
      if (poleB) {
        lat = (poleA.lat + poleB.lat) / 2;
        lon = (poleA.lon + poleB.lon) / 2;
      }
    } else {
      // Connects to DT directly
      const dt = this.transformers.get(poleA.dt_id);
      if (dt) {
        lat = (poleA.lat + dt.lat) / 2;
        lon = (poleA.lon + dt.lon) / 2;
      }
    }

    return { lat, lon, pincode, ward };
  }
}
