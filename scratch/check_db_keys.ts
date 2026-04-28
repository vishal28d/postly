import { prisma } from '../src/utils/db';
import { decrypt } from '../src/utils/crypto';
import dotenv from 'dotenv';
dotenv.config();

const checkKeys = async () => {
  try {
    const keys = await prisma.aIKey.findMany();
    console.log(`Found ${keys.length} keys in database`);
  } catch (e: any) {
    console.error("Database check failed FULL ERROR:", e);
  } finally {
    await prisma.$disconnect();
  }
};

checkKeys();
