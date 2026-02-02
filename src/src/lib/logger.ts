/**
 * Structured logging utility
 * Provides consistent log formatting for debugging and monitoring
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === "development";

  private formatLog(entry: LogEntry): string {
    if (this.isDevelopment) {
      // Pretty print in development
      const prefix = `[${entry.timestamp}] ${entry.level.toUpperCase()}:`;
      let output = `${prefix} ${entry.message}`;
      if (entry.context) {
        output += `\n  Context: ${JSON.stringify(entry.context, null, 2)}`;
      }
      if (entry.error) {
        output += `\n  Error: ${entry.error.name}: ${entry.error.message}`;
        if (entry.error.stack) {
          output += `\n  Stack: ${entry.error.stack}`;
        }
      }
      return output;
    }
    // JSON format for production (better for log aggregation)
    return JSON.stringify(entry);
  }

  private log(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    const formattedLog = this.formatLog(entry);

    switch (level) {
      case "debug":
        if (this.isDevelopment) console.debug(formattedLog);
        break;
      case "info":
        console.info(formattedLog);
        break;
      case "warn":
        console.warn(formattedLog);
        break;
      case "error":
        console.error(formattedLog);
        break;
    }
  }

  debug(message: string, context?: LogContext): void {
    this.log("debug", message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log("info", message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log("warn", message, context);
  }

  error(message: string, error?: Error, context?: LogContext): void {
    this.log("error", message, context, error);
  }

  // Specific log methods for common operations
  apiRequest(method: string, path: string, context?: LogContext): void {
    this.info(`API Request: ${method} ${path}`, { ...context, type: "api_request" });
  }

  apiResponse(method: string, path: string, statusCode: number, durationMs: number): void {
    this.info(`API Response: ${method} ${path} - ${statusCode} (${durationMs}ms)`, {
      type: "api_response",
      statusCode,
      durationMs,
    });
  }

  apiError(method: string, path: string, error: Error, context?: LogContext): void {
    this.error(`API Error: ${method} ${path}`, error, { ...context, type: "api_error" });
  }

  dbQuery(operation: string, model: string, durationMs?: number): void {
    this.debug(`DB Query: ${operation} on ${model}`, {
      type: "db_query",
      operation,
      model,
      durationMs,
    });
  }

  dbError(operation: string, model: string, error: Error): void {
    this.error(`DB Error: ${operation} on ${model}`, error, {
      type: "db_error",
      operation,
      model,
    });
  }

  auth(event: string, userId?: string, context?: LogContext): void {
    this.info(`Auth: ${event}`, { ...context, type: "auth", userId });
  }

  webhook(provider: string, event: string, success: boolean, context?: LogContext): void {
    const level = success ? "info" : "error";
    this.log(level, `Webhook: ${provider} - ${event}`, {
      ...context,
      type: "webhook",
      provider,
      event,
      success,
    });
  }
}

// Export singleton instance
export const logger = new Logger();
