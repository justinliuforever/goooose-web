import { defineConfig } from "@trigger.dev/sdk";
import { ffmpeg } from "@trigger.dev/build/extensions/core";

export default defineConfig({
  project: "proj_lfwtogxhtvfemlfqeooh",
  runtime: "node",
  logLevel: "log",
  maxDuration: 14400,
  dirs: ["./trigger"],
  build: {
    extensions: [ffmpeg()],
  },
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
