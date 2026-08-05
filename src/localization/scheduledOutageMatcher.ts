import { ScheduledOutage } from '../types';

export class ScheduledOutageMatcher {
  private scheduledOutages: ScheduledOutage[] = [];

  public setOutages(outages: ScheduledOutage[]) {
    this.scheduledOutages = outages;
  }

  public isScheduledOutage(assetType: 'feeder' | 'dt', assetId: string, currentTime = new Date()): { matched: boolean; outage?: ScheduledOutage } {
    const GRACE_PERIOD_MS = 40 * 60 * 1000; // 40 minute overrun / early start grace period

    for (const outage of this.scheduledOutages) {
      if (outage.scope === assetType && outage.target_id === assetId) {
        const startMs = new Date(outage.start).getTime() - GRACE_PERIOD_MS;
        const endMs = new Date(outage.end).getTime() + GRACE_PERIOD_MS;
        const nowMs = currentTime.getTime();

        if (nowMs >= startMs && nowMs <= endMs) {
          return { matched: true, outage };
        }
      }
    }
    return { matched: false };
  }
}
