/** 開発者向け UI（運用パネル・raw フィールド等）の表示可否 */
export function isDeveloperUiEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('dev') === '1' || params.get('developer') === '1';
}
