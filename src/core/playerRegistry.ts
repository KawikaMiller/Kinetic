import { createContext, useContext, useEffect } from 'react';

/** Registers a keyboard-bound player with the lesson page; returns the unregister function. */
export type RegisterPlayer = () => () => void;

export const PlayerRegistryContext = createContext<RegisterPlayer>(() => () => {});

/**
 * Tell the lesson page a player with keyboard shortcuts is mounted, so it can show
 * the "Space / ← → / R" hint only when those keys actually do something.
 */
export function useRegisterPlayer(active: boolean) {
  const register = useContext(PlayerRegistryContext);
  useEffect(() => (active ? register() : undefined), [active, register]);
}
