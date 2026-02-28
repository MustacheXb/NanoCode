/**
 * Observation Masking
 * Strategies for masking observations to reduce token usage
 */

import type { Observation } from '../types/index.js';

export type ObservationMaskingStrategy = 'none' | 'truncate' | 'summary' | 'adaptive';

export interface MaskingOptions {
  strategy: ObservationMaskingStrategy;
  maxLength?: number;
  maxCount?: number;
  preserveImportant?: boolean;
}

/**
 * Observation masker for reducing observation token usage
 */
export class ObservationMasker {
  private defaultMaxLength: number;
  private defaultMaxCount: number;

  constructor(maxLength: number = 500, maxCount: number = 50) {
    this.defaultMaxLength = maxLength;
    this.defaultMaxCount = maxCount;
  }

  /**
   * Mask observations using specified strategy
   */
  mask(
    observations: Observation[],
    options?: Partial<MaskingOptions>
  ): Observation[] {
    const opts: Required<MaskingOptions> = {
      strategy: options?.strategy || 'truncate',
      maxLength: options?.maxLength ?? this.defaultMaxLength,
      maxCount: options?.maxCount ?? this.defaultMaxCount,
      preserveImportant: options?.preserveImportant ?? true,
    };

    switch (opts.strategy) {
      case 'none':
        return observations;

      case 'truncate':
        return this.maskByTruncation(observations, opts);

      case 'summary':
        return this.maskBySummary(observations, opts);

      case 'adaptive':
        return this.maskAdaptively(observations, opts);

      default:
        return observations;
    }
  }

  /**
   * Mask by truncating long observations
   */
  private maskByTruncation(
    observations: Observation[],
    options: Required<MaskingOptions>
  ): Observation[] {
    return observations.map(obs => {
      if (obs.content.length <= options.maxLength) {
        return obs;
      }

      return {
        ...obs,
        content: obs.content.substring(0, options.maxLength) + '...[truncated]',
        masked: true,
      };
    });
  }

  /**
   * Mask by replacing with summaries
   */
  private maskBySummary(
    observations: Observation[],
    _options: Required<MaskingOptions>
  ): Observation[] {
    const byType = new Map<Observation['type'], Observation[]>();

    for (const obs of observations) {
      if (!byType.has(obs.type)) {
        byType.set(obs.type, []);
      }
      byType.get(obs.type)!.push(obs);
    }

    const result: Observation[] = [];

    for (const [type, typeObs] of byType.entries()) {
      if (typeObs.length <= 5) {
        // Keep small groups
        result.push(...typeObs);
      } else {
        // Create a summary observation
        const summary = this.createSummaryObservation(type, typeObs);
        result.push(summary);
      }
    }

    return result;
  }

  /**
   * Mask adaptively based on content
   */
  private maskAdaptively(
    observations: Observation[],
    options: Required<MaskingOptions>
  ): Observation[] {
    // Score observations by importance
    const scored = observations.map(obs => ({
      obs,
      score: this.scoreObservation(obs),
    }));

    // Sort by score
    scored.sort((a, b) => b.score - a.score);

    // Keep important observations, mask or remove less important
    const keepThreshold = scored[Math.min(options.maxCount, scored.length - 1)]?.score || 0;

    const result: Observation[] = [];

    for (const { obs, score } of scored) {
      if (score >= keepThreshold && result.length < options.maxCount) {
        // Keep important observations
        if (obs.content.length > options.maxLength) {
          result.push({
            ...obs,
            content: obs.content.substring(0, options.maxLength) + '...[truncated]',
            masked: true,
          });
        } else {
          result.push(obs);
        }
      } else {
        // Mark as masked (don't include in result)
        // Or include a placeholder
        if (options.preserveImportant) {
          result.push({
            ...obs,
            content: `[Observation masked: ${obs.type}]`,
            masked: true,
          });
        }
      }
    }

    // Sort back by timestamp
    result.sort((a, b) => a.timestamp - b.timestamp);

    return result;
  }

  /**
   * Score observation importance
   */
  private scoreObservation(obs: Observation): number {
    let score = 1.0;

    // Recent observations are more important
    const age = Date.now() - obs.timestamp;
    score *= Math.max(0.1, 1 - age / (60 * 60 * 1000)); // Decay over an hour

    // Error observations are more important
    if (obs.content.toLowerCase().includes('error') ||
        obs.content.toLowerCase().includes('failed')) {
      score *= 2.0;
    }

    // File operations are more important
    if (obs.type === 'file_read' || obs.type === 'file_write') {
      score *= 1.5;
    }

    // Tool results with errors are important
    if (obs.type === 'tool_result') {
      if (obs.content.toLowerCase().includes('error')) {
        score *= 2.0;
      }
    }

    return score;
  }

  /**
   * Create a summary observation
   */
  private createSummaryObservation(
    type: Observation['type'],
    observations: Observation[]
  ): Observation {
    const count = observations.length;
    const firstTime = observations[0].timestamp;
    const lastTime = observations[observations.length - 1].timestamp;

    // Get a sample of the content
    const sampleCount = Math.min(3, observations.length);
    const samples = observations.slice(0, sampleCount).map(o => {
      const preview = o.content.substring(0, 100);
      return preview.length < o.content.length ? preview + '...' : preview;
    });

    const content = `[Summary of ${count} ${type} observations]: ` +
                   `Spanning ${formatDuration(firstTime, lastTime)}. ` +
                   `Sample: ${samples.join(' | ')}`;

    return {
      id: crypto.randomUUID(),
      type,
      content,
      masked: true,
      timestamp: Date.now(),
    };
  }

  /**
   * Unmask specific observations
   */
  unmask(
    observations: Observation[],
    ids: string[]
  ): Observation[] {
    const idSet = new Set(ids);

    return observations.map(obs => {
      if (idSet.has(obs.id)) {
        return { ...obs, masked: false };
      }
      return obs;
    });
  }

  /**
   * Get only unmasked observations
   */
  getUnmasked(observations: Observation[]): Observation[] {
    return observations.filter(obs => !obs.masked);
  }

  /**
   * Get only masked observations
   */
  getMasked(observations: Observation[]): Observation[] {
    return observations.filter(obs => obs.masked);
  }

  /**
   * Estimate tokens in observations
   */
  estimateTokens(observations: Observation[]): number {
    return observations.reduce((total, obs) => {
      if (obs.masked) return total;
      return total + Math.ceil(obs.content.length / 4);
    }, 0);
  }

  /**
   * Set default max length
   */
  setMaxLength(maxLength: number): void {
    this.defaultMaxLength = maxLength;
  }

  /**
   * Set default max count
   */
  setMaxCount(maxCount: number): void {
    this.defaultMaxCount = maxCount;
  }
}

/**
 * Format duration between timestamps
 */
function formatDuration(start: number, end: number): string {
  const duration = end - start;
  const minutes = Math.floor(duration / (60 * 1000));

  if (minutes < 1) return 'less than a minute';
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''}`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''}`;

  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? 's' : ''}`;
}

/**
 * Create an observation masker
 */
export function createObservationMasker(
  maxLength?: number,
  maxCount?: number
): ObservationMasker {
  return new ObservationMasker(maxLength, maxCount);
}
