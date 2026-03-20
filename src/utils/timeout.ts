/**
 * 超时控制工具
 */

/**
 * 创建一个可中止的超时 Promise
 */
export function createTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string = 'Operation timed out'
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`${message} (${timeoutMs}ms)`));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

/**
 * 创建一个可中止的异步迭代器包装器
 */
export async function* withTimeout<T>(
  iterable: AsyncIterable<T>,
  timeoutMs: number,
  message: string = 'Operation timed out'
): AsyncIterable<T> {
  const iterator = iterable[Symbol.asyncIterator]();
  let timeoutId: NodeJS.Timeout | null = null;

  const clearTimeout_ = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const resetTimeout = () => {
    clearTimeout_();
    return new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`${message} (${timeoutMs}ms)`));
      }, timeoutMs);
    });
  };

  try {
    while (true) {
      const result = await Promise.race([
        iterator.next(),
        resetTimeout()
      ]);

      clearTimeout_();

      if (result.done) {
        return;
      }

      yield result.value;
    }
  } finally {
    clearTimeout_();
    // 尝试清理迭代器
    if (iterator.return) {
      await iterator.return();
    }
  }
}

/**
 * 延迟执行
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 重试函数
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    delayMs?: number;
    backoff?: boolean;
  } = {}
): Promise<T> {
  const { maxRetries = 3, delayMs = 1000, backoff = true } = options;
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error as Error;
      
      if (attempt < maxRetries) {
        const waitTime = backoff ? delayMs * Math.pow(2, attempt) : delayMs;
        await delay(waitTime);
      }
    }
  }
  
  throw lastError || new Error('Retry failed');
}
