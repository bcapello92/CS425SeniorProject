// hl-ui/src/ProviderTriage.jsx
import { useEffect, useState } from 'react';
import { triageClient } from './triageClient';

export default function ProviderTriage() {
  const [data, setData] = useState(null);
  const [hours, setHours] = useState(168);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const [open, setOpen] = useState({});
  const [detail, setDetail] = useState({});

  async function loadBoard() {
    setLoading(true);
    setErr(null);
    try {
      const json = await triageClient.getBoard({ sinceHours: hours });
      setData(json);
    } catch (e) {
      setData(null);
      setErr(e?.message || 'Failed to load board');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggle(riskId) {
    const isOpening = !open[riskId];
    setOpen(prev => ({ ...prev, [riskId]: isOpening }));

    if (isOpening && !detail[riskId]) {
      setDetail(prev => ({ ...prev, [riskId]: { loading: true, error: null, data: null } }));
      try {
        const json = await triageClient.getDetail(riskId);
        setDetail(prev => ({ ...prev, [riskId]: { loading: false, error: null, data: json } }));
      } catch (e) {
        setDetail(prev => ({ ...prev, [riskId]: { loading: false, error: e?.message || 'Failed to load', data: null } }));
      }
    }
  }

  async function setFlag(riskId, key, value) {
    try {
      await triageClient.setFlag(riskId, key, value);
      setDetail(prev => {
        const d = prev[riskId]?.data || {};
        const next = { ...(prev[riskId] || {}), data: { ...d, flags: { ...(d.flags || {}), [key]: value } } };
        return { ...prev, [riskId]: next };
      });
    } catch (e) {
      alert(`Failed to update flag: ${e?.message || e}`);
    }
  }

  async function setOverride(riskId, newColor) {
    try {
      await triageClient.setOverride(riskId, newColor);
      setDetail(prev => {
        const d = prev[riskId]?.data || {};
        const next = { ...(prev[riskId] || {}), data: { ...d, color: newColor } };
        return { ...prev, [riskId]: next };
      });
      loadBoard();
    } catch (e) {
      alert(`Failed to set override: ${e?.message || e}`);
    }
  }

  const groups = data?.groups || { red: [], orange: [], yellow: [] };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: 24,
        background: '#f5f7fb'
      }}
    >
      <div style={{ width: 'min(1200px, 100%)', margin: '0 auto' }}>
        <h1 style={{ textAlign: 'center', marginBottom: 12 }}>Provider Triage Board</h1>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
          <label>
            Since last{' '}
            <input
              type="number"
              min="1"
              value={hours}
              onChange={e => setHours(Number(e.target.value || 1))}
              style={{ width: 70 }}
            />{' '}
            hours
          </label>
          <button onClick={loadBoard} style={{ padding: '6px 10px', borderRadius: 8 }}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {err && (
          <div style={{ color: 'crimson', marginBottom: 12, textAlign: 'center' }}>
            Error: {err}
          </div>
        )}

        {!err && !loading && data && (
          <div style={{ marginBottom: 12, color: '#555', textAlign: 'center' }}>
            Since {new Date(data.since).toLocaleString()} — Totals:
            {' '}RED {data.counts?.red || 0}, ORANGE {data.counts?.orange || 0}, YELLOW {data.counts?.yellow || 0}
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(300px, 1fr))',
            gap: 16
          }}
        >
          {['red', 'orange', 'yellow'].map(color => (
            <div
              key={color}
              style={{
                border: '1px solid #eee',
                borderRadius: 12,
                overflow: 'hidden',
                background: '#fff',
                boxShadow: '0 1px 8px rgba(0,0,0,0.05)'
              }}
            >
              <div style={{ padding: 10, color: '#fff', background: colorBg(color), fontWeight: 700, textAlign: 'center' }}>
                {color.toUpperCase()} ({groups[color]?.length || 0})
              </div>

              <div style={{ padding: 10, maxHeight: 520, overflow: 'auto' }}>
                {(groups[color] || []).map(item => {
                  const isOpen = !!open[item.riskId];
                  const d = detail[item.riskId];

                  return (
                    <div key={item.riskId} style={{ padding: '8px 4px', borderBottom: '1px solid #f1f1f1' }}>
                      <div
                        onClick={() => toggle(item.riskId)}
                        style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                      >
                        <div>
                          <b>{item.patientName}</b>{' '}
                          <code style={{ opacity: 0.7 }}>{item.patientId}</code>
                          <div style={{ fontSize: 12, color: '#666' }}>{new Date(item.date).toLocaleString()}</div>
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.8 }}>{isOpen ? '▲' : '▼'}</div>
                      </div>

                      {isOpen && (
                        <div style={{ marginTop: 6, padding: 10, background: '#f7fafc', borderRadius: 8 }}>
                          {!d || d.loading ? (
                            <div>Loading details…</div>
                          ) : d.error ? (
                            <div style={{ color: 'crimson' }}>Error: {d.error}</div>
                          ) : (
                            <>
                              <div style={{ marginBottom: 6, textAlign: 'center' }}>
                                <span
                                  style={{
                                    display: 'inline-block',
                                    padding: '4px 8px',
                                    borderRadius: 6,
                                    background: colorBg(d.data.color),
                                    color: '#fff',
                                    fontWeight: 600
                                  }}
                                >
                                  {String(d.data.color || '').toUpperCase()}
                                </span>
                                <div style={{ marginTop: 6, color: '#555' }}>
                                  {d.data.rationale || '—'}
                                </div>
                              </div>

                              {!!(d.data.answers || []).length && (
                                <div style={{ fontSize: 14, marginTop: 8 }}>
                                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Patient answers</div>
                                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                                    {d.data.answers.map(a => (
                                      <li key={a.linkId}>
                                        <b>{a.text}:</b> {a.answer}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 10 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <input
                                    type="checkbox"
                                    checked={!!d.data?.flags?.contacted}
                                    onChange={e => setFlag(item.riskId, 'contacted', e.target.checked)}
                                  />
                                  Contacted
                                </label>

                                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <input
                                    type="checkbox"
                                    checked={!!d.data?.flags?.scheduled}
                                    onChange={e => setFlag(item.riskId, 'scheduled', e.target.checked)}
                                  />
                                  Scheduled
                                </label>

                                <span style={{ marginLeft: 'auto' }}>
                                  Override:
                                  <select
                                    value={d.data?.color || color}
                                    onChange={e => setOverride(item.riskId, e.target.value)}
                                    style={{ marginLeft: 6 }}
                                  >
                                    <option value="red">Red</option>
                                    <option value="orange">Orange</option>
                                    <option value="yellow">Yellow</option>
                                  </select>
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {!groups[color]?.length && <div style={{ color: '#666', textAlign: 'center' }}>None</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function colorBg(c) {
  return c === 'red' ? '#dc2626' :
         c === 'orange' ? '#ea580c' :
         '#ca8a04'; // yellow
}
