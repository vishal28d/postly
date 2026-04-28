import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const testKey = async () => {
  const genAI = new GoogleGenerativeAI("WRONG_KEY");
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    await model.generateContent("Hello");
  } catch (err: any) {
    console.log("Wrong key error:", err.message);
  }
};

testKey();
