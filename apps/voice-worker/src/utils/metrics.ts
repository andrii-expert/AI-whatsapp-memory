import { logger } from '@imaginecalendar/logger';

type MetricTags = Record<string, string | number | boolean | undefined>;

interface MetricsClient {
  increment: (name: string, tags?: MetricTags) => void;
}

export const metrics: MetricsClient = {
  increment(name, tags) {
    logger.debug({ metric: name, tags }, 'metrics.increment');
  },
};
