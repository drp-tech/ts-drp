/**
 * Creates an `AbortSignal` that automatically aborts after the specified timeout.
 *
 * This utility is useful for race-based async control flows where you want to
 * abort a pending operation if it takes too long.
 * @param ms - Timeout duration in milliseconds before the signal is aborted.
 * @returns
 *  An object containing:
 *   - `signal`: The AbortSignal to use in an async operation.
 *   - `cleanup`: A function to cancel the timeout early if the operation completes in time.
 * @example
 * const { signal, cleanup } = timeoutSignal(5000);
 * try {
 *   await someAsyncOperation({ signal });
 * } catch (err) {
 *   if (err.name === "AbortError") {
 *     console.error("Operation timed out");
 *   }
 * } finally {
 *   cleanup();
 * }
 */
export function timeoutSignal(ms: number): { signal: AbortSignal; cleanup(): void } {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), ms);
	const cleanup = (): void => clearTimeout(timeout);
	return { signal: controller.signal, cleanup };
}
