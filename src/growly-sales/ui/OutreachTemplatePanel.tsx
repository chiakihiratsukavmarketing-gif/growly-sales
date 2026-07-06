import { useCallback, useEffect, useMemo, useState } from 'react';
import type { OutreachTemplate } from '../mail-operations/templateTypes.js';
import { OUTREACH_TEMPLATE_AI_SLOTS, OUTREACH_TEMPLATE_HUMAN_BLOCKS } from '../mail-operations/templateTypes.js';
import { SectionCard } from './SectionCard.js';
import {
  activateOutreachTemplateApi,
  fetchOutreachTemplates,
  previewOutreachTemplateApi,
  resetOutreachTemplateDefaultsApi,
  saveOutreachTemplateDraftApi,
  TEMPLATE_ACTIVATE_CONFIRM_TOKEN,
} from './outreachTemplatesApi.js';

const EMPTY_DRAFT: Partial<OutreachTemplate> & { name: string } = {
  name: '営業メールテンプレート',
  tone: 'formal',
  subjectTemplate: '',
  openingBlock: '',
  companyIntroBlock: '',
  proposalBlock: '',
  proofBlock: '',
  ctaBlock: '',
  signatureBlock: '{{signature}}',
  unsubscribeBlock: '',
  requiredPhrases: [],
  prohibitedPhrases: [],
  maxBodyLength: 4000,
};

interface OutreachTemplatePanelProps {
  onError: (message: string) => void;
}

