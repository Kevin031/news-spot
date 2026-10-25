import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
function dryRun(extra = {}) {
  return spawnSync(process.execPath, ["scripts/deploy.mjs", "--dry-run"], {
    cwd: root, encoding: "utf8",
    env: { ...process.env, DEPLOY_CONFIG_FILE: "/nonexistent/deploy.env", DEPLOY_SSH_TARGET: "production", DEPLOY_ENV_FILE: "", DEPLOY_IMAGE_TAG: "", DEPLOY_IMAGE_ARCHIVE: "", ...extra },
  });
}

describe("自动部署镜像复用", () => {
  it("普通发布仍构建和打包镜像", () => {
    const result = dryRun();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("docker build --platform linux/amd64");
    expect(result.stdout).toContain("docker save news-spot:");
  });

  it("CI 发布复用已有镜像归档并保留输入文件", () => {
    const dir = mkdtempSync(join(tmpdir(), "news-spot-deploy-"));
    const archive = join(dir, "image.tar.gz");
    writeFileSync(archive, "test archive");
    try {
      const result = dryRun({ DEPLOY_IMAGE_ARCHIVE: archive, DEPLOY_IMAGE_TAG: "news-spot:18325ce" });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("复用已通过 CI 检查的镜像：news-spot:18325ce");
      expect(result.stdout).not.toContain("docker build");
      expect(result.stdout).not.toContain("docker save");
      expect(result.stdout).toContain("rsync <production-image>");
      expect(existsSync(archive)).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("拒绝不完整的镜像配置和不安全标签", () => {
    expect(dryRun({ DEPLOY_IMAGE_TAG: "news-spot:abc" }).stderr).toContain("必须同时设置");
    const invalid = dryRun({ DEPLOY_IMAGE_ARCHIVE: "Dockerfile", DEPLOY_IMAGE_TAG: "news-spot:abc'; false" });
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toContain("合法的 news-spot 镜像标签");
  });

  it("缺失镜像归档时在连接服务器之前失败", () => {
    const result = dryRun({ DEPLOY_IMAGE_ARCHIVE: "/nonexistent/image.tar.gz", DEPLOY_IMAGE_TAG: "news-spot:abc" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("DEPLOY_IMAGE_ARCHIVE 文件不存在");
    expect(result.stdout).not.toContain("ssh");
  });
});
