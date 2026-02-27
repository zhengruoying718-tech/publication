import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const generateArchivalFragment = async (type: string, context: string) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are an archival AI in the year 2050. You are reconstructing the "2025 printmaking coordination system". 
      Generate a short, cryptic, and technical archival fragment (20-40 words) for a popup of type "${type}".
      Context: ${context}
      The tone should be speculative, slightly bureaucratic, and focused on material reuse, paper offcuts, and coordination between departments (digital print, printmaking, swap shop).
      Return ONLY the text of the fragment.`,
    });
    return response.text || "Fragment corrupted. Data lost in transition.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Error: Archive connection unstable.";
  }
};

export const synthesizeReconstruction = async (logs: string[]) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are an archival AI in the year 2050. You have reconstructed a series of nodes from the 2025 printmaking coordination system.
      Based on these log entries:
      ${logs.join("\n")}
      
      Synthesize a final "Historical Reconstruction Report" (approx 100 words). 
      Discuss the "policing of waste", the "ghost handoffs" between departments, and the "speculative reuse" of paper.
      The tone should be academic yet haunting, as if looking back at a lost civilization's bureaucratic efficiency.`,
    });
    return response.text || "Synthesis failed. Reconstruction incomplete.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Error: Synthesis engine offline.";
  }
};