export function OutreachTemplatePanel({ onError }: OutreachTemplatePanelProps) {
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Partial<OutreachTemplate> & { name: string }>(EMPTY_DRAFT);
  const [activeTemplate, setActiveTemplate] = useState<OutreachTemplate | null>(null);
  const [history, setHistory] = useState<OutreachTemplate[]>([]);
  const [activateToken, setActivateToken] = useState('');
  const [previewCompany, setPreviewCompany] = useState('サンプル住宅株式会社');
  const [previewSubject, setPreviewSubject] = useState('');
  const [previewBody, setPreviewBody] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchOutreachTemplates();
      setActiveTemplate(data.activeTemplate);
      setHistory(data.templates);
      const latestDraft = data.templates.find((t) => t.status === 'draft') ?? data.activeTemplate;
      if (latestDraft) {
        setDraft({ ...latestDraft });
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'テンプレートの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const aiSlotSet = useMemo(() => new Set(OUTREACH_TEMPLATE_AI_SLOTS), []);

  async function handleSaveDraft() {
    try {
      const result = await saveOutreachTemplateDraftApi(draft);
      setDraft({ ...result.template });
      setMessage(result.message);
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : '下書き保存に失敗しました');
    }
  }

  async function handleActivate() {
    if (!draft.templateId) {
      onError('先に下書きを保存してください');
      return;
    }
    if (activateToken.trim() !== TEMPLATE_ACTIVATE_CONFIRM_TOKEN) {
      onError(`本番適用には確認トークン「${TEMPLATE_ACTIVATE_CONFIRM_TOKEN}」が必要です`);
      return;
    }
    try {
      const result = await activateOutreachTemplateApi(draft.templateId, activateToken.trim());
      setMessage(result.message);
      setActivateToken('');
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : '本番適用に失敗しました');
    }
  }

  async function handlePreview() {
    try {
      const result = await previewOutreachTemplateApi({
        template: draft,
        preview: { companyName: previewCompany },
      });
      setPreviewSubject(result.emailSubject);
      setPreviewBody(result.emailBody);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'プレビューに失敗しました');
    }
  }

  async function handleResetDefaults() {
    try {
      const result = await resetOutreachTemplateDefaultsApi();
      setDraft({ ...result.template });
      setMessage(result.message);
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : '初期化に失敗しました');
    }
  }

  if (loading) return <p className="loading">営業メールテンプレートを読み込み中…</p>;

  return (
    <>
      <SectionCard title="営業メールテンプレート">
        <p className="hint">
          保存後も既存 Lead の営業文は変更されません。有効化後の<strong>次回生成から</strong>適用されます（mock）。
        </p>
        {activeTemplate ? (
          <p className="hint">
            現在使用中: <strong>{activeTemplate.name}</strong>（v{activeTemplate.version}）
          </p>
        ) : (
          <p className="hint">有効テンプレートなし — コード既定の営業文を使用します。</p>
        )}
        {message ? <p className="hint">{message}</p> : null}

        <label>
          テンプレート名
          <input
            type="text"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          />
        </label>

        <div className="template-editor-grid">
          {OUTREACH_TEMPLATE_HUMAN_BLOCKS.map((blockKey) => {
            const isAiRich =
              blockKey === 'companyIntroBlock' || blockKey === 'ctaBlock' || blockKey === 'subjectTemplate';
            const value = String(draft[blockKey as keyof typeof draft] ?? '');
            return (
              <label key={blockKey} className={isAiRich ? 'template-field-ai' : 'template-field-locked'}>
                {blockKey}
                {blockKey === 'subjectTemplate' ? (
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => setDraft((d) => ({ ...d, subjectTemplate: e.target.value }))}
                  />
                ) : (
                  <textarea
                    rows={blockKey === 'signatureBlock' ? 6 : 4}
                    value={value}
                    onChange={(e) => setDraft((d) => ({ ...d, [blockKey]: e.target.value }))}
                  />
                )}
                {isAiRich ? (
                  <span className="template-slot-hint">AIスロット: {'{{slot}}'} プレースホルダ可</span>
                ) : null}
              </label>
            );
          })}
        </div>

        <details className="template-ai-slots-detail">
          <summary>AIが差し込む項目（編集不可・生成時に自動）</summary>
          <ul>
            {OUTREACH_TEMPLATE_AI_SLOTS.map((slot) => (
              <li key={slot}>
                <code>{`{{${slot}}}`}</code>
                {aiSlotSet.has(slot) ? '' : ''}
              </li>
            ))}
          </ul>
        </details>

        <label>
          禁止表現（改行区切り）
          <textarea
            rows={2}
            value={(draft.prohibitedPhrases ?? []).join('\n')}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                prohibitedPhrases: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
              }))
            }
          />
        </label>

        <div className="btn-row">
          <button type="button" className="btn" onClick={() => void handleSaveDraft()}>
            下書き保存
          </button>
          <button type="button" className="btn" onClick={() => void handleResetDefaults()}>
            初期状態へ戻す
          </button>
        </div>

        <div className="template-activate-panel">
          <p className="hint warning-text">本番適用は Human Approval 必須（次回生成分から反映）</p>
          <label>
            確認トークン
            <input
              type="text"
              value={activateToken}
              onChange={(e) => setActivateToken(e.target.value)}
              placeholder={TEMPLATE_ACTIVATE_CONFIRM_TOKEN}
            />
          </label>
          <button type="button" className="btn btn-warn" onClick={() => void handleActivate()}>
            有効化（次回生成から適用）
          </button>
        </div>
      </SectionCard>

      <SectionCard title="テスト企業でAI生成プレビュー">
        <label>
          テスト企業名
          <input type="text" value={previewCompany} onChange={(e) => setPreviewCompany(e.target.value)} />
        </label>
        <button type="button" className="btn" onClick={() => void handlePreview()}>
          プレビュー生成
        </button>
        {previewSubject ? (
          <>
            <p className="hint">件名: {previewSubject}</p>
            <pre className="template-preview-body">{previewBody}</pre>
          </>
        ) : null}
      </SectionCard>

      <SectionCard title="バージョン履歴">
        {history.length === 0 ? (
          <p className="hint">履歴なし</p>
        ) : (
          <ul className="template-history-list">
            {history.map((t) => (
              <li key={`${t.templateId}-${t.version}`}>
                {t.name} — v{t.version} — {t.status}
                {t.activatedAt ? ` — 適用 ${new Date(t.activatedAt).toLocaleString('ja-JP')}` : ''}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
