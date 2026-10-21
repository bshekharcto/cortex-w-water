/**
 * What the page header's "Last updated" pill shows.
 *
 * By default it is the time the scheduler last updated the database numbers (the pages built on those numbers lag it by
 * up to 15 minutes). A page that reads live from another source (Gateway Status reads the gateway health service
 * directly) takes the pill over with its own load time instead: the scheduler's time says nothing about its data.
 */
export interface HeaderTakeover {
  /** The page's own "last updated" text; null while it has none yet (the pill is then hidden, not the scheduler's time). */
  text: string | null;
  title?: string;
}

export interface HeaderPill {
  text: string;
  title: string;
}

const SCHEDULER_TITLE = 'When the numbers were last updated. They update by themselves.';

/**
 * @param takeover the page's own value, or undefined when no page has taken the pill over
 * @param schedulerLocalTime when the scheduler last updated the numbers, as site clock time ("2026-10-09 18:15:00")
 */
export function headerPill(takeover: HeaderTakeover | undefined, schedulerLocalTime: string | null): HeaderPill | null {
  if (takeover) {
    return takeover.text ? { text: takeover.text, title: takeover.title ?? SCHEDULER_TITLE } : null;
  }
  return schedulerLocalTime ? { text: schedulerLocalTime.slice(11, 16), title: SCHEDULER_TITLE } : null;
}
