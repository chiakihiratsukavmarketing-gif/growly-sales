import type { Daily30DiscoverySource } from '../../candidates/daily30CollectionProfile.js';
import {
  REFERENCE_ONLY_DISCOVERY_SOURCES,
  type ReferenceOnlyDiscoverySource,
} from './types.js';

export function isReferenceOnlyDiscoverySource(
  source: Daily30DiscoverySource | null | undefined
): source is ReferenceOnlyDiscoverySource {
  return Boolean(source && (REFERENCE_ONLY_DISCOVERY_SOURCES as readonly string[]).includes(source));
}
