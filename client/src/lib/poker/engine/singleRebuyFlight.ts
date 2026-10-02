/** Acquire synchronously, including the capability-check wait before socket send. */
export function runSingleRebuyFlight(
  slot: { current: Promise<void> | null },
  operation: () => Promise<void>,
): Promise<void> {
  if (slot.current) return slot.current;
  const flight = Promise.resolve().then(operation);
  slot.current = flight;
  const release = () => { if (slot.current === flight) slot.current = null; };
  void flight.then(release, release);
  return flight;
}