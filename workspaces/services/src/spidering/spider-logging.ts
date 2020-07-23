import winston, {
  createLogger,
  transports,
  format,
} from "winston";

const cli = winston.config.cli;

const _logger = createLogger({
  level: 'silly',
  levels: cli.levels,
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.simple(),
      ),
    })
  ],
});

export const getSpiderLogger = () => _logger;

