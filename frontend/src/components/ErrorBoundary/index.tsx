import { Component, type ReactNode } from 'react';
import { Button } from 'antd';
import { WarningOutlined, ReloadOutlined } from '@ant-design/icons';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: 300, padding: 40, textAlign: 'center',
        }}>
          <WarningOutlined style={{ fontSize: 48, color: 'rgba(239,83,80,0.3)', marginBottom: 16 }} />
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0d1b3e', marginBottom: 8 }}>
            页面出现错误
          </h2>
          <p style={{ fontSize: 13, color: 'rgba(13,27,62,0.4)', marginBottom: 20, maxWidth: 400 }}>
            {this.state.error?.message || '未知错误'}
          </p>
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            onClick={this.handleReset}
            style={{ borderRadius: 8 }}
          >
            重试
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
