import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const testLatest = async () => {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
    const result = await model.generateContent("Hello");
    console.log("SUCCESS:", result.response.text());
  } catch (err: any) {
    console.log("FAILED:", err.message);
  }
};

testLatest();
