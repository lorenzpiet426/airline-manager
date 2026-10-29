import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAircraftType } from '../../data/aircraft';
import { BASE_RUN_USD_YEAR, BASE_SETUP_USD, baseRight, stationOf, stationsOf } from '../../engine/bases';
import type { CommandError } from '../../engine/commands';
import { priceLevelAt } from '../../engine/era';
import { gatesOf } from '../../engine/hub';
import { convert, money } from '../../engine/money';
import { pairsOfAircraft } from '../../engine/schedule';
import type { Airline, GameState } from '../../engine/state';
import type { EngineWorld } from '../../engine/world';
import { sendCommand } from '../../game/store';
import { formatMoney } from '../../i18n/format';
import { useSettings } from '../../settings/settings';
import { Panel } from '../components/Panel';
import { useGameWorld } from '../game/useEngineWorld';
import { AirportSearch } from '../map/AirportSearch';

/** Your bases (Phase 7.4): the hub and the bases, the aircraft stationed at each, opening and closing bases. */
export function BasesView({ game, world, airline, code }: { game: GameState; world: EngineWorld; airline: Airline; code: (id: string) => string }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const screenWorld = useGameWorld();
  const [pick, setPick] = useState<string | null>(null);
  const [error, setError] = useState<CommandError | null>(null);
  const level = priceLevelAt(game.time);
  const book = (usd: number) => formatMoney(language, convert(money(usd, 'USD'), airline.currency, game.fx), false);
  const stations = stationsOf(airline);
  const fleet = Object.values(game.aircraft).filter((a) => a.airlineId === airline.id);
  const run = async (command: Parameters<typeof sendCommand>[0]) => {
    const r = await sendCommand(command);
    setError(r.ok ? null : r.error);
    return r.ok;
  };
  const right = pick ? baseRight(game, world, airline, pick) : null;
  const picked = pick ? world.airportById.get(pick) : undefined;

  return (
    <>
      <Panel title={t('bases.title')} code="BASE">
        <p className="muted small">{t('bases.intro')}</p>
        <table className="table">
          <thead>
            <tr>
              <th>{t('bases.station')}</th>
              <th className="num">{t('bases.aircraft')}</th>
              <th className="num">{t('bases.routes')}</th>
              <th className="num">{t('bases.gates')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {stations.map((id) => {
              const g = gatesOf(airline, id);
              return (
                <tr key={id}>
                  <td>
                    <span className="mono">{code(id)}</span> <span className="muted small">{id === airline.hubId ? t('bases.hub') : t('bases.base')}</span>
                  </td>
                  <td className="num mono">{fleet.filter((a) => stationOf(airline, a) === id).length}</td>
                  <td className="num mono">{Object.values(game.routes).filter((r) => r.airlineId === airline.id && r.originId === id).length}</td>
                  <td className="num mono">{g ? g.contact + g.remote : 0}</td>
                  <td>
                    {id !== airline.hubId && (
                      <button type="button" className="button button--small" onClick={() => void run({ type: 'CloseBase', airlineId: airline.id, payload: { airportId: id } })}>
                        {t('bases.close')}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <span className="field__label">{t('bases.open')}</span>
        {picked ? (
          <div className="notice">
            <p>
              <span className="mono">{picked.iata ?? picked.id}</span> · {picked.name}
            </p>
            {right ? (
              <p className="small text--caution">{t(`errors.${right}`)}</p>
            ) : (
              <p className="small">{t('bases.cost', { setup: book(BASE_SETUP_USD * level), run: book(BASE_RUN_USD_YEAR * level) })}</p>
            )}
            <div className="toolbar-row">
              <button
                type="button"
                className="button button--primary"
                disabled={!!right}
                onClick={() => void run({ type: 'OpenBase', airlineId: airline.id, payload: { airportId: picked.id } }).then((ok) => ok && setPick(null))}
              >
                {t('bases.openButton')}
              </button>
              <button type="button" className="button" onClick={() => setPick(null)}>
                {t('network.change')}
              </button>
            </div>
          </div>
        ) : (
          screenWorld && <AirportSearch world={screenWorld} onPick={(a) => setPick(a.id)} />
        )}
        {error && <p className="notice notice--error">{t(`errors.${error}`)}</p>}
      </Panel>

      <Panel title={t('bases.stationed')} code="ACFT">
        <p className="muted small">{t('bases.stationedNote')}</p>
        <table className="table">
          <thead>
            <tr>
              <th>{t('bases.registration')}</th>
              <th>{t('airlines.type')}</th>
              <th>{t('bases.station')}</th>
            </tr>
          </thead>
          <tbody>
            {fleet.map((a) => {
              const flying = pairsOfAircraft(game, a.id).length > 0;
              return (
                <tr key={a.id}>
                  <td className="mono">{a.registration}</td>
                  <td>{getAircraftType(a.typeId).name}</td>
                  <td>
                    {flying || stations.length < 2 ? (
                      <span className="mono">{code(stationOf(airline, a))}</span>
                    ) : (
                      <select
                        className="input"
                        value={stationOf(airline, a)}
                        aria-label={t('bases.station')}
                        onChange={(e) => void run({ type: 'StationAircraft', airlineId: airline.id, payload: { aircraftId: a.id, airportId: e.target.value } })}
                      >
                        {stations.map((id) => (
                          <option key={id} value={id}>
                            {code(id)}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
