// src/api/TriageClient.ts

export type SymptomInput = {
  age: number;
  temperature: number;
  heart_rate: number;
  breathing_difficulty: boolean;
  symptom_text?: string;
};

export type TriageResult = {
  triage: "routine" | "moderate" | "urgent" | "severe";
  probabilities: Record<string, number>;
};

export class TriageClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async getTriage(symptoms: SymptomInput): Promise<TriageResult> {
    const response = await fetch(`${this.baseUrl}/triage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(symptoms),
    });

    if (!response.ok) {
      // You could throw a more detailed error here
      throw new Error(`Triage request failed: ${response.status}`);
    }

    const data = (await response.json()) as TriageResult;
    return data;
  }
}
