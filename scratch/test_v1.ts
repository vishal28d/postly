import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const testV1 = async () => {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
  try {
    // Attempting to force v1 if possible, though SDK usually handles it.
    // Actually, let's just try to fetch the list of models if the SDK supports it.
    // In @google/generative-ai, there isn't a direct listModels, 
    // but we can try to use a different model string.
    
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }, { apiVersion: 'v1' });
    const result = await model.generateContent("Hello");
    console.log("v1 SUCCESS:", result.response.text());
  } catch (err: any) {
    console.log("v1 FAILED:", err.message);
  }
};

testV1();
