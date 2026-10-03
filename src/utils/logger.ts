type LogLevel = 'info' | 'warn' | 'error' | 'debug';

const COLORS = {
  reset: '\x1b[0m',
  info: '\x1b[36m', // Cyan
  warn: '\x1b[33m', // Yellow
  error: '\x1b[31m', // Red
  debug: '\x1b[90m', // Gray
  brand: '\x1b[35m', // Magenta
};

function formatMessage(level: LogLevel, message: string, meta?: any) {
  const timestamp = new Date().toISOString();
  const color = COLORS[level] || COLORS.reset;
  const metaStr = meta ? ` | ${JSON.stringify(meta)}` : '';
  return `${COLORS.brand}[DineFlow]${COLORS.reset} ${color}[${level.toUpperCase()}]${COLORS.reset} ${timestamp}: ${message}${metaStr}`;
}

export const logger = {
  info: (message: string, meta?: any) => {
    console.log(formatMessage('info', message, meta));
  },
  warn: (message: string, meta?: any) => {
    console.warn(formatMessage('warn', message, meta));
  },
  error: (message: string, meta?: any) => {
    console.error(formatMessage('error', message, meta));
  },
  debug: (message: string, meta?: any) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(formatMessage('debug', message, meta));
    }
  },
};
