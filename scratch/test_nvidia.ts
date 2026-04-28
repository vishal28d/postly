import { generateContent } from '../src/services/ai.service';
import dotenv from 'dotenv';
dotenv.config();

const testNvidia = async () => {
  try {
    console.log("Testing NVIDIA NIM (Gemma)...");
    const result = await generateContent("user123", "AI is transforming the world", ["twitter"], "professional", "English", "nvidia");
    console.log("NVIDIA Result:", JSON.stringify(result, null, 2));
  } catch (err: any) {
    console.error("NVIDIA Test Failed:", err.message);
  }
};

testNvidia();
