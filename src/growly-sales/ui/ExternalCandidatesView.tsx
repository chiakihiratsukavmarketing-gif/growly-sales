import { useCallback, useEffect, useState } from 'react';
import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import { approveExternalCandidate, fetchExternalCandidates } from './externalCandidatesApi.js';
import { InfoBanner } from './InfoBanner.js';
import { SectionCard } from './SectionCard.js';

export const EXTERNAL_CANDIDATES_WARNING =
  '外部候補は直接Lead化しません。個別に取り込み承認後、CLIで input-sites.csv へ追記してください。自動大量取り込みはできません。';

function canApprove(candidate: ExternalLeadCandidate): boolean {
  return (
    Boolean(candidate.websiteUrl?.trim()) &&
    candidate.importStatus !== 'duplicate' &&
    candidate.importStatus !== 'imported' &&
    candidate.importStatus !== 'approved_for_import'
  );
}

function importabilityLabel(candidate: ExternalLeadCandidate): string {
  if (candidate.importStatus === 'duplicate') return '重複';
  if (!candidate.websiteUrl?.trim()) return 'websiteUrlなし';
  if (candidate.importStatus === 'imported') return '取り込み済み';
  if (candidate.importStatus === 'approved_for_import') return '承認済み（CLI取り込み待ち）';
  if (candidate.importStatus === 'needs_review') return '要レビュー';
  return 'preview（承認可能）';
}

interface ExternalCandidatesViewProps {
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

export function ExternalCandidatesView({ onError, onSuccess }: ExternalCandidatesViewProps) {
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<ExternalLeadCandidate[]>([]);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchExternalCandidates();
      setCandidates(data.candidates);
    } catch (err) {
      onError(err instanceof Error ? err.message : '外部候補の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleApprove(candidate: ExternalLeadCandidate): Promise<void> {
    setApprovingId(candidate.externalCandidateId);
    try {
      const updated = await approveExternalCandidate(candidate.externalCandidateId);
      setCandidates((prev) =>
        prev.map((c) => (c.externalCandidateId === updated.externalCandidateId ? updated : c))
      );
      onSuccess(`${updated.companyName} を取り込み承認しました。CLIで external-import-approved を実行してください。`);
    } catch (err) {
      onError(err instanceof Error ? err.message : '取り込み承認に失敗しました');
    } finally {
      setApprovingId(null);
    }
  }

  if (loading) return <p className="loading">営業候補を読み込み中…</p>;

  return (
    <div className="external-candidates-view">
      <InfoBanner variant="info">{EXTERNAL_CANDIDATES_WARNING}</InfoBanner>

      {candidates.length === 0 ? (
        <SectionCard title="営業候補">
          <p>外部候補がありません。</p>
          <p className="hint">
            npm run growly-sales:external-preview（dry-run）または external-fetch（FETCH_CANDIDATES 必須）で取得してください。
          </p>
        </SectionCard>
      ) : (
        <SectionCard title={`営業候補（${candidates.length}件）`}>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>会社名</th>
                  <th>地域</th>
                  <th>業種</th>
                  <th>websiteUrl</th>
                  <th>source</th>
                  <th>信頼度</th>
                  <th>status</th>
                  <th>取り込み</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => (
                  <tr key={c.externalCandidateId}>
                    <td>{c.companyName}</td>
                    <td>{c.area}</td>
                    <td>{c.industry}</td>
                    <td className="mono-cell">{c.websiteUrl ?? '—'}</td>
                    <td>{c.sourceType}</td>
                    <td>{c.confidenceScore}</td>
                    <td>{c.importStatus}</td>
                    <td>{importabilityLabel(c)}</td>
                    <td>
                      {canApprove(c) ? (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={approvingId === c.externalCandidateId}
                          onClick={() => void handleApprove(c)}
                        >
                          取り込み承認
                        </button>
                      ) : (
                        <span className="hint">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">sourceQuery: {candidates[0]?.sourceQuery ? '各行の詳細はJSON参照' : '—'}</p>
        </SectionCard>
      )}
    </div>
  );
}
