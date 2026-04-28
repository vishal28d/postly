import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const listModels = async () => {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
  const modelsToTry = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro"];
  
  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent("Hello");
      console.log(`${modelName} check: SUCCESS`);
      break;
    } catch (err: any) {
      console.error(`${modelName} check: FAILED - ${err.message}`);
    }
  }
};

listModels();
