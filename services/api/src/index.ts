import { loadConfig } from './config.js';
import { createKnex } from './infrastructure/db/knex.js';
import { startHttpServer } from './infrastructure/http/server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  createKnex(config.databaseUrl);

  const { app, port } = await startHttpServer({ config });

  const server = app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        level: config.logLevel,
        msg: 'api server started',
        port,
        graphql: `/graphql`,
        health: `/health`,
      }),
    );
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      // eslint-disable-next-line no-console
      console.error(
        JSON.stringify({
          level: 'error',
          msg: `port ${port} already in use — stop the existing api process first`,
          hint: `lsof -i :${port}  # then kill <PID>, or stop Docker/local api duplicate`,
        }),
      );
      process.exit(1);
    }
    throw error;
  });
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ level: 'error', msg: 'api server failed to start', error: String(error) }));
  process.exit(1);
});
