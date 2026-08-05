import { Pole, DistributionTransformer } from '../types';

export interface InferredTopologyEdge {
  child_pole_id: string;
  parent_pole_id: string | null;
  distance_meters: number;
}

export function haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Reconstructs radial tree topology for poles belonging to a DT using Spatial Prim's MST Algorithm.
 * Root node is the DT coordinates.
 */
export function reconstructTopologyMST(dt: DistributionTransformer, dtPoles: Pole[]): Map<string, string | null> {
  const parentMap = new Map<string, string | null>(); // pole_id -> parent_pole_id (or null if direct to DT)

  if (dtPoles.length === 0) return parentMap;

  // Nodes in tree: DT (id = dt.dt_id) + all pole_ids
  const visited = new Set<string>();
  visited.add(dt.dt_id);

  const remainingPoles = new Map<string, Pole>();
  dtPoles.forEach((p) => remainingPoles.set(p.pole_id, p));

  // Prim's algorithm loop
  while (remainingPoles.size > 0) {
    let minDistance = Infinity;
    let closestPoleId: string | null = null;
    let bestParentId: string | null = null;

    // Find the unvisited pole closest to ANY node in the current tree
    remainingPoles.forEach((pole, poleId) => {
      // Check distance to DT if DT is in tree
      const distToDT = haversineDistanceMeters(dt.lat, dt.lon, pole.lat, pole.lon);
      if (distToDT < minDistance) {
        minDistance = distToDT;
        closestPoleId = poleId;
        bestParentId = null; // Connected directly to DT
      }

      // Check distance to all already visited poles
      visited.forEach((visitedId) => {
        if (visitedId === dt.dt_id) return;
        const parentPole = dtPoles.find((p) => p.pole_id === visitedId);
        if (!parentPole) return;

        const dist = haversineDistanceMeters(parentPole.lat, parentPole.lon, pole.lat, pole.lon);
        if (dist < minDistance) {
          minDistance = dist;
          closestPoleId = poleId;
          bestParentId = visitedId;
        }
      });
    });

    if (closestPoleId) {
      visited.add(closestPoleId);
      parentMap.set(closestPoleId, bestParentId);
      remainingPoles.delete(closestPoleId);
    } else {
      break;
    }
  }

  return parentMap;
}
