// Simple utility so you can centralize all timeouts (easy to cancel on route changes).
export function cancelAll(timeouts) {
  timeouts.forEach(clearTimeout);
  timeouts.length = 0;
}
