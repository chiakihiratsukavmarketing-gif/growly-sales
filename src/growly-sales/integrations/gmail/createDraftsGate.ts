/** Gmail下書き作成の明示確認トークン（CLI / UI 共通） */
export const CREATE_DRAFTS_GATE_TOKEN = 'CREATE_DRAFTS';

export function isCreateDraftsGateConfirmed(value: string | undefined | null): boolean {
  return value?.trim() === CREATE_DRAFTS_GATE_TOKEN;
}
