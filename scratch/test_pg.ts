import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const testPg = async () => {
  const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  try {
    const res = await pool.query('SELECT NOW()');
    console.log("PG SUCCESS:", res.rows[0]);
  } catch (err: any) {
    console.error("PG FAILED:", err.message);
  } finally {
    await pool.end();
  }
};

testPg();
