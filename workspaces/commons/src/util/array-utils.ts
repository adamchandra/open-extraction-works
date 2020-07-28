//

export type SlidingWindowFunc = <A>(xs: ReadonlyArray<A>) => ReadonlyArray<ReadonlyArray<A>>;

export function slidingWindow(
  window: number,
  offset: number = 1
): SlidingWindowFunc {
  return xs => (
    xs.length < window ? [] :
      [xs.slice(0, window), ...slidingWindow(window, offset)(xs.slice(offset))]
  );
}
