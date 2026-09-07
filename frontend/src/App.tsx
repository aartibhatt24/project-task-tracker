import { useEffect, useState } from 'react';
import { apiClient } from './lib/apiClient';

function App() {
  const [status, setStatus] = useState<'checking' | 'ok' | 'error'>('checking');

  useEffect(() => {
    apiClient
      .get('/health')
      .then(() => setStatus('ok'))
      .catch(() => setStatus('error'));
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-slate-800">Project &amp; Task Tracker</h1>
        <p className="mt-2 text-sm text-slate-500">
          API status:{' '}
          <span
            className={
              status === 'ok'
                ? 'text-green-600'
                : status === 'error'
                  ? 'text-red-600'
                  : 'text-slate-400'
            }
          >
            {status}
          </span>
        </p>
      </div>
    </div>
  );
}

export default App;
