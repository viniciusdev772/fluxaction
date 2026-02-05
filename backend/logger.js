import winston from 'winston'

const { combine, timestamp, json, errors } = winston.format

// Determine log level from environment
const logLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug')

// Create logger instance
const logger = winston.createLogger({
  level: logLevel,
  defaultMeta: {
    service: 'fluxaction-backend',
    environment: process.env.NODE_ENV || 'development',
  },
  format: combine(
    timestamp(),
    errors({ stack: true }),
    json()
  ),
  transports: [
    // Write all logs to console
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'development' 
        ? winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        : undefined
    }),
  ],
})

// Add file transport in production
if (process.env.NODE_ENV === 'production' && process.env.LOG_FILE_PATH) {
  logger.add(new winston.transports.File({
    filename: process.env.LOG_FILE_PATH,
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }))
}

// Create a child logger with request context
export const createRequestLogger = (req) => {
  return logger.child({
    requestId: req.headers['x-request-id'] || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    ip: req.ip,
    method: req.method,
    path: req.path,
  })
}

export default logger
