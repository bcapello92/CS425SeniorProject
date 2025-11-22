import { useState } from 'react';
import { triageClient } from './triageClient';

const QUESTIONS = [
  { linkId:'chief',    text:'What brings you in today?' },
  { linkId:'onset',    text:'When did it start and how has it changed?' },
  { linkId:'severity', text:'How severe is it (mild/moderate/severe)?' },
  { linkId:'meds',     text:'Any meds or home treatments tried?' },
  { linkId:'allergies',text:'Any allergies?' }
];

export default function PatientIntake() {
  const [entryId, setEntryId] = useState('');
  const [patientId, setPatientId] = useState(null);
  const [consented, setConsented] = useState(false);

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [input, setInput] = useState('');

  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const currentQ = QUESTIONS[step];
  const isLanding = patientId === null && !result && step === 0; // still used if needed later

  function addAnswer() {
    const val = input.trim();
    if (!val) return;
    setAnswers(a => [...a, { linkId: currentQ.linkId, text: currentQ.text, answer: val }]);
    setInput('');
    setStep(s => s + 1);
  }

  async function submit() {
    setSending(true);
    setError(null);

    const transcript = QUESTIONS
      .map((q,i)=>`Q: ${q.text}\nA: ${answers[i]?.answer || ''}`)
      .join('\n');

    try {
      const data = await triageClient.submitIntake({
        patientId,
        answers,
        transcript,
      });
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  function resetAll() {
    setEntryId(''); setPatientId(null); setConsented(false);
    setStep(0); setAnswers([]); setInput('');
    setSending(false); setResult(null); setError(null);
  }

  return (
    <div style={{ width: '100%' }}>
      <div style={{ width: '100%', maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{ textAlign: 'center', marginBottom: 6 }}>Online Triage Intake</h1>
        <p style={{ fontSize: 14, color: '#666', textAlign: 'center' }}>
          This form is for triage only and does not replace emergency care. If this is an emergency, call 911.
        </p>

        {/* START SCREEN CARD */}
        {patientId === null && (
          <div style={card}>
            <div style={{ marginBottom: 8 }}>Enter your Intake Code or Patient ID:</div>
            <input
              value={entryId}
              onChange={e=>setEntryId(e.target.value)}
              placeholder="e.g. 12345 or ABCD-123"
              style={inputStyle}
            />
            <label style={{ display:'block', marginTop:10 }}>
              <input
                type="checkbox"
                checked={consented}
                onChange={e=>setConsented(e.target.checked)}
              />{' '}
              I consent to share my responses for care.
            </label>
            <button
              disabled={!entryId.trim() || !consented}
              onClick={() => setPatientId(entryId.trim())}
              style={buttonPrimary}
            >
              Begin
            </button>
          </div>
        )}

        {/* QUESTION FLOW CARD */}
        {patientId !== null && !result && step < QUESTIONS.length && (
          <div style={card}>
            <div style={bar}>
              <b>Intake for:</b> <code>{patientId}</code>
              <button onClick={resetAll} style={buttonSmall}>Change</button>
            </div>

            <div style={{ fontWeight: 600, marginBottom: 8 }}>{currentQ.text}</div>
            <textarea
              value={input}
              onChange={e=>setInput(e.target.value)}
              rows={4}
              placeholder="Type your answer…"
              style={{ ...inputStyle, resize: 'vertical' }}
            />
            <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={addAnswer} disabled={!input.trim()} style={buttonPrimary}>Next</button>
              <span style={{ color:'#666' }}>{step+1} / {QUESTIONS.length}</span>
            </div>
          </div>
        )}

        {/* REVIEW + SUBMIT CARD */}
        {patientId !== null && !result && step >= QUESTIONS.length && (
          <div style={card}>
            <div style={bar}>
              <b>Intake for:</b> <code>{patientId}</code>
              <button onClick={resetAll} style={buttonSmall}>Change</button>
            </div>

            <h3 style={{ marginTop: 0 }}>Review &amp; Submit</h3>
            <ul>{answers.map(a => <li key={a.linkId}><b>{a.text}</b> — {a.answer}</li>)}</ul>
            {error && <div style={{ color:'crimson', marginTop:8 }}>Error: {error}</div>}
            <button disabled={sending} onClick={submit} style={buttonPrimary}>
              {sending ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        )}

        {/* RESULT CARD */}
        {result && (
          <div style={card}>
            <div style={{ marginBottom: 8, textAlign: 'center' }}>Thanks! Your responses were received.</div>
            <div style={{
              display:'inline-block', padding:'6px 10px', borderRadius:8,
              background: colorBg(result.color), color:'#fff'
            }}>
              Triage: {String(result.color || '').toUpperCase()}
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>Rationale: {result.rationale}</div>
            <div style={{ marginTop: 12 }}>
              <button onClick={resetAll} style={buttonSecondary}>Start another</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const card = {
  margin: '16px auto',
  padding: 16,
  border: '1px solid #eee',
  borderRadius: 12,
  background: '#fff',
  width: '100%',
  boxShadow: '0 1px 8px rgba(0,0,0,0.05)'
};

const inputStyle = {
  width: '100%',
  padding: 10,
  border: '1px solid #ccc',
  borderRadius: 10
};

const bar = {
  marginBottom: 8,
  padding: 8,
  background: '#f6f8fa',
  borderRadius: 8,
  display: 'flex',
  alignItems: 'center',
  gap: 8
};

const buttonPrimary = {
  marginTop: 10,
  padding: '10px 14px',
  borderRadius: 10,
  border: '1px solid #ddd',
  background: '#e7f3ff',
  cursor: 'pointer'
};

const buttonSecondary = {
  padding: '8px 12px',
  borderRadius: 10,
  border: '1px solid #ddd',
  background: '#fff',
  cursor: 'pointer'
};

const buttonSmall = {
  marginLeft: 'auto',
  padding: '4px 8px',
  borderRadius: 8,
  border: '1px solid #ddd', 
  background: '#fff',
  cursor: 'pointer'
};

function colorBg(c) {
  return c==='red' ? '#dc2626' :
         c==='orange' ? '#ea580c' :
         '#ca8a04'; // yellow
}
