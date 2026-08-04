import type { Incident } from '../types';

// Shared by the dispatcher dashboard's IncidentReportsPanel and the kiosk
// status strip so "urgent" means the same thing in both places.
export function isUrgentIncident(incident: Incident): boolean {
    return incident.severity === 'high' && incident.status !== 'RESOLVED';
}
