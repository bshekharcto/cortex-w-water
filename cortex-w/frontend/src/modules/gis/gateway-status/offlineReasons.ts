import type { GatewayTimeline } from '@/services/api/gatewayStatusApi';
import { GATEWAY_TIME_ZONE, fmtDuration, type OfflinePeriod } from './gatewayStatusModel';

/**
 * Why a gateway may have been offline: the possible reasons for one offline period, most likely first.
 *
 * The gateway health service only labels two kinds of outage (SCHEDULED_REBOOT, KEEPALIVE_ONLY); every other period
 * has no reason at all. Nothing else is known about the gateway's site, so the rest is inferred from what the period
 * itself shows, and said to be a possibility, with the evidence it rests on:
 *  - the service's own label, when there is one (stated as fact, because the service decided it);
 *  - how long the outage lasted (a restart, an internet blip, a power cut or a failure last very different times);
 *  - whether it started at a scheduled-reboot time;
 *  - whether the same time of day keeps coming up on other days (a timetable);
 *  - whether other outages crowd around it (an unstable link or supply);
 *  - how many heartbeats that day arrived.
 * Pure: no I/O.
 */

export interface PossibleReason {
  label: string;
  /** What it means and why it is listed. */
  detail: string;
  /** The service labelled the period itself (not an inference). */
  confirmed?: boolean;
}

/** The gateways restart themselves near these hours (IST), for about two minutes. */
export const REBOOT_HOURS = [0, 6, 12, 18] as const;
const REBOOT_TOLERANCE_MIN = 10;
const MAX_REASONS = 3;

const MIN = 60;
const HOUR = 3600;

/** Minutes after midnight, in the zone, of an instant. */
export function minuteOfDay(iso: string, timeZone = GATEWAY_TIME_ZONE): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(Date.parse(iso));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}

