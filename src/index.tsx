import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

declare global {
  interface Window {
    Telegram: {
      WebApp: {
        requestFullscreen: () => void;
        initDataUnsafe: any;
        close: () => void;
      };
    };
  }
}

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

function isDesktop() {
  const userAgent = navigator.userAgent.toLowerCase();
  return userAgent.includes("windows") || userAgent.includes("macintosh") || userAgent.includes("linux");
}
console.log(isDesktop());
if (!isDesktop()) {
  const header = document.querySelector('.header') as HTMLElement;
  if (header) {
    header.style.marginTop = '90px';
  }
  try {

    window.Telegram.WebApp.requestFullscreen();
  } catch (e) {
    console.log(e)
  }
}


document.addEventListener('touchstart', function (event) {
  const activeElement = document.activeElement as HTMLElement;
  const target = event.target as Node;

  if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
    if (!activeElement.contains(target)) {
      activeElement.blur();
    }
  }
});
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
