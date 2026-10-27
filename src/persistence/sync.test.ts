import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteSlot, listSlots, readSlot, writeSlot, type SlotMeta } from './saves';
import { planSync, resolveConflict, runSync, type CloudBackend, type CloudSlot } from './sync';

const meta = (id: string, savedAt: number, extra: Partial<SlotMeta> = {}): SlotMeta => ({
  id, kind: 'game', gameId: id, name: 'Danube Air', savedAt, bytes: 3,
  airlineName: 'Danube Air', iata: 'D7', colors: { primary: '#c8102e', secondary: '#ffffff' }, hubId: 'LOWW', gameTime: 0, version: 7,
  ...extra,
});
const cloudSlot = (id: string, savedAt: number, rev: number): CloudSlot => {
  const { sync: _sync, ...m } = meta(id, savedAt);
  return { ...m, rev, device: 'other' };
};

/** The cloud in memory, like Firestore with revisions. */
function fakeCloud(): CloudBackend & { slots: Map<string, { meta: CloudSlot; data: Uint8Array }> } {
  const slots = new Map<string, { meta: CloudSlot; data: Uint8Array }>();
  return {
    slots,
    list: async () => [...slots.values()].map((s) => s.meta),
    download: async (id) => slots.get(id)?.data ?? null,
    upload: async (m, data, expectedRev) => {
      if ((slots.get(m.id)?.meta.rev ?? 0) !== expectedRev) return null;
      slots.set(m.id, { meta: { ...m, rev: expectedRev + 1, device: 'me' }, data });
      return expectedRev + 1;
    },
    remove: async (id) => void slots.delete(id),
  };
}

describe('sync rules', () => {
  it('uploads new and changed slots, downloads what changed elsewhere, asks when both changed', () => {
    const local = [
      meta('new', 5),
      meta('changedHere', 9, { sync: { rev: 2, savedAt: 5 } }),
      meta('changedThere', 5, { sync: { rev: 2, savedAt: 5 } }),
      meta('both', 9, { sync: { rev: 2, savedAt: 5 } }),
      meta('same', 5, { sync: { rev: 2, savedAt: 5 } }),
      meta('goneElsewhere', 5, { sync: { rev: 1, savedAt: 5 } }),
    ];
    const cloud = [cloudSlot('changedHere', 5, 2), cloudSlot('changedThere', 8, 3), cloudSlot('both', 8, 3), cloudSlot('same', 5, 2), cloudSlot('onlyCloud', 4, 1), cloudSlot('deletedHere', 4, 1)];
    const plan = planSync(local, cloud, new Set(['deletedHere']));
    expect(plan).toEqual(
      expect.arrayContaining([
        { kind: 'upload', id: 'new', expectedRev: 0 },
        { kind: 'upload', id: 'changedHere', expectedRev: 2 },
        { kind: 'download', id: 'changedThere' },
        { kind: 'conflict', id: 'both' },
        { kind: 'removeLocal', id: 'goneElsewhere' },
        { kind: 'download', id: 'onlyCloud' },
        { kind: 'removeCloud', id: 'deletedHere' },
      ]),
    );
    expect(plan.some((a) => a.id === 'same')).toBe(false);
  });
});

describe('syncing two devices', () => {
  beforeEach(async () => {
    for (const s of await listSlots()) await deleteSlot(s.id);
  });

  it('moves a game to the cloud and brings a newer version back', async () => {
    const cloud = fakeCloud();
    await writeSlot(meta('g1', 10), new Uint8Array([1, 2, 3]));
    const first = await runSync(cloud, new Set());
    expect(first.uploaded).toEqual(['g1']);
    expect((await readSlot('g1'))!.meta.sync).toEqual({ rev: 1, savedAt: 10 });

    // Another device plays on and uploads revision 2.
    cloud.slots.set('g1', { meta: cloudSlot('g1', 20, 2), data: new Uint8Array([9, 9]) });
    const second = await runSync(cloud, new Set());
    expect(second.downloaded).toEqual(['g1']);
    const back = (await readSlot('g1'))!;
    expect([...back.data]).toEqual([9, 9]);
    expect(back.meta.sync).toEqual({ rev: 2, savedAt: 20 });

    // An autosave here keeps the sync state, and the next sync uploads it.
    await writeSlot(meta('g1', 30), new Uint8Array([4]));
    expect((await readSlot('g1'))!.meta.sync?.rev).toBe(2);
    expect((await runSync(cloud, new Set())).uploaded).toEqual(['g1']);
    expect(cloud.slots.get('g1')!.meta.rev).toBe(3);
  });

  it('never overwrites the open game while it runs', async () => {
    const cloud = fakeCloud();
    await writeSlot(meta('g1', 10, { sync: { rev: 1, savedAt: 10 } }), new Uint8Array([1]));
    cloud.slots.set('g1', { meta: cloudSlot('g1', 20, 2), data: new Uint8Array([2]) });
    const r = await runSync(cloud, new Set(), (id) => id === 'g1');
    expect(r.downloaded).toEqual([]);
    expect([...(await readSlot('g1'))!.data]).toEqual([1]);
  });

  it('keeps both versions when both devices played: the chosen one in the slot, the other as a copy', async () => {
    const cloud = fakeCloud();
    await writeSlot(meta('g1', 30, { sync: { rev: 1, savedAt: 10 } }), new Uint8Array([1]));
    cloud.slots.set('g1', { meta: cloudSlot('g1', 25, 2), data: new Uint8Array([2]) });
    const r = await runSync(cloud, new Set());
    expect(r.conflicts).toHaveLength(1);
    await resolveConflict(cloud, r.conflicts[0]!, 'local', 'Other device');
    expect(cloud.slots.get('g1')!.meta.rev).toBe(3);
    expect([...cloud.slots.get('g1')!.data]).toEqual([1]);
    const slots = await listSlots();
    const copy = slots.find((s) => s.kind === 'copy')!;
    expect(copy).toMatchObject({ gameId: 'g1', name: 'Other device' });
    expect([...(await readSlot(copy.id))!.data]).toEqual([2]);
    // The copy goes to the cloud too.
    expect((await runSync(cloud, new Set())).uploaded).toEqual([copy.id]);
  });

  it('deletes in the cloud what was deleted here, and here what was deleted elsewhere', async () => {
    const cloud = fakeCloud();
    await writeSlot(meta('a', 10), new Uint8Array([1]));
    await writeSlot(meta('b', 10), new Uint8Array([1]));
    await runSync(cloud, new Set());
    const deleted = new Set(await deleteSlot('a'));
    expect(deleted).toEqual(new Set(['a']));
    cloud.slots.delete('b');
    const r = await runSync(cloud, deleted);
    expect(cloud.slots.has('a')).toBe(false);
    expect(deleted.size).toBe(0);
    expect(r.removedLocal).toEqual(['b']);
    expect(await listSlots()).toEqual([]);
  });
});
