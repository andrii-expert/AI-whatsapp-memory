import pino from "pino";

// Disable pino-pretty on Windows to avoid worker thread issues
const isWindows = process.platform === "win32";
const isDevelopment = process.env.NODE_ENV === "development";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  // Use pretty printing in development (but not on Windows)
  ...(isDevelopment && !isWindows && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "HH:MM:ss",
        ignore: "pid,hostname",
        messageFormat: true,
        hideObject: false,
      },
    },
  }),
});

export default logger;