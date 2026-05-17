import { logger, metadata, task, wait } from "@trigger.dev/sdk";

/**
 * Hello-world task — verifies the worker connects to the cloud and that
 * metadata.set() streams progress for useRealtimeRun() in the frontend.
 *
 * Trigger from CLI: pnpm --filter @singularity/jobs dev
 * Then in another terminal: pnpm --filter @singularity/jobs trigger.dev send hello
 */
export const helloWorld = task({
  id: "hello-world",
  maxDuration: 60,
  run: async (payload: { name?: string }) => {
    const name = payload.name ?? "world";
    logger.info(`Hello, ${name}!`);

    for (let i = 1; i <= 5; i++) {
      await metadata.set("progress", { current: i, total: 5, phase: "counting" });
      logger.info(`Step ${i}/5`);
      await wait.for({ seconds: 1 });
    }

    return { message: `Hello, ${name}!`, steps: 5 };
  },
});
