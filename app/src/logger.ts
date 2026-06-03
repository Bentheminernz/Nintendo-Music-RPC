/** Utility for consistent logging */
export interface Logger {
  log: (message: string, ...details: unknown[]) => void;
  warn: (message: string, ...details: unknown[]) => void;
}

/** Creates the logger 
 * @param scope A label to prefix all messages with
 * @returns A logger instance with `log` and `warn` methods
*/
export function createLogger(scope: string): Logger {
  const prefix = `[Nintendo Music][${scope}]`;
  return {
    log: (message, ...details) => console.log(`${prefix} ${message}`, ...details),
    warn: (message, ...details) => console.warn(`${prefix} ${message}`, ...details),
  };
}
