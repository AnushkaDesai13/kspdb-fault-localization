import { Substation, Feeder, DistributionTransformer, Pole } from '../types';

export interface SeedData {
  substations: Substation[];
  feeders: Feeder[];
  transformers: DistributionTransformer[];
  poles: Pole[];
}

export function generateSeedNetwork(): SeedData {
  const substations: Substation[] = [
    { substation_id: 'SUB-01', name: 'Koramangala 66/11kV Substation', lat: 12.9352, lon: 77.6245 },
    { substation_id: 'SUB-02', name: 'Jayanagar 66/11kV Substation', lat: 12.9250, lon: 77.5938 },
    { substation_id: 'SUB-03', name: 'Indiranagar 66/11kV Substation', lat: 12.9719, lon: 77.6412 },
    { substation_id: 'SUB-04', name: 'HSR Layout 66/11kV Substation', lat: 12.9121, lon: 77.6445 },
  ];

  const feeders: Feeder[] = [];
  substations.forEach((sub, subIdx) => {
    for (let f = 1; f <= 3; f++) {
      const feeder_id = `F-0${subIdx + 1}-0${f}`;
      feeders.push({
        feeder_id,
        substation_id: sub.substation_id,
        name: `Feeder ${f} (${sub.name.split(' ')[0]})`,
      });
    }
  });

  const transformers: DistributionTransformer[] = [];
  const poles: Pole[] = [];

  let poleCounter = 1000;
  let deviceCounter = 5000;

  feeders.forEach((feeder, fIdx) => {
    // 4 DTs per feeder -> 40 DTs total
    for (let d = 1; d <= 4; d++) {
      const dt_id = `D-${feeder.feeder_id.replace('F-', '')}-${d}`;
      // 40% known topology, 60% missing topology
      const has_known_topology = (transformers.length % 5) < 2; // 40% true, 60% false

      const dtLat = 12.9100 + (fIdx * 0.006) + (d * 0.002);
      const dtLon = 77.5800 + (fIdx * 0.007) + (d * 0.0015);

      transformers.push({
        dt_id,
        feeder_id: feeder.feeder_id,
        lat: dtLat,
        lon: dtLon,
        capacity_kva: [100, 250, 500][d % 3],
        households_served: 150 + (d * 40),
        has_known_topology,
      });

      // Generate 70 poles per DT -> ~2800 poles
      const numPoles = 70;
      let previousPoleId: string | null = null;

      // Simulate a main line with 2 branches
      for (let p = 1; p <= numPoles; p++) {
        poleCounter++;
        const pole_id = `P-${poleCounter}`;

        // Geography: step outward from DT
        const angle = 0.5 + (p > 40 ? 1.2 : 0.1); // branch splitting
        const distance = 0.00015 * (p > 40 ? p - 40 : p);
        const pLat = dtLat + Math.sin(angle) * distance;
        const pLon = dtLon + Math.cos(angle) * distance;

        // ~9% without IoT device
        const hasDevice = (poleCounter % 11) !== 0;
        let device_id: string | null = null;
        if (hasDevice) {
          deviceCounter++;
          device_id = `KSPDB-DEV-${deviceCounter}`;
        }

        // ~3% missing pincode
        const pincode = (poleCounter % 33 === 0) ? null : '560078';
        const ward = `W-0${(p % 15) + 80}`;

        let seq_on_line: number | null = null;
        let parent_pole_id: string | null = null;

        if (has_known_topology) {
          seq_on_line = p;
          if (p === 1) {
            parent_pole_id = null; // connects directly to DT
          } else if (p === 41) {
            parent_pole_id = `P-${poleCounter - 21}`; // spur off pole 20
          } else {
            parent_pole_id = previousPoleId;
          }
        }

        poles.push({
          pole_id,
          lat: pLat,
          lon: pLon,
          feeder_id: feeder.feeder_id,
          dt_id,
          seq_on_line,
          parent_pole_id,
          pole_type: p % 2 === 0 ? 'LT-9m-PCC' : 'LT-8m-Steel',
          ward,
          pincode,
          device_id,
        });

        previousPoleId = pole_id;
      }
    }
  });

  return { substations, feeders, transformers, poles };
}
