export interface FreshnessState {
  /** When the numbers were last updated, as clock time at the site ("2026-10-09 18:15:00"); null until known. */
  localTime: string | null;
  updatedAt: string | null;
  /** Goes up by one each time a newer update is seen: pages reload their values (without a loader) when it changes. */
  version: number;
}

/** What the provider holds after an answer: the version goes up only when a newer update has shown up. */
export function nextFreshness(prev: FreshnessState, answer: { updatedAt: string | null; localTime: string | null }): FreshnessState {
  return {
    localTime: answer.localTime,
    updatedAt: answer.updatedAt,
    // the first answer is not a change: the page has just loaded that data itself
    version: prev.updatedAt !== null && answer.updatedAt !== prev.updatedAt ? prev.version + 1 : prev.version,
  };
}
