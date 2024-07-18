import {logger} from "./logger";

export const getEnvOrExit = (key: string, defaultValue: string = "", exit: boolean = true): string => {
  const value = process.env[key];
  const result = value || defaultValue;
  if ((!result || result === "") && exit) {
    logger.error(`Required env var '${key}' missing`);
    process.exit(1);
  }
  return result;
}

export function sleep(ms: number) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

export const fetchWithRetry = async<T>(func: Promise<T>, retries: number = 3, retryDelay = 1000): Promise<T> => {
  let err;
  for (let i = 0; i < retries; i++) {
    try {
      return await func;
    } catch (e) {
      err = e
      await sleep(retryDelay);
    }
  }
  throw err;
}
