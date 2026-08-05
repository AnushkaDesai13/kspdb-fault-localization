import { Incident } from '../types';

export class AIDispatchBriefGenerator {
  /**
   * Generates a structured lineman dispatch brief based on deterministic fault localization data.
   */
  public generateBrief(incident: Incident): string {
    const isSpan = incident.fault_type === 'SPAN_FAULT';
    const isDT = incident.fault_type === 'DT_FAULT';
    const isFeeder = incident.fault_type === 'FEEDER_FAULT';

    let equipmentReq = 'Standard repair vehicle, LT insulated gloves, line voltage tester';
    let crewRecommended = '2 Linemen, 1 Driver';

    if (isSpan) {
      equipmentReq = '50m ACSR conductor wire, 9m PCC pole climbing gear, hydraulic crimping tool, ladder truck';
      crewRecommended = '3 Linemen, 1 Supervisor';
    } else if (isDT) {
      equipmentReq = '11kV HT Fuse replacements (100A/200A), DT oil sampling kit, insulation resistance tester, crane truck';
      crewRecommended = '4 Linemen, 1 Substation Engineer';
    } else if (isFeeder) {
      equipmentReq = 'Substation VCB breaker diagnostic unit, 11kV feeder sectionizer kit';
      crewRecommended = 'Substation Maintenance Quick Response Team (QRT)';
    }

    return `🚨 DISPATCH BRIEF: ${incident.fault_type} AT PIN ${incident.pincode}
--------------------------------------------------
• Asset Target: ${incident.target_asset_id}
• Coordinates: ${incident.lat.toFixed(6)}° N, ${incident.lon.toFixed(6)}° E (Ward ${incident.ward})
• Impact: ${incident.affected_households} households (${incident.affected_pole_ids.length} poles dark)
• Confidence: ${incident.confidence_score}% (${incident.topology_source})
• Diagnostic Summary: ${incident.confidence_reasoning}
• Required Field Equipment: ${equipmentReq}
• Recommended Crew: ${crewRecommended}
• Safety Protocol: De-energize feeder ${incident.feeder_id} prior to ladder mounting. Verify grounding tag at DT ${incident.dt_id}.`;
  }
}
