import { Component, type ReactNode } from 'react';
import { InfoBanner } from '../InfoBanner.js';
import { DevDetails } from './DevDetails.js';

export class TabErrorBoundary extends Component<
  {
    title: string;
    hint?: string;
    children: ReactNode;
  },
  { hasError: boolean; message: string }
> {
  state = { hasError: false, message: '' };

  static getDerivedStateFromError(err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { hasError: true, message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="tab-error-boundary">
          <InfoBanner variant="danger">
            {this.props.title} の表示に失敗しました。候補収集画面の一部読み込みに失敗しました。
          </InfoBanner>
          {this.props.hint ? <p className="hint">{this.props.hint}</p> : null}
          <DevDetails title="開発者向け詳細（例外）">
            <p className="mono-cell">{this.state.message}</p>
          </DevDetails>
        </div>
      );
    }
    return this.props.children;
  }
}

