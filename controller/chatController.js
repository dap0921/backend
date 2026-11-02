
import OpenAI from "openai";

const SYSTEM_PROMPT =
  "You are a friendly assistant for this Expense Tracker website. " +
  "Keep answers short and clear. Give helpful budgeting and expense-tracking advice. " +
  "Do not claim to know the user's actual expenses or modify expenses.";

export const chatWithAI = async (req, res) => {
  try {
    // Read messages from the request body
    const { messages } = req.body || {};

    if (!Array.isArray(messages)) {
      return res.status(400).json({
        errorMessage: "messages must be an array",
      });
    }

    // Accept only valid user and assistant messages
    const history = messages
      .filter(
        (m) =>
          m &&
          ["user", "assistant"].includes(m.role) &&
          typeof m.content === "string" &&
          m.content.trim().length > 0
      )
      .slice(-10)
      .map((m) => ({
        role: m.role,
        content: m.content.trim(),
      }));

    if (
      history.length === 0 ||
      !history.some((m) => m.role === "user")
    ) {
      return res.status(400).json({
        errorMessage: "Please provide a valid user message.",
      });
    }

    // Check the Gemini API key
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("GEMINI_API_KEY is missing.");

      return res.status(500).json({
        errorMessage: "GEMINI_API_KEY is not configured in .env",
      });
    }

    // Connect to Gemini using the OpenAI-compatible API
    const ai = new OpenAI({
      apiKey,
      baseURL:
        "https://generativelanguage.googleapis.com/v1beta/openai/",
      timeout: 30000,
      maxRetries: 1,
    });

    // Generate the reply
    const completion = await ai.chat.completions.create({
      model: process.env.AI_MODEL || "gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...history,
      ],
    });

    const reply = completion.choices?.[0]?.message?.content;

    if (!reply) {
      return res.status(502).json({
        errorMessage: "Gemini returned an empty response.",
      });
    }

    return res.status(200).json({
      message: "Reply generated successfully",
      reply,
    });
  } catch (error) {
    // Detailed errors appear only in your backend terminal
    console.error("Gemini API error:", {
      message: error.message,
      status: error.status,
      code: error.code,
    });

    if (error.status === 401 || error.status === 403) {
      return res.status(error.status).json({
        errorMessage: "Check your Gemini API key and permissions.",
      });
    }

    if (error.status === 429) {
      return res.status(429).json({
        errorMessage: "Gemini API quota or rate limit reached.",
      });
    }

    if (error.status === 503) {
      return res.status(503).json({
        errorMessage: "Gemini is temporarily unavailable. Try again later.",
      });
    }

    if (
      error.code === "ETIMEDOUT" ||
      error.code === "ECONNABORTED"
    ) {
      return res.status(504).json({
        errorMessage: "Gemini request timed out. Please try again.",
      });
    }

    return res.status(500).json({
      errorMessage: "Failed to get a reply from Gemini.",
    });
  }
};
