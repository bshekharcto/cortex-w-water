import { useCallback, useEffect, useRef, useState } from 'react';
import {
  householdApi,
  type HouseholdBills,
  type HouseholdCore,
  type HouseholdDocuments,
  type HouseholdHardware,
} from '@/services/api/householdApi';

export type PartState = 'idle' | 'loading' | 'done' | 'error';
export type PartName = 'bills' | 'hardware' | 'documents';

interface Parts {
  bills: HouseholdBills | null;
  hardware: HouseholdHardware | null;
  documents: HouseholdDocuments | null;
}

const IDLE: Record<PartName, PartState> = { bills: 'idle', hardware: 'idle', documents: 'idle' };
const FETCH: { [K in PartName]: (id: string | number) => Promise<NonNullable<Parts[K]>> } = {
  bills: householdApi.bills,
  hardware: householdApi.hardware,
  documents: householdApi.documents,
};

/**
 * What the Household 360 drawer shows, in the order it is needed. Opening a household asks only for the core part (who it
 * is, its meters, ten days of readings: database reads, fast). The bill, the radio details and the photographs come from
 * slower sources and are asked for the first time their tab is opened, one request each. Switching household throws away
 * the old answers, and a slow answer for a household that is no longer open is ignored.
 */
export function useHouseholdParts(lookupKey: string | number) {
  const keyRef = useRef(lookupKey);
  keyRef.current = lookupKey;

  const [core, setCore] = useState<HouseholdCore | null>(null);
  const [coreState, setCoreState] = useState<'loading' | 'done' | 'error'>('loading');
  const [coreError, setCoreError] = useState<string | null>(null);
  const [parts, setParts] = useState<Parts>({ bills: null, hardware: null, documents: null });
  const [states, setStates] = useState<Record<PartName, PartState>>(IDLE);

  const loadCore = useCallback(() => {
    const key = lookupKey;
    setCoreState('loading');
    setCoreError(null);
    householdApi
      .core(key)
      .then((res) => {
        if (keyRef.current !== key) return;
        setCore(res);
        setCoreState('done');
      })
      .catch((err) => {
        if (keyRef.current !== key) return;
        setCoreError((err as { status?: number })?.status === 404 ? 'This household was not found.' : (err as { operatorMessage?: string })?.operatorMessage || 'Could not load this household.');
        setCoreState('error');
      });
  }, [lookupKey]);

  // another household: everything starts again
  useEffect(() => {
    setCore(null);
    setParts({ bills: null, hardware: null, documents: null });
    setStates(IDLE);
    loadCore();
  }, [lookupKey, loadCore]);

  const load = useCallback(
    (part: PartName) => {
      const key = lookupKey;
      setStates((s) => ({ ...s, [part]: 'loading' }));
      FETCH[part](key)
        .then((res) => {
          if (keyRef.current !== key) return;
          setParts((p) => ({ ...p, [part]: res }));
          setStates((s) => ({ ...s, [part]: 'done' }));
        })
        .catch((err) => {
          if (keyRef.current !== key) return;
          console.warn(`[households] Failed to fetch ${part}:`, err);
          setStates((s) => ({ ...s, [part]: 'error' }));
        });
    },
    [lookupKey]
  );

  /** Asks for a part the first time it is needed (a part already loading, loaded or failed is left alone; use `load` to retry). */
  const ensure = useCallback(
    (part: PartName) => {
      if (states[part] === 'idle') load(part);
    },
    [states, load]
  );

  return { core, coreState, coreError, reloadCore: loadCore, parts, states, ensure, load };
}
