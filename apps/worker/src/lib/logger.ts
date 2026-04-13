import pino from "pino"
import { getConfig } from "../config.js"

let _logger: pino.Logger | null = null

export function getLogger(): pino.Logger {
  if (!_logger) {
    const config = getConfig()
    _logger = pino({
      level: config.LOG_LEVEL,
      name: "vitasync-worker",
    })
  }
  return _logger
}
