import { useEffect, useState } from 'react';
import { getToken, isLocked, markLocked, getTheme, setTheme } from './lib/auth.js';
import LoginScreen from './screens/LoginScreen.jsx';
import LockScreen from './screens/LockScreen.jsx';
import MainScreen from './screens/MainScreen.jsx';

export default function App() {
  const [route, setRoute] = useState('boot');
  const [themeVer, setThemeVer] = useState(0);

  useEffect(() => {
    setTheme(getTheme());
    if (!getToken()) setRoute('login');
    else if (isLocked()) setRoute('lock');
    else setRoute('main');
  }, []);

  // Re-lock when the tab is hidden and re-opened.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') markLocked();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', () => markLocked());
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  if (route === 'boot') return null;
  if (route === 'login')
    return <LoginScreen onDone={() => setRoute('main')} />;
  if (route === 'lock')
    return (
      <LockScreen
        onUnlock={() => setRoute('main')}
        onForgot={() => setRoute('login')}
      />
    );
  return (
    <MainScreen
      key={themeVer}
      onLogout={() => setRoute('login')}
      onThemeChange={() => setThemeVer((v) => v + 1)}
    />
  );
}
