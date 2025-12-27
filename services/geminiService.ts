
import { GoogleGenAI, Type } from "@google/genai";

// Safe access to environment variables in browser
const getApiKey = () => {
  try {
    return process.env.API_KEY || '';
  } catch (e) {
    return '';
  }
};

const apiKey = getApiKey();
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export const moderateContent = async (text: string): Promise<{ safe: boolean; reason?: string }> => {
  if (!ai) return { safe: true };

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Determine if the following message is spam, harmful, or abusive in the context of an anonymous public chat. Respond with JSON { "safe": boolean, "reason": string }. Message: "${text}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            safe: { type: Type.BOOLEAN },
            reason: { type: Type.STRING }
          },
          required: ["safe"]
        }
      }
    });

    return JSON.parse(response.text || '{"safe": true}');
  } catch (error) {
    console.error("Moderation error:", error);
    return { safe: true };
  }
};

export const getPrivacyAdvice = async (): Promise<string> => {
    if (!ai) return "Stay safe and don't share personal info.";

    try {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: "Provide a single-sentence tip for maintaining privacy in an anonymous location-based chat app.",
            config: {
                systemInstruction: "You are a privacy expert."
            }
        });
        return response.text || "Stay safe.";
    } catch (e) {
        return "Protect your personal data.";
    }
};
