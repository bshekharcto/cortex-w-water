import { describe, expect, it } from 'vitest';
import { possibleReasons, nearRebootHour, minuteOfDay } from '../offlineReasons';
import type { OfflinePeriod } from '../gatewayStatusModel';
import type { TimelineSegment } from '@/services/api/gatewayStatusApi';

// 2026-10-14T18:30:00Z is midnight of 15 Oct in India (IST = UTC+5:30)
const IST_MIDNIGHT_15 = Date.parse('2026-10-14T18:30:00Z');

/** An offline period that starts `atMinute` minutes after IST midnight of day `day` (15 = 15 Oct) and lasts `seconds`. */
function period(index: number, day: number, atMinute: number, seconds: number, reason: string | null = null, ongoing = false): OfflinePeriod {
  const start = IST_MIDNIGHT_15 + (day - 15) * 86_400_000 + atMinute * 60_000;
  const segment: TimelineSegment = {
    status: 'offline',
    start: new Date(start).toISOString(),
    end: new Date(start + seconds * 1000).toISOString(),
    durationSeconds: seconds,
    reason,
  };
  return { index, segment, ongoing };
}
const labels = (p: OfflinePeriod, all: OfflinePeriod[] = [p], ctx = {}) => possibleReasons(p, all, ctx).map((r) => r.label);

describe('helpers', () => {
  it('reads the time of day in India', () => {
    expect(minuteOfDay(new Date(IST_MIDNIGHT_15).toISOString())).toBe(0);
    expect(minuteOfDay(new Date(IST_MIDNIGHT_15 + 750 * 60_000).toISOString())).toBe(750); // 12:30
  });
  it('knows when a start is near a scheduled reboot, either side, also across midnight', () => {
    expect(nearRebootHour(0)).toBe(0);
    expect(nearRebootHour(1435)).toBe(0); // 23:55
    expect(nearRebootHour(6 * 60 + 8)).toBe(6);
    expect(nearRebootHour(12 * 60 + 11)).toBeNull();
    expect(nearRebootHour(9 * 60)).toBeNull();
  });
});

describe('possibleReasons', () => {
  it('states the service\'s own label as fact', () => {
    const r = possibleReasons(period(1, 15, 0, 120, 'SCHEDULED_REBOOT'), [], {});
    expect(r[0]).toMatchObject({ label: 'Scheduled reboot', confirmed: true });
    expect(r).toHaveLength(1);
  });

  it('explains "keep-alive only" and adds length-based possibilities after it', () => {
    const p = period(1, 15, 9 * 60, 3 * 3600, 'KEEPALIVE_ONLY');
    const l = labels(p);
    expect(l[0]).toBe('Reachable, but no meter messages');
    expect(l.length).toBeGreaterThan(1);
  });

  it('an unlabelled short outage at a reboot time is probably a scheduled reboot', () => {
    expect(labels(period(1, 15, 0, 150))[0]).toBe('Probably a scheduled reboot');
    expect(labels(period(1, 15, 12 * 60 + 3, 120))[0]).toBe('Probably a scheduled reboot');
  });

  it('but a long outage at a reboot time is not', () => {
    expect(labels(period(1, 15, 0, 3 * 3600))).not.toContain('Probably a scheduled reboot');
  });

  it('a blip of a few minutes at another time is a restart or network blip', () => {
    expect(labels(period(1, 15, 9 * 60, 120))).toEqual(['Brief restart or network blip']);
  });

  it('gives more than one possible reason by length: minutes, hours, a day', () => {
    expect(labels(period(1, 15, 9 * 60, 20 * 60))).toEqual(['Internet or mobile-data interruption', 'Short power cut']);
    expect(labels(period(1, 15, 9 * 60, 3 * 3600))).toEqual(['Power cut at the site', 'Mobile network or data-plan outage']);
    expect(labels(period(1, 15, 9 * 60, 10 * 3600))).toEqual(['Extended power loss or backhaul failure', 'Device fault']);
    expect(labels(period(1, 15, 9 * 60, 30 * 3600))).toEqual(['Gateway down or disconnected', 'Device fault']);
  });

  it('recognises an outage that comes at the same time on other days', () => {
    const all = [period(1, 13, 15 * 60 + 5, 1800), period(2, 14, 15 * 60, 1700), period(3, 15, 15 * 60 + 10, 1900)];
    const l = labels(all[2], all);
    expect(l[0]).toBe('Recurs around 15:10');
    // two outages on the SAME day at that time do not make a timetable
    const sameDay = [period(1, 15, 15 * 60, 1800), period(2, 15, 15 * 60 + 5, 1800)];
    expect(labels(sameDay[0], sameDay)).not.toContain('Recurs around 15:00');
  });

  it('recognises many outages close together as an unstable link or supply', () => {
    const all = [period(1, 15, 9 * 60, 600), period(2, 15, 9 * 60 + 20, 300), period(3, 15, 9 * 60 + 40, 400)];
    expect(labels(all[0], all)[0]).toBe('Unstable connection or supply');
    // two is not enough
    expect(labels(all[0], all.slice(0, 2))).not.toContain('Unstable connection or supply');
  });

  it('a gateway that is still offline says so first, then the likely causes for how long it has been down', () => {
    const l = labels(period(1, 15, 9 * 60, 5 * 3600, null, true));
    expect(l[0]).toBe('Still offline');
    expect(l).toContain('Power cut at the site');
  });

  it('never lists more than three, and adds that day\'s heartbeat shortfall to the most likely inferred reason', () => {
    const p = period(1, 15, 9 * 60, 3 * 3600, null, true);
    const r = possibleReasons(p, [p], { heartbeatDays: [{ date: '2026-10-15', received: 1000, expected: 2880 }] });
    expect(r.length).toBeLessThanOrEqual(3);
    expect(r[0].label).toBe('Still offline');
    expect(r[1].detail).toMatch(/only 35% of the expected heartbeats/);
    // a healthy day adds nothing
    const ok = possibleReasons(p, [p], { heartbeatDays: [{ date: '2026-10-15', received: 2800, expected: 2880 }] });
    expect(ok.map((x) => x.detail).join(' ')).not.toMatch(/heartbeats/);
  });

  it('every reason has a label and a detail', () => {
    for (const secs of [30, 200, 1000, 8000, 50_000, 200_000]) {
      for (const r of possibleReasons(period(1, 15, 9 * 60, secs), [], {})) {
        expect(r.label.length).toBeGreaterThan(0);
        expect(r.detail.length).toBeGreaterThan(10);
      }
    }
  });
});
