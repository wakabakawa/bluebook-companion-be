import { buildApp } from "./app.js";

const port = Number(process.env.PORT ?? 8787);
const app = buildApp();

app
  .listen({ port, host: "0.0.0.0" })
  .then(() => {
    app.log.info(`solve endpoint: http://localhost:${port}/api/v1/algorithm/solve`);
    app.log.info(`from Android emulator: http://10.0.2.2:${port}/api/v1/algorithm/solve`);
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
