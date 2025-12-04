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
    const errorCodes = [429, 501, 502, 503]; // Error limits
    const isRetryable = errorCodes.includes(code) || !code;
    if (!isRetryable) throw error;

    await new Promise((res) => setTimeout(res, delay));

    // Retry with double delay (Exponential: 500ms -> 1000ms -> 2000ms)
    return withRetry(operation, retries - 1, delay * 2);
  }
}
