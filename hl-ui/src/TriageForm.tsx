import React, { useState } from "react";
import { SymptomInput, TriageClient, TriageResult } from "../api/TriageClient";

const triageClient = new TriageClient(
  import.meta.env.VITE_API_URL ?? "http://localhost:8000"
);

export const TriageForm: React.FC = () => {
  const [form, setForm] = useState<SymptomInput>({
    age: 30,
    temperature: 37.0,
    heart_rate: 70,
    breathing_difficulty: false,
    symptom_text: "",
  });

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TriageResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type, checked } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]:
        type === "checkbox"
          ? checked
          : name === "age" || name === "heart_rate"
          ? Number(value)
          : name === "temperature"
          ? Number(value)
          : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await triageClient.getTriage(form);
      setResult(res);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 500, margin: "0 auto" }}>
      <h2>Patient Triage</h2>
      <form onSubmit={handleSubmit}>
        <label>
          Age
          <input
            name="age"
            type="number"
            value={form.age}
            onChange={handleChange}
          />
        </label>

        <label>
          Temperature (°C)
          <input
            name="temperature"
            type="number"
            step="0.1"
            value={form.temperature}
            onChange={handleChange}
          />
        </label>

        <label>
          Heart rate (bpm)
          <input
            name="heart_rate"
            type="number"
            value={form.heart_rate}
            onChange={handleChange}
          />
        </label>

        <label>
          Breathing difficulty?
          <input
            name="breathing_difficulty"
            type="checkbox"
            checked={form.breathing_difficulty}
            onChange={handleChange}
          />
        </label>

        <label>
          Symptom description
          <textarea
            name="symptom_text"
            value={form.symptom_text}
            onChange={handleChange}
          />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? "Checking..." : "Get triage"}
        </button>
      </form>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {result && (
        <div style={{ marginTop: 16 }}>
          <h3>Triage level: {result.triage.toUpperCase()}</h3>
          <ul>
            {Object.entries(result.probabilities).map(([label, prob]) => (
              <li key={label}>
                {label}: {(prob * 100).toFixed(1)}%
              </li>
            ))}
          </ul>
          <small>
            This is an experimental tool and not a substitute for professional
            medical advice or emergency services.
          </small>
        </div>
      )}
    </div>
  );
};
