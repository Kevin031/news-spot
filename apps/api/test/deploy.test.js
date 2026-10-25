import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const registryImage = `crpi-example.cn-guangzhou.personal.cr.aliyuncs.com/kevinlau/news-spot:${"a".repeat(40)}`;
function dryRun(extra = {}) {
  return spawnSync(process.execPath, ["scripts/deploy.mjs", "--dry-run"], {
    cwd: root, encoding: "utf8",
    env: { ...process.env, DEPLOY_CONFIG_FILE: "/nonexistent/deploy.env", DEPLOY_SSH_TARGET: "production", DEPLOY_ENV_FILE: "", DEPLOY_REGISTRY_IMAGE: "", ...extra },
  });
}

describe("ACR 自动部署", () => {
  it("本地应急发布仍构建和打包镜像", () => {
    const result = dryRun();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("docker build --platform linux/amd64");
    expect(result.stdout).toContain("docker save news-spot:");
    expect(result.stdout).toContain("rsync <production-image>");
  });

  it("CI 仓库镜像模式只上传 Compose，不构建或传输镜像包", () => {
    const result = dryRun({ DEPLOY_REGISTRY_IMAGE: registryImage });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`使用已通过 CI 检查的仓库镜像：${registryImage}`);
    expect(result.stdout).not.toContain("docker build");
    expect(result.stdout).not.toContain("docker save");
    expect(result.stdout).not.toContain("rsync <production-image>");
    expect(result.stdout).toContain("rsync <production-compose>");
    expect(result.stdout).toContain("载入镜像、健康检查并切换版本");
  });

  it.each(["news-spot:latest", "registry.example/kevinlau/news-spot:latest", "registry.example/kevinlau/news-spot:abc'; false"])("拒绝非完整 SHA 或不安全的镜像引用：%s", (image) => {
    const result = dryRun({ DEPLOY_REGISTRY_IMAGE: image });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("DEPLOY_REGISTRY_IMAGE 必须是带完整提交 SHA 标签的仓库镜像");
    expect(result.stdout).not.toContain("ssh");
  });
});
