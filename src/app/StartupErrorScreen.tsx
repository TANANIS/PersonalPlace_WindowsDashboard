interface StartupErrorScreenProps {
  message: string;
  onRetry: () => void;
}

export function StartupErrorScreen({ message, onRetry }: StartupErrorScreenProps) {
  return <div className="app-shell startup-shell" role="alert"><main className="startup-error"><h1>Personal Place 無法開啟本機資料</h1><p>{message}</p><button type="button" className="button primary" onClick={onRetry}>重試</button></main></div>;
}
