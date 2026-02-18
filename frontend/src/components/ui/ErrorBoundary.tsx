import { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="min-h-[400px] flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-50 flex items-center justify-center">
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
            <h2 className="text-lg font-semibold text-slate-800 mb-2">
              حدث خطأ غير متوقع
            </h2>
            <p className="text-sm text-slate-500 mb-1">An unexpected error occurred</p>
            <p className="text-xs text-slate-400 mb-6 font-mono bg-slate-50 rounded-lg p-3 text-start break-all">
              {this.state.error?.message || 'Unknown error'}
            </p>
            <button onClick={this.handleReset} className="btn-primary">
              <RotateCcw className="h-4 w-4" />
              إعادة المحاولة / Retry
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
