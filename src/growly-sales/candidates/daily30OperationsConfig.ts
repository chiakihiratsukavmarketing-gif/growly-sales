/** Daily 30 運用ゲート定義（UI・ドキュメント共通） */

export interface Daily30GateDefinition {
  token: string;
  purpose: string;
  callsGmailApi: boolean;
  note: string;
}

export const DAILY_30_GATES: readonly Daily30GateDefinition[] = [
  {
    token: 'FETCH_DAILY_30',
    purpose: '候補収集（Places / Web Search + メール確認）',
    callsGmailApi: false,
    note: '外部APIのみ。Gmail APIは呼びません。',
  },
  {
    token: 'GENERATE_DAILY_30_COPY',
    purpose: '営業文生成・品質チェック',
    callsGmailApi: false,
    note: 'external-candidates.json のみ更新。leads.json には書き込みません。',
  },
  {
    token: 'IMPORT_DAILY_30_DRAFT_CANDIDATES',
    purpose: 'ready_for_draft → leads.json への一括取り込み',
    callsGmailApi: false,
    note: 'Gmail APIは呼びません。下書き作成は行いません。',
  },
  {
    token: 'CREATE_DRAFTS',
    purpose: 'Gmail下書き作成（users.drafts.create のみ）',
    callsGmailApi: true,
    note: 'Gmail送信APIは使いません。自動送信は行いません。',
  },
];

export const DAILY_30_SAFETY_RULES: readonly string[] = [
  '自動送信しない',
  'Gmail送信は必ず人間がGmail画面で確認してから行う',
  'Gmail下書き作成は CREATE_DRAFTS ゲート付きUIのみ',
  '送信済みLeadの履歴は上書きしない',
  '重複Leadは取り込まない',
  'needs_review / excluded は下書き候補化しない',
  '個人メールは除外する',
  'From / Reply-To / 署名Email は c_hiratsuka@wantreach.jp',
  '返信本文全文は保存せず replySummary のみ',
  'APIキー / refresh token / secret は画面やログに出さない',
];

export const DAILY_30_DAILY_PROCEDURE: readonly string[] = [
  'Growly Sales UIを開く',
  'Daily 30進捗を見る',
  '候補が足りなければ FETCH_DAILY_30',
  'email_found を確認してLead化承認',
  'GENERATE_DAILY_30_COPYで営業文生成・品質チェック',
  'ready_for_draft を確認',
  'IMPORT_DAILY_30_DRAFT_CANDIDATESで取り込み（または1件ずつ取り込み）',
  '下書き候補タブで人間承認',
  'CREATE_DRAFTSでGmail下書き作成',
  'Gmail画面で確認して手動送信',
  '送信記録タブで記録',
  '返信管理で返信確認',
];

export const DAILY_30_AREA_EXPANSION_LABEL =
  '宮城県 → 福島県 → 北関東（茨城県 → 栃木県 → 群馬県）';
