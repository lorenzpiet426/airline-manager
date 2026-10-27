import { Fragment, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Panel } from '../components/Panel';
import { TailFin } from '../components/TailFin';
import { useWorld } from '../../data/world';
import { closeGame, deleteSave, exportSave, importSave, loadSlot, saveCopy, useCurrentSlotId, useGame, useSlots } from '../../game/store';
import { toDate } from '../../engine/time';
import { SAVE_EXTENSION } from '../../persistence/saveFile';
import { storageEstimate, type SlotMeta } from '../../persistence/saves';
import { formatGameDate, formatNumber, localeFor } from '../../i18n/format';
import { useSettings } from '../../settings/settings';
import { hrefFor } from '../navigation';

/** Offers a file to the player (download on computers, share/save sheet on phones). */
function downloadFile(bytes: Uint8Array, fileName: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const mb = (bytes: number) => bytes / 1024 / 1024;

/** Save slots: every game autosaves into its own slot; copies are snapshots to go back to; export/import as files. */
export function SavesScreen() {
  const { t } = useTranslation();
  const { language } = useSettings();
  const world = useWorld();
  const game = useGame();
  const currentId = useCurrentSlotId();
  const slots = useSlots();
  const [copyName, setCopyName] = useState('');
  const [notice, setNotice] = useState<{ level: 'info' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [storage, setStorage] = useState<Awaited<ReturnType<typeof storageEstimate>>>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void storageEstimate().then(setStorage);
  }, [slots]);

  const games = slots.filter((s) => s.kind === 'game');
  const copiesOf = (id: string) => slots.filter((s) => s.kind === 'copy' && s.gameId === id);
  const savedAt = (ms: number) => new Intl.DateTimeFormat(localeFor(language), { dateStyle: 'medium', timeStyle: 'short' }).format(ms);
  const hub = (id: string) => world?.airportById.get(id)?.iata ?? id;

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setNotice(null);
    try {
      await task();
    } catch {
      setNotice({ level: 'error', text: t('saves.failed') });
    } finally {
      setBusy(false);
    }
  };

  const onExport = (slot: SlotMeta) =>
    run(async () => {
      const file = await exportSave(slot.id);
      if (file) downloadFile(file.bytes, file.fileName);
    });

  const onLoad = (slot: SlotMeta) =>
    run(async () => {
      const question = slot.kind === 'copy' ? t('saves.restoreConfirm', { name: slot.name }) : null;
      if (question && !window.confirm(question)) return;
      const ok = await loadSlot(slot.id);
      if (ok) window.location.hash = hrefFor('ops');
      else setNotice({ level: 'error', text: t('saves.loadFailed') });
    });

  const onDelete = (slot: SlotMeta) =>
    run(async () => {
      const key = slot.kind === 'game' ? 'saves.deleteGameConfirm' : 'saves.deleteCopyConfirm';
      if (!window.confirm(t(key, { name: slot.name, count: copiesOf(slot.id).length }))) return;
      await deleteSave(slot.id);
    });

  const onImport = (file: File) =>
    run(async () => {
      const ok = await importSave(new Uint8Array(await file.arrayBuffer()));
      if (ok) setNotice({ level: 'info', text: t('saves.imported') });
      else setNotice({ level: 'error', text: t('saves.importFailed') });
    });

  const slotRow = (slot: SlotMeta, copy = false) => (
    <li key={slot.id} className={`save-row${copy ? ' save-row--copy' : ''}${slot.id === currentId ? ' save-row--current' : ''}`}>
      {!copy && <TailFin primary={slot.colors.primary} secondary={slot.colors.secondary} size={32} />}
      <div className="save-row__text">
        <span className="save-row__name">
          {copy ? `↳ ${slot.name}` : slot.airlineName}
          {slot.id === currentId && <span className="chip chip--normal"> {t('saves.open')}</span>}
        </span>
        <span className="muted small mono">
          {!copy && `${slot.iata} · ${hub(slot.hubId)} · `}
          {formatGameDate(language, toDate(slot.gameTime), false)} · {slot.bytes < 1024 * 1024 ? `${formatNumber(language, Math.ceil(slot.bytes / 1024))} KB` : `${formatNumber(language, mb(slot.bytes), 1)} MB`}
        </span>
        <span className="muted small">{t('saves.savedAt', { when: savedAt(slot.savedAt) })}</span>
      </div>
      <div className="save-row__actions">
        {slot.id !== currentId && (
          <button type="button" className="button button--small button--primary" disabled={busy} onClick={() => void onLoad(slot)}>
            {copy ? t('saves.restore') : t('saves.continue')}
          </button>
        )}
        <button type="button" className="button button--small" disabled={busy} onClick={() => void onExport(slot)}>
          {t('saves.export')}
        </button>
        <button type="button" className="button button--small button--danger" disabled={busy} onClick={() => void onDelete(slot)}>
          {t('saves.delete')}
        </button>
      </div>
    </li>
  );

  return (
    <div className="screen screen--narrow">
      <h1 className="screen__title">{t('saves.title')}</h1>
      <p className="muted">{t('saves.intro')}</p>
      {notice && <p className={`notice notice--${notice.level === 'error' ? 'error' : 'ok'}`}>{notice.text}</p>}

      {game && currentId && (
        <Panel title={t('saves.currentTitle')} code="AUTO">
          <p className="muted small">{t('saves.autosave')}</p>
          <label className="field">
            <span className="field__label">{t('saves.copyName')}</span>
            <input className="input" value={copyName} maxLength={40} placeholder={t('saves.copyPlaceholder')} onChange={(e) => setCopyName(e.target.value)} />
          </label>
          <div className="button-row">
            <button
              type="button"
              className="button button--primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (await saveCopy(copyName || formatGameDate(language, toDate(game.time), false))) {
                    setCopyName('');
                    setNotice({ level: 'info', text: t('saves.copied') });
                  }
                })
              }
            >
              {t('saves.saveCopy')}
            </button>
            <button type="button" className="button" disabled={busy} onClick={() => void run(async () => closeGame())}>
              {t('saves.close')}
            </button>
          </div>
        </Panel>
      )}

      <Panel title={t('saves.listTitle')} code={String(games.length)}>
        {games.length === 0 ? (
          <p className="muted">{t('saves.empty')}</p>
        ) : (
          <ul className="save-list">
            {games.map((slot) => (
              <Fragment key={slot.id}>
                {slotRow(slot)}
                {copiesOf(slot.id).map((c) => slotRow(c, true))}
              </Fragment>
            ))}
          </ul>
        )}
        <div className="button-row">
          <a href={hrefFor('new')} className="button">
            {t('ops.newGame')}
          </a>
          <button type="button" className="button" disabled={busy} onClick={() => fileInput.current?.click()}>
            {t('saves.import')}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept={`${SAVE_EXTENSION},.json,application/octet-stream,application/json`}
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void onImport(file);
            }}
          />
        </div>
        <p className="muted small">{t('saves.exportNote')}</p>
        {storage && (
          <p className="muted small">
            {t('saves.storage', { used: formatNumber(language, mb(storage.usage), 1), quota: formatNumber(language, mb(storage.quota)) })}{' '}
            {storage.persisted ? t('saves.persisted') : t('saves.notPersisted')}
          </p>
        )}
      </Panel>
    </div>
  );
}
