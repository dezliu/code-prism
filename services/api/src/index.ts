import { loadConfig } from './config.js';
import { createKnex } from './infrastructure/db/knex.js';
import { startHttpServer } from './infrastructure/http/server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  createKnex(config.databaseUrl);

  const { app, port } = await startHttpServer({ config });

  app.listen(port, () => {
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
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ level: 'error', msg: 'api server failed to start', error: String(error) }));
  process.exit(1);
});
