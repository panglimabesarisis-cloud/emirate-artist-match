/** Retry only public reads after a transient transport failure, never writes or authorization errors. */
export async function recoverPublicRead<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (!(error instanceof TypeError) || !/failed to fetch|networkerror|load failed/i.test(error.message)) throw error;
    await new Promise<void>(resolve => setTimeout(resolve, 300));
    return read();
  }
}