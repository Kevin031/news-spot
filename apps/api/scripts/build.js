import { access, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

await Promise.all([
  access(resolve("src/app.js")),
  mkdir(resolve("dist"), { recursive: true }),
]);
console.log("API 源码校验完成");
