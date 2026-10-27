import { useMemo } from 'react';
import type { Feature, LineString, Point } from 'geojson';
import { airborne, weeklyLegs } from '../../engine/flights';
import { greatCirclePoints } from '../../engine/geo';
import type { GameState } from '../../engine/state';
import type { EngineWorld } from '../../engine/world';
import { playerAirlineId } from '../../game/store';
import type { MapOverlay } from './WorldMap';

/** Longitudes that keep going past ±180°, so a line across the Pacific doesn't jump around the world. */
function unwrap(points: { lat: number; lon: number }[]): [number, number][] {
  const out: [number, number][] = [];
  let shift = 0;
  points.forEach((p, i) => {
    if (i > 0) {
      const prev = points[i - 1]!.lon;
      if (p.lon - prev > 180) shift -= 360;
      else if (prev - p.lon > 180) shift += 360;
    }
    out.push([p.lon + shift, p.lat]);
  });
  return out;
}

/** Your routes as great-circle lines plus every aircraft that is airborne right now. */
export function useNetworkOverlay(game: GameState | null, world: EngineWorld | null): MapOverlay | null {
  const airlineId = game ? playerAirlineId(game) : null;
  const airline = game && airlineId ? game.airlines[airlineId] : undefined;
  // Only rebuild lines and timetables when routes change, not on every clock tick.
  const routeKey = game
    ? JSON.stringify(Object.values(game.routes).map((r) => [r.id, r.destinationId, r.aircraftId, r.frequency, r.flightNumber]))
    : '';

  const network = useMemo(() => {
    if (!game || !world || !airlineId) return null;
    const routes = Object.values(game.routes).filter((r) => r.airlineId === airlineId);
    const lines: Feature<LineString>[] = routes.flatMap((r) => {
      const from = world.airportById.get(r.originId);
      const to = world.airportById.get(r.destinationId);
      if (!from || !to) return [];
      return [{ type: 'Feature', properties: { id: r.id }, geometry: { type: 'LineString', coordinates: unwrap(greatCirclePoints(from, to, 50)) } }];
    });
    const aircraftIds = [...new Set(routes.map((r) => r.aircraftId))];
    return { lines, legs: aircraftIds.map((id) => weeklyLegs(game, world, id)) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey, world, airlineId]);

  return useMemo(() => {
    if (!game || !world || !network || !airline) return null;
    const planes: Feature<Point>[] = [];
    for (const legs of network.legs) {
      const aircraft = legs[0] && game.aircraft[legs[0].aircraftId];
      if (!aircraft || aircraft.status !== 'active') continue;
      const flight = airborne(legs, world, game.time);
      if (!flight) continue;
      planes.push({
        type: 'Feature',
        properties: { heading: flight.heading, label: `${airline.iata}${flight.leg.flightNumber} ${aircraft.registration}` },
        geometry: { type: 'Point', coordinates: [flight.lon, flight.lat] },
      });
    }
    return {
      routes: { type: 'FeatureCollection', features: network.lines },
      planes: { type: 'FeatureCollection', features: planes },
      color: airline.colors.primary,
    };
  }, [game, world, network, airline]);
}
