import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve("..");
const outDir = path.join(root, "docs", "qa-screenshots");

async function ensureUser(username, password) {
  const response = await fetch("http://127.0.0.1:8000/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  if (!response.ok && response.status !== 409) {
    throw new Error(`创建测试用户失败：${response.status}`);
  }
}

async function login(page, username = "admin", password = "Admin@123456") {
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "进入系统" }).click();
  await expect(page.getByText("问答工作台").first()).toBeVisible();
}

async function ask(page, question) {
  await page.locator("textarea").fill(question);
  await page.locator(".askButton").click();
  await expect(page.locator(".answerPanel")).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole("heading", { name: "当前轮次详情" })).toBeVisible({ timeout: 20000 });
  await expect(page.locator(".statusBadge").last()).toBeVisible({ timeout: 20000 });
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await login(page);

  await ask(page, "我是谁");
  await expect(page.getByText("不在课程范围")).toBeVisible();
  await expect(page.getByText("关联知识图谱子图")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "来源" })).toHaveCount(0);
  await page.screenshot({ path: path.join(outDir, "desktop-out-of-scope.png"), fullPage: true });

  await ask(page, "岭回归和 Lasso 有什么区别？");
  await expect(page.getByText("已回答").or(page.getByText("降级回答"))).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole("heading", { name: "来源" })).toBeVisible();
  await expect(page.getByText("关联知识图谱子图")).toBeVisible();
  const answerText = await page.locator(".answerPanel").innerText();
  if (/[{}]{3,}|FIGURE\s+\d+\.\d+.*Coefficient Estimate/i.test(answerText)) {
    throw new Error("回答区域仍包含明显 PDF 抽取噪声");
  }
  await page.screenshot({ path: path.join(outDir, "desktop-ridge-answer.png"), fullPage: true });

  await ask(page, "那它为什么能做变量选择？");
  await expect(page.locator(".chatBubble.user").last()).toBeVisible();
  await expect(page.locator(".perfStrip").last()).toContainText("总耗时");
  await expect(page.getByText("关联知识图谱子图")).toBeVisible();
  await page.screenshot({ path: path.join(outDir, "desktop-follow-up.png"), fullPage: true });

  await page.getByRole("button", { name: "我的笔记" }).click();
  await page.getByRole("button", { name: "全部历史" }).click();
  await page.locator(".historyList article").first().click();
  await expect(page.locator(".historyDetail .markdown")).toBeVisible();
  await page.screenshot({ path: path.join(outDir, "desktop-history-detail.png"), fullPage: true });

  await page.getByRole("button", { name: "管理后台" }).click();
  await expect(page.getByText("当前索引状态")).toBeVisible();
  await expect(page.getByText("ISLRv2_corrected_J...2023.pdf").first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("button", { name: "教材与索引" })).toBeVisible();
  await page.screenshot({ path: path.join(outDir, "desktop-admin-overview.png"), fullPage: true });

  await page.getByRole("button", { name: "教材与索引" }).click();
  await expect(page.getByRole("heading", { name: "教材与索引" })).toBeVisible();
  await expect(page.getByText("上传新的 PDF 参考书")).toBeVisible();
  await page.screenshot({ path: path.join(outDir, "desktop-admin-books.png"), fullPage: true });

  await page.getByRole("button", { name: "用户与权限" }).click();
  await expect(page.getByText("admin").first()).toBeVisible({ timeout: 10000 });

  await page.getByRole("button", { name: "知识点" }).click();
  await expect(page.getByRole("heading", { name: "知识点" })).toBeVisible();

  const conceptName = `验收可视节点${Date.now()}`;
  await page.getByPlaceholder("slug").fill(`visual-${Date.now()}`);
  await page.getByPlaceholder("中文名称").fill(conceptName);
  await page.getByPlaceholder("英文名称").fill("Visual Acceptance Concept");
  await page.getByPlaceholder("别名，用逗号分隔").fill("可视验收");
  await page.getByPlaceholder("章节").fill("验收");
  await page.getByPlaceholder("描述").fill("用于 Playwright 管理后台 CRUD 可视验收。");
  await page.getByRole("button", { name: "新增知识点" }).click();
  const createdConcept = page.locator(".compactList article").filter({ hasText: conceptName }).first();
  await expect(createdConcept).toBeVisible({ timeout: 10000 });
  await createdConcept.getByRole("button", { name: "删除" }).click();
  await expect(createdConcept).toHaveCount(0, { timeout: 10000 });

  await page.getByRole("button", { name: "问答对", exact: true }).click();
  await page.getByRole("button", { name: "进入分页管理" }).click();
  await expect(page.getByRole("heading", { name: "问答对管理" })).toBeVisible();
  await expect(page.getByRole("button", { name: "新增问答对" })).toBeVisible();
  await expect(page.getByText(/第 1 \/ \d+ 页/)).toBeVisible();
  await page.screenshot({ path: path.join(outDir, "desktop-qa-pagination.png"), fullPage: true });
  await page.getByRole("button", { name: "管理后台" }).click();
  await expect(page.getByText("当前索引状态")).toBeVisible({ timeout: 10000 });
  await page.screenshot({ path: path.join(outDir, "desktop-admin.png"), fullPage: true });

  await ensureUser("visual_student", "password123");
  const student = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await login(student, "visual_student", "password123");
  await expect(student.getByRole("button", { name: "管理后台" })).toHaveCount(0);
  await expect(student.getByRole("button", { name: "问答对管理" })).toHaveCount(0);
  await student.screenshot({ path: path.join(outDir, "desktop-student-boundary.png"), fullPage: true });
  await student.getByRole("button", { name: "知识图谱" }).click();
  await expect(student.locator(".conceptScroll button").first()).toBeVisible({ timeout: 10000 });
  await expect(student.locator(".graphCanvas")).toBeVisible({ timeout: 10000 });
  await student.getByPlaceholder("搜索知识点").fill("岭回归");
  await student.getByRole("button", { name: "搜索" }).click();
  await expect(student.locator(".conceptScroll")).toContainText("岭回归", { timeout: 10000 });
  await student.screenshot({ path: path.join(outDir, "desktop-student-graph.png"), fullPage: true });

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await login(mobile);
  await ask(mobile, "我是谁");
  await mobile.screenshot({ path: path.join(outDir, "mobile-out-of-scope.png"), fullPage: true });

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
