import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: "proj_lfwtogxhtvfemlfqeooh",
  runtime: "node",
  logLevel: "log",
  maxDuration: 3600,
  dirs: ["./trigger"],
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      factor: 2,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      randomize: true,
    },
  },
});
