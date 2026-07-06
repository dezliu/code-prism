import { loadConfig } from './config.js';
import { createKnex } from './infrastructure/db/knex.js';
import { FailStaleDocGenerateJobsUseCase } from './application/knowledge/doc-generate-job.use-cases.js';
import { FailStaleArchGenerateJobsUseCase } from './application/architecture/arch-generate-job.use-cases.js';
import { DocGenerateJobRepository } from './infrastructure/db/repositories/doc-generate-job.repository.js';
import { ArchGenerateJobRepository } from './infrastructure/db/repositories/arch-generate-job.repository.js';
import { startHttpServer } from './infrastructure/http/server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  createKnex(config.databaseUrl);

  const staleJobs = new FailStaleDocGenerateJobsUseCase(new DocGenerateJobRepository());
  try {
    const staleCount = await staleJobs.execute();
    if (staleCount > 0) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({ level: 'info', msg: 'marked stale doc generate jobs as failed', count: staleCount }));
    }
  } catch {
    // migration may not have run yet
  }

  const staleArchJobs = new FailStaleArchGenerateJobsUseCase(new ArchGenerateJobRepository());
  try {
    const staleArchCount = await staleArchJobs.execute();
    if (staleArchCount > 0) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({ level: 'info', msg: 'marked stale arch generate jobs as failed', count: staleArchCount }));
    }
  } catch {
    // migration may not have run yet
  }

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
