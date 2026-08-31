import app from './app.js';
import { connectDB, disconnectDB, IndexConflictError } from './config/db.js';
import { env } from './config/env.js';
import { slotGrid } from './utils/slots.js';

async function start() {
  try {
    await connectDB();
    console.log(`✔ MongoDB connected (${env.mongoUri.replace(/:\/\/.*@/, '://***@')})`);
    console.log(
      `✔ Seating slots (${env.slotMinutes} min): ${slotGrid().map((s) => s.label).join(' · ')}`,
    );
  } catch (err) {
    if (err instanceof IndexConflictError) {
      console.error('✖ Database index conflict.\n');
      console.error(`  ${err.message}`);
    } else {
      console.error('✖ Could not connect to MongoDB.');
      console.error(`  ${err.message}`);
      console.error('  Is mongod running, and is MONGO_URI correct in server/.env?');
    }
    process.exit(1);
  }

  const server = app.listen(env.port, () => {
    console.log(`✔ API listening on http://localhost:${env.port} (${env.nodeEnv})`);
  });

  const shutdown = async (signal) => {
    console.log(`\n${signal} received — shutting down.`);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    // Don't let a hung connection block shutdown forever.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled promise rejection:', reason);
  });
}

start();
