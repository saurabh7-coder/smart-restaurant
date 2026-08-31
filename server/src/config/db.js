import mongoose from 'mongoose';
import { env } from './env.js';

mongoose.set('strictQuery', true);

/** Raised when the database has an index that conflicts with the schema. */
export class IndexConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'IndexConflictError';
  }
}

export async function connectDB() {
  const conn = await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 10000,
  });

  // Index creation is what enforces the no-double-booking rule, so we wait for
  // it explicitly instead of letting Mongoose build indexes in the background.
  try {
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  } catch (err) {
    // Changing an index's options in code does NOT update an index that already
    // exists under the same name — MongoDB rejects it. Say so plainly, with the
    // command to fix it, instead of blaming the connection.
    if (/same name as the requested index|IndexOptionsConflict|IndexKeySpecsConflict/i.test(err.message)) {
      const name = /name: "([^"]+)"/.exec(err.message)?.[1] || '<index>';
      throw new IndexConflictError(
        `The database already has an index named "${name}" with different options than the schema now defines.\n` +
          `  MongoDB will not silently rebuild it. Drop the old index, then restart:\n\n` +
          `    mongosh "${env.mongoUri}" --eval 'db.<collection>.dropIndex("${name}")'\n\n` +
          `  Original error: ${err.message}`,
      );
    }
    throw err;
  }

  return conn;
}

export async function disconnectDB() {
  await mongoose.connection.close();
}
