import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const test10 = async () => {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.0-pro" });
    const result = await model.generateContent("Hello");
    console.log("SUCCESS:", result.response.text());
  } catch (err: any) {
    console.log("FAILED:", err.message);
  }
};

test10();
