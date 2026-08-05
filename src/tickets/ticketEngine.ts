import { Incident, TicketStatus } from '../types';
import { TelemetryProcessor } from '../ingest/telemetryProcessor';
import { FaultDetector } from '../localization/faultDetector';

export class TicketEngine {
  private faultDetector: FaultDetector;
  private telemetryProcessor: TelemetryProcessor;

  constructor(faultDetector: FaultDetector, telemetryProcessor: TelemetryProcessor) {
    this.faultDetector = faultDetector;
    this.telemetryProcessor = telemetryProcessor;
  }

  public acknowledgeTicket(incidentId: string): Incident {
    const incident = this.faultDetector.getIncidentById(incidentId);
    if (!incident) throw new Error(`Incident ${incidentId} not found`);

    incident.status = 'acknowledged';
    incident.updated_at = new Date().toISOString();
    this.faultDetector.updateIncident(incident);
    return incident;
  }

  public assignCrew(incidentId: string, crewName: string): Incident {
    const incident = this.faultDetector.getIncidentById(incidentId);
    if (!incident) throw new Error(`Incident ${incidentId} not found`);

    incident.status = 'crew_assigned';
    incident.assigned_crew = crewName;
    incident.updated_at = new Date().toISOString();
    this.faultDetector.updateIncident(incident);
    return incident;
  }

  /**
   * Manual resolution attempt by lineman/operator.
   * STRICT GUARDRAIL: Checks telemetry before allowing resolution.
   */
  public resolveTicketManual(incidentId: string): { success: boolean; incident: Incident; message: string } {
    const incident = this.faultDetector.getIncidentById(incidentId);
    if (!incident) throw new Error(`Incident ${incidentId} not found`);

    // Verify telemetry state of affected monitored poles
    const darkPoles = incident.affected_pole_ids.filter((poleId) => {
      const pole = this.faultDetector.networkGraph.getPole(poleId);
      if (pole && pole.device_id === null) return false;
      const state = this.telemetryProcessor.getPoleState(poleId);
      return !state || !state.energized;
    });

    if (darkPoles.length > 0) {
      incident.rejection_reason = `Resolution rejected: Telemetry indicates ${darkPoles.length} affected poles remain dark (${darkPoles.slice(0, 3).join(', ')}${darkPoles.length > 3 ? '...' : ''}). Power is not restored.`;
      incident.updated_at = new Date().toISOString();
      this.faultDetector.updateIncident(incident);

      return {
        success: false,
        incident,
        message: incident.rejection_reason,
      };
    }

    incident.status = 'resolved';
    incident.resolved_at = new Date().toISOString();
    incident.rejection_reason = undefined;
    incident.updated_at = new Date().toISOString();
    this.faultDetector.updateIncident(incident);

    return {
      success: true,
      incident,
      message: 'Ticket manually marked resolved and telemetry verified power restoration.',
    };
  }

  /**
   * Evaluates active tickets against telemetry and auto-verifies/closes tickets when power is restored.
   */
  public evaluateAutoVerification(): Incident[] {
    const autoVerified: Incident[] = [];

    const activeIncidents = this.faultDetector.detectFaults();

    activeIncidents.forEach((incident) => {
      if (incident.status === 'closed' || incident.status === 'verified') return;

      const darkCount = incident.affected_pole_ids.filter((poleId) => {
        const pole = this.faultDetector.networkGraph.getPole(poleId);
        if (pole && pole.device_id === null) return false;
        const state = this.telemetryProcessor.getPoleState(poleId);
        return !state || !state.energized;
      }).length;

      // When ALL affected poles report energized: true, automatically verify and close ticket!
      if (darkCount === 0 && incident.affected_pole_ids.length > 0) {
        incident.status = 'closed';
        incident.resolved_at = incident.resolved_at || new Date().toISOString();
        incident.updated_at = new Date().toISOString();
        incident.confidence_reasoning += ' [AUTO-VERIFIED FROM TELEMETRY: All downstream devices reporting energized: true]';
        this.faultDetector.updateIncident(incident);
        autoVerified.push(incident);
      }
    });

    return autoVerified;
  }
}
