// Death/revival debounce per build brief §5.2: an endpoint is only marked dead after
// two consecutive failed probes (so a real death surfaces up to 12h late), and only
// revived on the first success after ≥2 dead probes.

export type Transition = "died" | "revived" | null;

/**
 * @param history probe alive flags BEFORE the current probe, most recent first
 * @param current the probe that just ran
 */
export function transition(history: boolean[], current: boolean): Transition {
  if (history.length < 2) return null;
  const [prev, prevPrev] = history;
  if (!current && prev === false && prevPrev === true) return "died";
  if (current && prev === false && prevPrev === false) return "revived";
  return null;
}
