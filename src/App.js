import { useEffect, useState } from 'react';

const API_BASE = 'http://localhost:4000/api';

export default function App() {
  const [patients, setPatients] = useState([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [error, setError] = useState(null);

  const [selected, setSelected] = useState(null);
  const [observations, setObservations] = useState([]);
  const [loadingObs, setLoadingObs] = useState(false);

  useEffect(() => {
    (async () => {
      setLoadingPatients(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/patients?count=20`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        const entries = (data.entry || []).map(e => e.resource);
        setPatients(entries);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoadingPatients(false);
      }
    })();
  }, []);

  const selectPatient = async (p) => {
    setSelected(p);
    setObservations([]);
    setLoadingObs(true);
    try {
      const res = await fetch(`${API_BASE}/observations?patientId=${encodeURIComponent(p.id)}&count=25`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const entries = (data.entry || []).map(e => e.resource);
      setObservations(entries);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingObs(false);
    }
  };

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 980, margin: '0 auto' }}>
      <h1>HealthLake Viewer</h1>

      {error && <div style={{ color: 'crimson', marginBottom: 12 }}>Error: {error}</div>}

      <section style={{ marginTop: 12 }}>
        <h2>Patients</h2>
        {loadingPatients ? <p>Loading patients…</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Birth Date</th>
                <th style={th}>ID</th>
              </tr>
            </thead>
            <tbody>
              {patients.map(p => {
                const name = (p.name?.[0]) || {};
                const full = [name.given?.join(' '), name.family].filter(Boolean).join(' ') || '—';
                return (
                  <tr key={p.id} onClick={() => selectPatient(p)} style={{ cursor: 'pointer' }}>
                    <td style={td}>{full}</td>
                    <td style={td}>{p.birthDate || '—'}</td>
                    <td style={td}><code>{p.id}</code></td>
                  </tr>
                )
              })}
              {!patients.length && <tr><td style={td} colSpan={3}>No patients found.</td></tr>}
            </tbody>
          </table>
        )}
      </section>

      <section style={{ marginTop: 32 }}>
        <h2>Observations {selected ? `for ${selected.name?.[0]?.given?.[0] ?? ''} ${selected.name?.[0]?.family ?? ''}` : ''}</h2>
        {selected && loadingObs && <p>Loading observations…</p>}
        {!selected && <p>Select a patient row to load observations.</p>}
        {!!observations.length && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Code</th>
                <th style={th}>Value</th>
                <th style={th}>Effective</th>
                <th style={th}>ID</th>
              </tr>
            </thead>
            <tbody>
              {observations.map(o => {
                const coding = o.code?.coding?.[0];
                const codeText = coding?.display || o.code?.text || coding?.code || '—';
                let value = '—';
                if ('valueQuantity' in o) {
                  const q = o.valueQuantity;
                  value = [q?.value, q?.unit].filter(Boolean).join(' ');
                } else if ('valueString' in o) value = o.valueString;
                else if ('valueCodeableConcept' in o) value = o.valueCodeableConcept?.text || '—';
                return (
                  <tr key={o.id}>
                    <td style={td}>{codeText}</td>
                    <td style={td}>{value}</td>
                    <td style={td}>{o.effectiveDateTime || '—'}</td>
                    <td style={td}><code>{o.id}</code></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

const th = { textAlign: 'left', borderBottom: '1px solid #ddd', padding: '8px' };
const td = { borderBottom: '1px solid #eee', padding: '8px' };