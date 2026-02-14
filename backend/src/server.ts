import { buildApp } from './app.js';

const start = async () => {
  const app = await buildApp();

  const port = Number(process.env.PORT) || 3003;
  const host = process.env.HOST || '0.0.0.0';

  try {
    await app.listen({ port, host });
    console.log(`Server running at http://${host}:${port}`);
    console.log(`API Documentation at http://${host}:${port}/docs`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
