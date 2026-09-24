import { buildApp } from "./app.js";

const app = await buildApp();
const address = await app.listen({ host: app.newsSpot.env.HOST, port: app.newsSpot.env.PORT });
app.log.info({ address }, "News Spot 已启动");

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await app.close();
    process.exit(0);
  });
}
