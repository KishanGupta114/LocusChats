
import { GoogleGenAI, Type } from "@google/genai";

/**
 * Moderates chat content using Gemini to identify spam, harm, or abuse.
 * Initializes the AI client inside the function call to ensure fresh configuration from process.env.API_KEY.
 */
export const moderateContent = async (text: string): Promise<{ safe: boolean; reason?: string }> => {
  // Use process.env.API_KEY directly and create instance right before call
  if (!process.env.API_KEY) return { safe: true };

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
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

    // Access .text property directly as per Gemini API guidelines (not a method)
    const textResult = response.text?.trim() || '{"safe": true}';
    return JSON.parse(textResult);
  } catch (error) {
    console.error("Moderation error:", error);
    return { safe: true };
  }
};

/**
 * Fetches a privacy tip for users from Gemini to display on the join screen.
 */
export const getPrivacyAdvice = async (): Promise<string> => {
    if (!process.env.API_KEY) return "Stay safe and don't share personal info.";

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: "Provide a single-sentence tip for maintaining privacy in an anonymous location-based chat app.",
            config: {
                systemInstruction: "You are a privacy expert."
            }
        });
        // Access .text property directly
        return response.text || "Stay safe.";
    } catch (e) {
        return "Protect your personal data.";
    }
};
