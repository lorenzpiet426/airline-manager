import { playerAirlineId, useGame } from '../../game/store';

/** The running game and the player's airline (both null when no game is running). */
export function usePlayer() {
  const game = useGame();
  const id = game ? playerAirlineId(game) : null;
  return { game, airline: game && id ? (game.airlines[id] ?? null) : null };
}
