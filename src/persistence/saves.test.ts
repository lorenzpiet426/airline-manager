import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { strToU8 } from 'fflate';
import { createGame, migrate } from '../engine/game';
import { decodeSave, encodeSave, summarize } from './saveFile';
import { deleteSlot, listSlots, newSlotId, readSlot, writeSlot, type SlotMeta } from './saves';

const game = () => {
  const state = createGame({ seed: 7, startYear: 2026, timeMode: 'realtime', realism: 'realistic', scheduling: 'detailed' });
  state.airlines.AL1 = {
    id: 'AL1', name: 'Danube Air', iata: 'D7', icao: 'DNB', controller: 'human', hubId: 'LOWW', colors: { primary: '#c8102e', secondary: '#ffffff' },
    currency: 'EUR', cash: { amount: 75_000_000, currency: 'EUR' }, foundedAt: state.time,
  };
  return state;
};

describe('save files', () => {
  it('packs a game small and reads it back unchanged', () => {
    const state = game();
    const bytes = encodeSave(state, 'test', 1);
    expect(bytes[0]).toBe(0x1f); // gzip
    expect(bytes.byteLength).toBeLessThan(JSON.stringify(state).length / 3);
    const back = decodeSave(bytes);
    expect(back.name).toBe('test');
    expect(back.state).toEqual(state);
    expect(migrate(back.state)).not.toBeNull();
  });

  it('accepts the old plain autosave and refuses anything else', () => {
    const state = game();
    expect(decodeSave(strToU8(JSON.stringify(state))).state).toEqual(state);
    expect(() => decodeSave(strToU8('{"hello":1}'))).toThrow();
    expect(() => decodeSave(new Uint8Array([1, 2, 3]))).toThrow();
  });

  it('summarizes the player airline for the save list', () => {
    expect(summarize(game())).toMatchObject({ airlineName: 'Danube Air', iata: 'D7', hubId: 'LOWW' });
  });
});

describe('save slots (IndexedDB)', () => {
  const meta = (id: string, kind: 'game' | 'copy', gameId: string, savedAt: number): SlotMeta => ({
    ...summarize(game()), id, kind, gameId, name: id, savedAt, bytes: 3,
  });

  it('writes, lists newest first, reads and deletes a game with its copies', async () => {
    const g = newSlotId('game');
    const other = newSlotId('game');
    await writeSlot(meta(g, 'game', g, 1), new Uint8Array([1, 2, 3]));
    await writeSlot(meta('copy-a', 'copy', g, 2), new Uint8Array([4]));
    await writeSlot(meta(other, 'game', other, 3), new Uint8Array([5]));
    expect((await listSlots()).map((s) => s.id)).toEqual([other, 'copy-a', g]);
    expect((await readSlot('copy-a'))!.data).toEqual(new Uint8Array([4]));
    await deleteSlot(g);
    expect((await listSlots()).map((s) => s.id)).toEqual([other]);
    expect(await readSlot('copy-a')).toBeNull();
  });
});
