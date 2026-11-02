import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

try {
  if (localStorage.getItem('shopsharp-theme') === 'dark') {
    document.documentElement.classList.add('dark');
  }
} catch (themeError) {
  console.error('Could not restore the saved color theme.', themeError);
}

if (window.location.hostname === 'shopsharp.vercel.app') {
  const canonicalUrl = new URL(window.location.href);
  canonicalUrl.hostname = 'shopsharp.com.ng';
  canonicalUrl.protocol = 'https:';
  canonicalUrl.port = '';
  window.location.replace(canonicalUrl.toString());
} else {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
        console.error('Could not register the ShopSharp service worker.', error);
      });
    });
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
