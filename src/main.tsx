import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const PasswordProtect = ({ children }: { children: React.ReactNode }) => {
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(
    sessionStorage.getItem('site_auth') === 'true'
  );

  if (isAuthenticated) {
    return <>{children}</>;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === '123456') {
      sessionStorage.setItem('site_auth', 'true');
      setIsAuthenticated(true);
    } else {
      alert('密碼錯誤！');
      setPassword('');
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-4 font-sans text-[#1A1A1A]">
      <div className="bg-white p-8 rounded-3xl shadow-xl border border-black/5 w-full max-w-sm text-center">
        <h2 className="text-2xl font-black tracking-tight mb-6">請輸入密碼</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="系統存取密碼"
            className="w-full bg-slate-50 border border-black/5 rounded-2xl p-4 focus:outline-none focus:ring-2 focus:ring-black/5 focus:bg-white transition-all text-sm font-medium text-center"
            autoFocus
          />
          <button
            type="submit"
            className="w-full bg-[#1A1A1A] text-white py-4 rounded-[2rem] font-bold hover:shadow-xl hover:-translate-y-0.5 transition-all"
          >
            進入系統
          </button>
        </form>
      </div>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PasswordProtect>
      <App />
    </PasswordProtect>
  </StrictMode>,
);
