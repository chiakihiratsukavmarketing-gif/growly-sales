import type {
  DiscoveryReferenceAdapter,
  DiscoveryReferenceInput,
  DiscoveryReferenceResult,
  ReferenceOnlyDiscoverySource,
} from './types.js';
import type { DiscoveryAdapterExecutionPlan } from './resolveDiscoveryAdapterExecutionPlan.js';

function buildStubNote(
  source: ReferenceOnlyDiscoverySource,
  plan?: DiscoveryAdapterExecutionPlan
): string {
  const base = (() => {
    switch (source) {
      case 'job_site_reference':
        return '求人サイト参考 adapter（スタブ）。';
      case 'rakuten_marketplace_reference':
        return '楽天市場参考 adapter（スタブ）。';
      case 'portal_site_reference':
        return '地域ポータル参考 adapter（スタブ）。';
      case 'industry_directory_reference':
        return '業界団体・ディレクトリ参考 adapter（スタブ）。';
      case 'manual_url':
        return '手動 URL 参考 adapter（スタブ）。';
      default:
        return '外部参考 adapter（スタブ）。';
    }
  })();
  if (plan?.dryRun) {
    return `${base} dry-run 計画のみ。実ネットワークアクセスなし。`;
  }
  return `${base} 実巡回は未実装。発見元 URL のみ記録し、メールは公式サイトのみ。`;
}

export function createReferenceOnlyDiscoveryAdapter(
  discoverySource: ReferenceOnlyDiscoverySource
): DiscoveryReferenceAdapter {
  return {
    discoverySource,
    referenceOnly: true,
    async discover(
      input: DiscoveryReferenceInput,
      plan?: DiscoveryAdapterExecutionPlan
    ): Promise<DiscoveryReferenceResult> {
      return {
        referenceOnly: true,
        discoverySource,
        candidates: [],
        note: buildStubNote(discoverySource, plan),
        implementationPending: true,
      };
    },
  };
}
