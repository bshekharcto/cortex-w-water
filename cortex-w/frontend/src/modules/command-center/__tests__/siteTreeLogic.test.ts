import { describe, expect, it } from 'vitest';
import {
  ancestorsOf,
  buildSiteTree,
  checkedFromValue,
  descendantsOf,
  isPartlyChecked,
  searchSites,
  toggleChecked,
  topChecked,
  valueFromChecked,
} from '../components/siteTreeLogic';

// The real shape: BHUBANESWAR > Satyanagar > DMA 1, DMA 2 ; Puri > Baliapunda, SCS College ; Cuttack ; Ayodhya
const SITES = [
  { id: 'ALL', name: 'All Sites' },
  { id: '6554', name: 'Ayodhya', parentId: null },
  { id: '6394', name: 'BHUBANESWAR', parentId: null },
  { id: '6942', name: 'Satyanagar', parentId: '6394' },
  { id: '6943', name: 'DMA 1', parentId: '6942' },
  { id: '6944', name: 'DMA 2', parentId: '6942' },
  { id: '6916', name: 'Cuttack', parentId: null },
  { id: '6906', name: 'Puri', parentId: null },
  { id: '6908', name: 'Baliapunda', parentId: '6906' },
  { id: '6907', name: 'SCS College', parentId: '6906' },
];
const tree = buildSiteTree(SITES);
const sorted = (set: Iterable<string>) => [...set].sort();

describe('site tree', () => {
  it('skips "All Sites" and finds the roots and the levels', () => {
    expect(tree.byId.has('ALL')).toBe(false);
    expect(sorted(tree.roots)).toEqual(['6394', '6554', '6906', '6916']);
    expect(sorted(descendantsOf(tree, '6394'))).toEqual(['6942', '6943', '6944']);
    expect(ancestorsOf(tree, '6943')).toEqual(['6942', '6394']);
  });

  it('treats a site whose parent the user may not see as a root', () => {
    const t = buildSiteTree([{ id: '1', name: 'A', parentId: '99' }, { id: '2', name: 'B', parentId: '1' }]);
    expect(t.roots).toEqual(['1']);
  });

  it('survives a loop in the data', () => {
    const t = buildSiteTree([{ id: '1', name: 'A', parentId: '2' }, { id: '2', name: 'B', parentId: '1' }]);
    expect(descendantsOf(t, '1').length).toBeLessThanOrEqual(1);
    expect(ancestorsOf(t, '1').length).toBeLessThanOrEqual(1);
  });
});

describe('checking sites', () => {
  it('checking a parent checks everything below it', () => {
    const next = toggleChecked(tree, new Set(), '6906');
    expect(sorted(next)).toEqual(['6906', '6907', '6908']);
  });

  it('checking all the children does not check the parent: it may have meters of its own', () => {
    let set = toggleChecked(tree, new Set(), '6908');
    set = toggleChecked(tree, set, '6907');
    expect(sorted(set)).toEqual(['6907', '6908']);
    expect(valueFromChecked(tree, set).split(',').sort()).toEqual(['6907', '6908']);
    expect(isPartlyChecked(tree, set, '6906')).toBe(true);   // shown with a partial mark, not a full tick
  });

  it('a deep check does not climb the branch either', () => {
    let set = toggleChecked(tree, new Set(), '6943');
    set = toggleChecked(tree, set, '6944');
    expect(sorted(set)).toEqual(['6943', '6944']);
    expect(isPartlyChecked(tree, set, '6394')).toBe(true);
  });

  it('checking the parent itself after its children gives the whole area', () => {
    let set = toggleChecked(tree, new Set(), '6908');
    set = toggleChecked(tree, set, '6906');          // parent not checked yet, so this checks it and all below
    expect(sorted(set)).toEqual(['6906', '6907', '6908']);
    expect(valueFromChecked(tree, set)).toBe('6906');
  });

  it('unchecking a child unchecks the parents above it but not its siblings', () => {
    const all = toggleChecked(tree, new Set(), '6394');
    const next = toggleChecked(tree, all, '6943');
    expect(sorted(next)).toEqual(['6944']);
  });

  it('unchecking a parent unchecks everything below it', () => {
    const all = toggleChecked(tree, new Set(), '6394');
    expect(toggleChecked(tree, all, '6942').has('6943')).toBe(false);
    expect(toggleChecked(tree, all, '6394').size).toBe(0);
  });

  it('does not change the set it was given', () => {
    const before = new Set(['6916']);
    toggleChecked(tree, before, '6906');
    expect(sorted(before)).toEqual(['6916']);
  });

  it('shows a parent as partly checked while only some children are', () => {
    const set = toggleChecked(tree, new Set(), '6908');
    expect(isPartlyChecked(tree, set, '6906')).toBe(true);
    expect(isPartlyChecked(tree, set, '6908')).toBe(false);
    expect(isPartlyChecked(tree, set, '6916')).toBe(false);
  });
});

describe('the value that is sent', () => {
  it('is ALL when nothing is checked', () => {
    expect(valueFromChecked(tree, new Set())).toBe('ALL');
  });

  it('sends only the highest checked sites', () => {
    const set = toggleChecked(tree, toggleChecked(tree, new Set(), '6906'), '6916');
    expect(topChecked(tree, set).sort()).toEqual(['6906', '6916']);
    expect(valueFromChecked(tree, set).split(',').sort()).toEqual(['6906', '6916']);
  });

  it('sends the children when only some of them are checked', () => {
    const set = toggleChecked(tree, new Set(), '6908');
    expect(valueFromChecked(tree, set)).toBe('6908');
  });

  it('reads a value back into checked sites, with their children', () => {
    expect(sorted(checkedFromValue(tree, '6906,6916'))).toEqual(['6906', '6907', '6908', '6916']);
    expect(checkedFromValue(tree, 'ALL').size).toBe(0);
    expect(checkedFromValue(tree, '').size).toBe(0);
    expect(checkedFromValue(tree, '123456').size).toBe(0); // a site that is gone is ignored
  });

  it('a value survives the round trip', () => {
    const value = valueFromChecked(tree, toggleChecked(tree, new Set(), '6942'));
    expect(value).toBe('6942');
    expect(sorted(checkedFromValue(tree, value))).toEqual(['6942', '6943', '6944']);
  });
});

describe('searching', () => {
  it('finds a site and opens the branch above it', () => {
    const found = searchSites(tree, 'dma 1')!;
    expect(sorted(found.show)).toEqual(['6394', '6942', '6943']);
    expect(sorted(found.forceOpen)).toEqual(['6394', '6942']);
  });

  it('shows what is below a matching parent', () => {
    expect(sorted(searchSites(tree, 'puri')!.show)).toEqual(['6906', '6907', '6908']);
  });

  it('ignores case and surrounding spaces, and an empty search shows everything', () => {
    expect(searchSites(tree, '  CUTTACK ')!.show.has('6916')).toBe(true);
    expect(searchSites(tree, '   ')).toBeNull();
  });

  it('matches nothing for an unknown name', () => {
    expect(searchSites(tree, 'zzz')!.show.size).toBe(0);
  });
});
