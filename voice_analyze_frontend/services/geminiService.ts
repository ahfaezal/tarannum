import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult } from "../types";

// Helper to convert Blob to Base64
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Remove data url prefix (e.g. "data:audio/wav;base64,")
      const base64Content = base64String.split(',')[1];
      resolve(base64Content);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export const analyzeRecitation = async (
  studentBlob: Blob, 
  referenceBlob: Blob | null,
  referenceTitle: string
): Promise<AnalysisResult> => {
  try {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      console.warn("No API Key found. Returning mock analysis.");
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            score: Math.floor(Math.random() * (95 - 70) + 70),
            feedback: "Simulated Analysis: Good attempt. Your breath control is steady, but pay attention to the elongation (Madd) in the second verse. The pitch matching needs slight improvement at the end.",
            segments: [
              { start: 0, end: 5, accuracy: 'high' },
              { start: 5, end: 10, accuracy: 'medium' },
              { start: 10, end: 15, accuracy: 'low' }
            ]
          });
        }, 2000);
      });
    }

    const ai = new GoogleGenAI({ apiKey });
    
    // Prepare contents
    const parts: any[] = [];
    
    // 1. Add Reference Audio if available
    if (referenceBlob) {
        const refBase64 = await blobToBase64(referenceBlob);
        parts.push({ text: "Reference Audio (Target Style):" });
        parts.push({
            inlineData: {
                mimeType: referenceBlob.type || 'audio/mp3',
                data: refBase64
            }
        });
    }

    // 2. Add Student Audio
    const studentBase64 = await blobToBase64(studentBlob);
    parts.push({ text: "Student Recitation (To Analyze):" });
    parts.push({
        inlineData: {
            mimeType: studentBlob.type || 'audio/webm',
            data: studentBase64
        }
    });

    // 3. Add Prompt
    const prompt = `
      You are an expert Quranic Tarannum teacher. 
      Compare the Student Recitation to the Reference Audio (if provided) or the known style of "${referenceTitle}".
      
      Focus your analysis on:
      1. **Pitch & Melody (Maqam):** Does the student follow the reference's melodic curve?
      2. **Rhythm & Stress:** Are the pauses and stress points (Madd) similar to the reference?
      3. **Waveform Dynamics:** Evaluate volume dynamics and timing.

      Provide a JSON response with:
      - score: Integer (0-100)
      - feedback: Constructive advice (max 2 sentences) specific to the comparison.
      - segments: 3 key time segments indicating performance accuracy (high/medium/low).
    `;
    parts.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.INTEGER },
            feedback: { type: Type.STRING },
            segments: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  start: { type: Type.NUMBER },
                  end: { type: Type.NUMBER },
                  accuracy: { type: Type.STRING, enum: ['high', 'medium', 'low'] }
                }
              }
            }
          }
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text) as AnalysisResult;
    }
    
    throw new Error("Empty response from AI");

  } catch (error) {
    console.error("Analysis failed:", error);
    return {
      score: 0,
      feedback: "Error analyzing audio. Please check your connection or API key.",
      segments: []
    };
  }
};