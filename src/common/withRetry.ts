/**
 * Wraps an async operation with Exponential Backoff.
 * Retries only on 429 (Rate Limit) or 5xx (Server Errors).
 * * @param operation - The async function to run
 * @param retries - Max retries (default 3)
 * @param delay - Initial delay in ms (default 500)
 */

export async function withRetry<T>(
  operation: () => Promise<T>,
  retries = 3,
  delay = 500
): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    // If no retries left we shall stop.
    if (retries <= 0) {
      throw error;
    }

    // We check the code
    const code = error.code || error.response?.code;
    // Retry on 429 or 5xx.
    const isRetryable = code === 429 || (code >= 500 && code < 600) || !code;
    if (!isRetryable) throw error;

    console.warn(
      `[LazyAppwrite] Rate Limited/Server Error (${code}). Retrying in ${delay}ms...`
    );
    await new Promise((res) => setTimeout(res, delay));

    // Retry with double delay (Exponential: 500ms -> 1000ms -> 2000ms)
    return withRetry(operation, retries - 1, delay * 2);
  }
}
