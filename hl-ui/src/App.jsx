import { useState } from 'react';
import PatientIntake from './PatientIntake';
import ProviderTriage from './ProviderTriage';

export default function App() {
  const [view, setView] = useState('provider'); // default to provider board

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#f5f7fb' }}>
      <header
        style={{
          width: '100%', display: 'flex', justifyContent: 'center', gap: 8,
          padding: 12, borderBottom: '1px solid #eee', background: '#fff',
          position: 'sticky', top: 0, zIndex: 10
        }}
      >
        <button onClick={() => setView('provider')} style={tab(view === 'provider')}>Provider Triage</button>
        <button onClick={() => setView('patient')}  style={tab(view === 'patient')}>Patient Intake</button>
      </header>

      <main style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: 16 }}>
        {view === 'provider' && <div style={{ width: '100%', maxWidth: 1200 }}><ProviderTriage /></div>}
        {view === 'patient'  && <div style={{ width: '100%', maxWidth: 720  }}><PatientIntake /></div>}
      </main>
    </div>
  );
}

function tab(active) {
  return {
    padding: '6px 10px',
    borderRadius: 8,
    border: '1px solid #ddd',
    background: active ? '#e7f3ff' : '#fff',
    cursor: 'pointer'
  };
}
