import { describe, it, expect, vi, afterEach } from 'vitest';
import { copyText } from '../utils/clipboard';

afterEach(() => vi.unstubAllGlobals());

function fakeDom(execResult: boolean | 'throw') {
  const calls: string[] = [];
  const ta = { value: '', style: { cssText: '' }, setAttribute: () => {}, select: () => calls.push('select') };
  vi.stubGlobal('document', {
    createElement: () => ta,
    body: { appendChild: () => calls.push('append'), removeChild: () => calls.push('remove') },
    execCommand: () => {
      calls.push('exec');
      if (execResult === 'throw') throw new Error('blocked');
      return execResult;
    },
  });
  return { ta, calls };
}

describe('copyText', () => {
  it('uses the modern clipboard API when it works', async () => {
    let written = '';
    vi.stubGlobal('navigator', { clipboard: { writeText: async (t: string) => void (written = t) } });
    expect(await copyText('0025016559')).toBe(true);
    expect(written).toBe('0025016559');
  });

  it('falls back to the legacy route when the modern one is refused', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: async () => { throw new Error('denied'); } } });
    const { ta, calls } = fakeDom(true);
    expect(await copyText('506f980000018b76')).toBe(true);
    expect(ta.value).toBe('506f980000018b76');
    expect(calls).toEqual(['append', 'select', 'exec', 'remove']);
  });

  it('falls back when there is no clipboard API at all', async () => {
    vi.stubGlobal('navigator', {});
    fakeDom(true);
    expect(await copyText('x')).toBe(true);
  });

  it('reports failure (never throws) when both routes fail', async () => {
    vi.stubGlobal('navigator', {});
    fakeDom(false);
    expect(await copyText('x')).toBe(false);
    fakeDom('throw');
    expect(await copyText('x')).toBe(false);
  });
});