const dayOf = (iso: string, timeZone: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(Date.parse(iso));

const clock = (minutes: number) => `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** The scheduled-reboot hour this start is within a few minutes of (either side), or null. */
export function nearRebootHour(startMinuteOfDay: number): number | null {
  for (const h of REBOOT_HOURS) {
    const diff = Math.abs(startMinuteOfDay - h * 60);
    if (Math.min(diff, 1440 - diff) <= REBOOT_TOLERANCE_MIN) return h;
  }
  return null;
}

/** Circular distance between two minutes of the day. */
const circular = (a: number, b: number) => {
  const d = Math.abs(a - b);
  return Math.min(d, 1440 - d);
};

export interface ReasonContext {
  timeZone?: string;
  /** The gateway's heartbeats per day, when known. */
  heartbeatDays?: GatewayTimeline['heartbeatDays'];
}

export function possibleReasons(period: OfflinePeriod, all: OfflinePeriod[], ctx: ReasonContext = {}): PossibleReason[] {
  const tz = ctx.timeZone ?? GATEWAY_TIME_ZONE;
  const { segment, ongoing } = period;
  const secs = segment.durationSeconds;
  const out: PossibleReason[] = [];
  const evidence: string[] = [];
  const add = (r: PossibleReason) => {
    if (!out.some((x) => x.label === r.label)) out.push(r);
  };

  // --- what the service itself says -------------------------------------------------------------------------
  if (segment.reason === 'SCHEDULED_REBOOT') {
    add({
      label: 'Scheduled reboot',
      detail: 'The gateway restarts itself on a timetable (about two minutes, near 00:00, 06:00, 12:00 and 18:00 IST) and comes back on its own. No action needed.',
      confirmed: true,
    });
  } else if (segment.reason === 'KEEPALIVE_ONLY') {
    add({
      label: 'Reachable, but no meter messages',
      detail:
        'The gateway kept its link to the network server but forwarded no meter messages. Possible causes: a fault in its radio (LoRa) module, a damaged antenna or cable, or interference. Needs a check on site if it lasts.',
      confirmed: true,
    });
  } else if (segment.reason) {
    add({ label: segment.reason.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()), detail: 'Reported by the gateway health service.', confirmed: true });
  }

  const startMin = minuteOfDay(segment.start, tz);
  const rebootHour = nearRebootHour(startMin);

  // --- a scheduled reboot that was not labelled -------------------------------------------------------------
  if (!segment.reason && rebootHour !== null && secs <= 15 * MIN) {
    add({
      label: 'Probably a scheduled reboot',
      detail: `It started near ${String(rebootHour).padStart(2, '0')}:00, one of the times the gateways restart themselves, and was over within ${fmtDuration(secs)}.`,
    });
  }

  // --- a timetable: the same time of day on other days ------------------------------------------------------
  const sameTime = all.filter((p) => p !== period && circular(minuteOfDay(p.segment.start, tz), startMin) <= 15);
  const sameTimeDays = new Set(sameTime.map((p) => dayOf(p.segment.start, tz)));
  sameTimeDays.delete(dayOf(segment.start, tz));
  if (!segment.reason && sameTimeDays.size >= 2 && rebootHour === null) {
    add({
      label: `Recurs around ${clock(startMin)}`,
      detail: `Outages also began at about this time on ${sameTimeDays.size} other days. A regular time points to something on a timetable: a scheduled power cut or load-shedding, a timer on the power supply, or a recurring task on the gateway.`,
    });
  }

  // --- many drops close together ----------------------------------------------------------------------------
  const crowd = all.filter((p) => p !== period && Math.abs(Date.parse(p.segment.start) - Date.parse(segment.start)) <= HOUR * 1000);
  if (!segment.reason && crowd.length >= 2) {
    add({
      label: 'Unstable connection or supply',
      detail: `${crowd.length} other outages began within an hour of this one. Repeated short drops usually mean a weak mobile signal at the site, a loose power connection or adapter, or overheating.`,
    });
  }

  // --- by length: what kinds of fault last this long --------------------------------------------------------
  if (!segment.reason || segment.reason === 'KEEPALIVE_ONLY') {
    if (secs <= 5 * MIN) {
      if (rebootHour === null) {
        add({ label: 'Brief restart or network blip', detail: `Only ${fmtDuration(secs)} offline: a power flicker, the gateway restarting, or a short drop of the mobile data connection.` });
      }
    } else if (secs <= HOUR) {
      add({
        label: 'Internet or mobile-data interruption',
        detail: `${fmtDuration(secs)} offline: the SIM/mobile network or the router lost its connection for a while. A short power cut is also possible.`,
      });
      add({ label: 'Short power cut', detail: 'A brief mains failure at the site, if there is no battery backup.' });
    } else if (secs <= 6 * HOUR) {
      add({
        label: 'Power cut at the site',
        detail: `${fmtDuration(secs)} offline: typical of a mains power failure when the gateway has no (or an exhausted) battery backup. Check whether nearby gateways dropped at the same time: if so, it was an area outage.`,
      });
      add({ label: 'Mobile network or data-plan outage', detail: 'A longer failure of the mobile network at the site, or an expired or exhausted data plan.' });
    } else if (secs <= 24 * HOUR) {
      add({
        label: 'Extended power loss or backhaul failure',
        detail: `${fmtDuration(secs)} offline: a long mains failure, a failed SIM/router, or a gateway that needs resetting. Worth a site visit if it keeps happening.`,
      });
      add({ label: 'Device fault', detail: 'A hardware failure or a crashed gateway that did not recover by itself.' });
    } else {
      add({
        label: 'Gateway down or disconnected',
        detail: `${fmtDuration(secs)} offline: the gateway is probably powered off, unplugged, damaged, or has lost its SIM or data plan. Needs a site visit.`,
      });
      add({ label: 'Device fault', detail: 'Hardware failure, or the gateway was moved or removed.' });
    }
  }

  // --- how that day's heartbeats went (evidence only) -------------------------------------------------------
  const day = ctx.heartbeatDays?.find((d) => d.date === dayOf(segment.start, tz));
  if (day && day.expected > 0 && out.length > 0 && !out[0].confirmed) {
    const share = Math.round((day.received / day.expected) * 100);
    if (share < 90) evidence.push(`That day only ${share}% of the expected heartbeats arrived.`);
  }

  if (ongoing) {
    out.unshift({
      label: 'Still offline',
      detail: 'The gateway has not come back yet. Check its power and internet connection now; the possible causes below are based on how long it has been down.',
    });
  }

  const shown = out.slice(0, MAX_REASONS);
  // the evidence belongs to the most likely inferred reason (not to "still offline", nor to a label the service gave)
  const at = shown.findIndex((r) => !r.confirmed && r.label !== 'Still offline');
  if (evidence.length && at >= 0) shown[at] = { ...shown[at], detail: `${shown[at].detail} ${evidence.join(' ')}` };
  return shown;
}
