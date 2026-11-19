import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './dark.css';
import './arena.css';
import './trades.css';
import './brand.css';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() {
    if (this.state.error) return <main className="error-screen"><h1>Let’s get you back to the table.</h1><p>Your online room is saved. Reload to reconnect.</p><button className="button primary" onClick={() => window.location.reload()}>Reload the game</button></main>;
    return this.props.children;
  }
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary><App /></ErrorBoundary></React.StrictMode>);

import './advertising.css';
