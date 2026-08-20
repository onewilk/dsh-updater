/**
 * dsh-updater — host half.
 *
 * 定时检查 deepseek-harness 是否有新版本（npm registry 为主版本源、GitHub releases
 * 为 changelog 辅源），与本地安装版本对比，并通过两个同源路由把结果暴露给客户端：
 *
 *   GET  /plugins/dsh-updater/status — 返回缓存的最新检查结果（缓存为空时先检查一次）。
 *   POST /plugins/dsh-updater/check  — 立即重新检查一次并返回结果。
 *
 * 定时：进程启动时预热一次，此后每 6 小时自动检查；客户端也可随时 POST check。
 * 所有网络请求都发生在 Node 侧，客户端只做同源 fetch，无 CORS 问题。
 */

import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Cordis 插件名。 */
const name = "dsh-updater";
/** 所需服务：DSH web 服务器（用于注册路由）。 */
const inject = ["webServer"];

/**
 * npm registry 包元数据：`dist-tags.latest` 即最新发布版本。作为主版本源，
 * 因为安装来源就是 npm（npx @deepseek-ai/dsh），版本号与安装版本直接对齐，
 * 且 registry.npmjs.org 可被 Node 直连（无代理也能访问）。
 */
const NPM_REGISTRY = "https://registry.npmjs.org/@deepseek-ai/dsh";
/**
 * GitHub releases 列表（per_page=1 取最新一个）。
 * 注意：不能用 `releases/latest` —— 该端点只返回非 prerelease 的最新 release，
 * 而本项目最新版是 rc 预发布版，`releases/latest` 会返回 404。列表端点包含 prerelease。
 */
const GITHUB_RELEASES_API = "https://api.github.com/repos/deepseek-ai/deepseek-harness/releases?per_page=1";
/** 仓库主页链接（changelog 为空时的兜底链接）。 */
const REPO_URL = "https://github.com/deepseek-ai/deepseek-harness";
/** Releases 列表页链接（兜底）。 */
const RELEASES_URL = REPO_URL + "/releases";
/** 自动检查间隔：6 小时。 */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** 单次网络请求超时：超过即放弃该源，保证检查总能在有限时间内返回（不会一直「检查中」）。 */
const FETCH_TIMEOUT_MS = 8000;

/**
 * 第三方 GitHub 数据镜像（ungh.cc，unjs 团队维护）：直连可达、自带缓存，
 * 不受 api.github.com 匿名 rate limit（60 次/小时/共享出口 IP）限制，
 * 且直接返回 release 的 markdown changelog。作为「加速」模式的首选数据源。
 */
const UNGH_RELEASES_API = "https://ungh.cc/repos/deepseek-ai/deepseek-harness/releases";
/**
 * ghproxy 类加速前缀：拼接在原始 GitHub URL 之前，形如
 * `https://gh-proxy.com/https://api.github.com/...`。作为 ungh.cc 之后的兜底。
 * 实测这类服务对 api.github.com 仍受 rate limit、对 github.com 会被 Cloudflare 拦截，
 * 因此仅作后备，不保证稳定。
 */
const GITHUB_PROXY_PREFIXES = [
	"https://gh-proxy.com/"
];

const ROUTE_STATUS = "/plugins/dsh-updater/status";
const ROUTE_CHECK = "/plugins/dsh-updater/check";
const ROUTE_CONFIG = "/plugins/dsh-updater/config";
const ROUTE_UPGRADE = "/plugins/dsh-updater/upgrade";

/** 插件配置持久化文件（web profile 下），存储「使用 GitHub 加速」开关。 */
const CONFIG_FILE = (() => {
	const home = process.env.DSH_HOME && process.env.DSH_HOME.trim() ? process.env.DSH_HOME : join(homedir(), ".dsh");
	return join(home, "profiles", "web", "dsh-updater.json");
})();

/**
 * 读取本地安装的 @deepseek-ai/dsh 版本。
 * 优先用 createRequire 沿模块解析链定位（能跟随 profile 的 node_modules 符号链接
 * 指向当前 npx 安装）；失败时回退到 $DSH_HOME/profiles/node_modules 下的固定路径。
 * @returns 版本字符串，或 "unknown"。
 */
function readCurrentVersion() {
	try {
		const require = createRequire(import.meta.url);
		const pkg = require("@deepseek-ai/dsh/package.json");
		if (pkg && typeof pkg.version === "string" && pkg.version) return pkg.version;
	} catch {
		/* fall through to the fixed-path fallback */
	}
	try {
		const home = process.env.DSH_HOME && process.env.DSH_HOME.trim() ? process.env.DSH_HOME : join(homedir(), ".dsh");
		const pkg = JSON.parse(readFileSync(join(home, "profiles", "node_modules", "@deepseek-ai", "dsh", "package.json"), "utf8"));
		if (pkg && typeof pkg.version === "string" && pkg.version) return pkg.version;
	} catch {
		/* ignore */
	}
	return "unknown";
}

/**
 * 读取「使用 GitHub 加速」开关。默认 true：直连 api.github.com 在多数网络下
 * 要么被墙（ECONNRESET）要么撞上匿名 rate limit，开箱即用应走镜像/加速。
 * @returns 开关布尔值。
 */
function readProxyConfig() {
	try {
		const cfg = JSON.parse(readFileSync(CONFIG_FILE, "utf8"));
		return cfg && typeof cfg.proxy === "boolean" ? cfg.proxy : true;
	} catch {
		return true;
	}
}

/**
 * 持久化「使用 GitHub 加速」开关。
 * @param proxy - 开关布尔值。
 */
function writeProxyConfig(proxy) {
	try {
		writeFileSync(CONFIG_FILE, JSON.stringify({ proxy: !!proxy }, null, 2), "utf8");
	} catch {
		/* 写失败不致命：开关在当前进程内仍生效，仅重启后丢失。 */
	}
}

/**
 * 读取并解析 JSON 请求体（上限 64KB）。
 * @param req - Node IncomingMessage。
 * @returns 解析后的对象；body 为空或非法 JSON 时返回 null。
 */
function readJsonBody(req) {
	return new Promise((resolve) => {
		const chunks = [];
		let size = 0;
		let settled = false;
		const done = (value) => {
			if (!settled) {
				settled = true;
				resolve(value);
			}
		};
		req.on("data", (chunk) => {
			size += chunk.length;
			if (size > 65536) {
				done(null);
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => {
			try {
				done(JSON.parse(Buffer.concat(chunks).toString("utf8")));
			} catch {
				done(null);
			}
		});
		req.on("error", () => done(null));
	});
}

/**
 * 从 release 的 tag_name（如 `dsh-v0.1.0-rc.7`）中提取语义化版本号。
 * @param tag - GitHub release 的 tag_name。
 * @returns 形如 `0.1.0-rc.7` 的版本串；提取失败则原样返回 tag。
 */
function versionFromTag(tag) {
	const match = /(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]*)?)/.exec(String(tag ?? ""));
	return match ? match[1] : String(tag ?? "");
}

/**
 * 解析版本为可比较的结构：主版本三段数字 + prerelease 段。
 * @param value - 版本字符串。
 */
function parseVersion(value) {
	const raw = String(value ?? "").trim();
	const core = raw.split(/[-+]/)[0] ?? "";
	const parts = core.split(".").map((n) => parseInt(n, 10) || 0);
	const preMatch = /[-+]([0-9A-Za-z.-]+)$/.exec(raw);
	const pre = preMatch ? preMatch[1].split(".") : [];
	return { parts, pre };
}

/**
 * 比较两个语义化版本。返回负数表示 a < b，0 表示相等，正数表示 a > b。
 * 覆盖 `0.1.0-rc.6` vs `0.1.0-rc.7` 这类带 prerelease 的版本。
 */
function compareVersions(a, b) {
	const left = parseVersion(a);
	const right = parseVersion(b);
	for (let i = 0; i < 3; i += 1) {
		const x = left.parts[i] ?? 0;
		const y = right.parts[i] ?? 0;
		if (x !== y) return x < y ? -1 : 1;
	}
	// 正式版（无 prerelease）视为高于任何带 prerelease 的版本。
	if (left.pre.length === 0 && right.pre.length === 0) return 0;
	if (left.pre.length === 0) return 1;
	if (right.pre.length === 0) return -1;
	for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i += 1) {
		const x = left.pre[i] ?? "";
		const y = right.pre[i] ?? "";
		if (x === y) continue;
		const xn = parseInt(x, 10);
		const yn = parseInt(y, 10);
		if (!Number.isNaN(xn) && !Number.isNaN(yn)) return xn < yn ? -1 : 1;
		return x < y ? -1 : 1;
	}
	return 0;
}

/**
 * 把 fetch 抛出的错误转成可读的短描述（优先 cause.code，如 ECONNRESET；超时/中止单独标注）。
 * @param err - 捕获的错误。
 * @returns 短描述字符串。
 */
function describeError(err) {
	if (!err) return "未知错误";
	if (err.name === "TimeoutError" || err.name === "AbortError") return "请求超时";
	if (err.cause && err.cause.code) return String(err.cause.code);
	return String(err.message || err);
}

/**
 * 从 npm registry 读取最大发布版本号（取所有 versions 中最大的，而非仅 dist-tags.latest）。
 * 这样新版在 next/rc 等 dist-tag 下也能被检测到（如 0.1.0-rc.8 在 next 而非 latest 时）。
 * @returns 版本字符串；失败抛异常。
 */
async function fetchNpmLatest() {
	const res = await fetch(NPM_REGISTRY, {
		method: "GET",
		headers: { "User-Agent": "dsh-updater" },
		cache: "no-store",
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
	});
	if (!res.ok) throw new Error("npm registry HTTP " + res.status);
	const json = await res.json();
	const versions = Object.keys(json.versions || {});
	if (versions.length === 0) throw new Error("npm registry 无可用版本");
	// 取所有已发布版本中的最大版本号（按 semver 比较），而非仅 dist-tags.latest。
	// 这样新版在 next/rc 等 dist-tag 下（如 0.1.0-rc.8 在 next 而非 latest）也能被检测到。
	const sorted = versions.sort(compareVersions);
	return sorted[sorted.length - 1];
}

/**
 * 请求一个 GitHub releases API 端点（直连或经 ghproxy 拼接），返回原始 release 对象。
 * @param url - 完整请求地址。
 * @returns release 对象（字段为 GitHub 原始字段名）。
 */
async function fetchGithubApi(url) {
	const res = await fetch(url, {
		method: "GET",
		headers: {
			"User-Agent": "dsh-updater",
			"Accept": "application/vnd.github+json"
		},
		cache: "no-store",
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
	});
	if (!res.ok) throw new Error("GitHub API HTTP " + res.status);
	const json = await res.json();
	const rel = Array.isArray(json) ? json[0] : json;
	if (!rel || typeof rel !== "object") throw new Error("GitHub 无可用 release");
	return rel;
}

/**
 * 从 ungh.cc 镜像读取最新 release，并把字段映射成 GitHub release 的字段名
 * （tag_name / name / html_url / body / published_at），供上层统一消费。
 * @returns 映射后的 release 对象。
 */
async function fetchUnghRelease() {
	const res = await fetch(UNGH_RELEASES_API, {
		method: "GET",
		headers: { "User-Agent": "dsh-updater" },
		cache: "no-store",
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
	});
	if (!res.ok) throw new Error("ungh.cc HTTP " + res.status);
	const json = await res.json();
	const list = Array.isArray(json.releases) ? json.releases : (Array.isArray(json) ? json : []);
	const rel = list[0];
	if (!rel || typeof rel !== "object") throw new Error("ungh.cc 无可用 release");
	return {
		tag_name: typeof rel.tag === "string" ? rel.tag : null,
		name: typeof rel.name === "string" ? rel.name : null,
		html_url: typeof rel.tag === "string" ? REPO_URL + "/releases/tag/" + encodeURIComponent(rel.tag) : RELEASES_URL,
		body: typeof rel.markdown === "string" ? rel.markdown : "",
		published_at: typeof rel.publishedAt === "string" ? rel.publishedAt : (typeof rel.createdAt === "string" ? rel.createdAt : null)
	};
}

/**
 * 从 GitHub 读取最新 release 信息（changelog / 链接 / 发布时间）。
 * 尽力而为，调用方应降级处理（失败时仍用 npm 版本号，changelog 留空）。
 * @param useProxy - 是否走加速/镜像：true 时按 ungh.cc → ghproxy 拼接 → 直连 顺序兜底；
 *                   false 时仅直连 api.github.com。
 * @returns release 对象（字段已统一为 GitHub 字段名）；全部失败抛异常。
 */
async function fetchGithubRelease(useProxy) {
	const sources = [];
	if (useProxy) {
		sources.push(fetchUnghRelease);
		for (const prefix of GITHUB_PROXY_PREFIXES) {
			sources.push(() => fetchGithubApi(prefix + GITHUB_RELEASES_API));
		}
	}
	sources.push(() => fetchGithubApi(GITHUB_RELEASES_API));

	let lastErr = null;
	for (const src of sources) {
		try {
			return await src();
		} catch (err) {
			lastErr = err;
		}
	}
	throw lastErr || new Error("GitHub 无可用数据源");
}

/**
 * 检查一次更新：npm registry 提供最新版本（主源），GitHub 提供 changelog / 链接（辅源）。
 * 任一源失败都收敛为带 error 字段的状态，绝不抛异常。
 * 版本号以 npm 为准；npm 不可达时回退到 GitHub tag 版本；两者都失败才标记 error。
 * @returns 状态对象（JSON 可序列化）。
 */
async function checkForUpdates(useProxy = true) {
	const current = readCurrentVersion();
	const base = {
		current,
		latest: null,
		updateAvailable: false,
		checkedAt: new Date().toISOString(),
		tagName: null,
		name: null,
		htmlUrl: RELEASES_URL,
		body: "",
		publishedAt: null,
		source: null,
		error: null,
		githubError: null
	};

	// npm 与 GitHub 并行请求（各自带超时），缩短总耗时并保证有界返回。
	const wrap = (promise) => promise.then((value) => ({ ok: true, value })).catch((error) => ({ ok: false, error }));
	const [npmRes, ghRes] = await Promise.all([
		wrap(fetchNpmLatest()),
		wrap(fetchGithubRelease(useProxy))
	]);

	const npmLatest = npmRes.ok ? npmRes.value : null;
	const npmError = npmRes.ok ? null : String(npmRes.error && npmRes.error.message ? npmRes.error.message : npmRes.error);
	const github = ghRes.ok ? ghRes.value : null;
	/** GitHub 辅源失败的具体原因（用于 UI 诊断；不影响版本号结果）。 */
	const githubError = ghRes.ok ? null : describeError(ghRes.error);

	const ghVersion = github ? versionFromTag(github.tag_name) : null;
	const latest = npmLatest ?? ghVersion;

	return {
		...base,
		latest,
		updateAvailable: latest ? compareVersions(latest, current) > 0 : false,
		tagName: github && github.tag_name ? github.tag_name : null,
		name: github && github.name ? github.name : null,
		htmlUrl: github && github.html_url ? github.html_url : RELEASES_URL,
		body: github && typeof github.body === "string" ? github.body : "",
		publishedAt: github && github.published_at ? github.published_at : null,
		source: npmLatest ? "npm" : (ghVersion ? "github" : null),
		error: latest ? null : (npmError ? "npm: " + npmError : "无法获取最新版本"),
		githubError
	};
}

/**
 * 注册 status / check 路由，启动预热检查，并挂上定时器。
 * @param ctx - host 插件上下文，携带 webServer 服务。
 */
function apply(ctx) {
	/** 最近一次成功的检查结果缓存。 */
	let cache = null;
	/** 进行中的检查（去重并发），null 表示空闲。 */
	let inflight = null;
	/** 当前「使用 GitHub 加速」开关（启动时从配置文件读取，默认 true）。 */
	let proxyEnabled = readProxyConfig();

	/** 复用进行中的检查；空闲时启动一次新的。 */
	const runCheck = () => {
		if (inflight === null) {
			inflight = checkForUpdates(proxyEnabled)
				.then((result) => {
					cache = result;
					return result;
				})
				.finally(() => {
					inflight = null;
				});
		}
		return inflight;
	};

	const respond = (res, payload, status = 200) => {
		const body = JSON.stringify(payload);
		res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
		res.end(body);
	};

	/** 在结果上附加当前开关状态，供客户端同步 UI。 */
	const withProxy = (result) => ({ ...result, proxy: proxyEnabled });

	/** GET status：返回缓存；缓存为空则先检查一次。 */
	const statusHandler = async (req, res) => {
		try {
			const result = cache !== null ? cache : await runCheck();
			respond(res, withProxy(result));
		} catch (err) {
			respond(res, { error: String(err && err.message ? err.message : err), proxy: proxyEnabled }, 500);
		}
	};

	/** POST check：立即重新检查（忽略缓存 / 进行中状态，强制刷新），可带 { proxy } 覆盖开关。 */
	const checkHandler = async (req, res) => {
		if (req.method !== "POST") {
			respond(res, { error: "method-not-allowed" }, 405);
			return;
		}
		try {
			const body = await readJsonBody(req);
			if (body && typeof body.proxy === "boolean") {
				proxyEnabled = body.proxy;
				writeProxyConfig(proxyEnabled);
			}
			const result = await checkForUpdates(proxyEnabled);
			cache = result;
			respond(res, withProxy(result));
		} catch (err) {
			respond(res, { error: String(err && err.message ? err.message : err), proxy: proxyEnabled }, 500);
		}
	};

	/** POST config：保存「使用 GitHub 加速」开关，返回当前状态。 */
	const configHandler = async (req, res) => {
		if (req.method !== "POST") {
			respond(res, { error: "method-not-allowed" }, 405);
			return;
		}
		try {
			const body = await readJsonBody(req);
			if (body && typeof body.proxy === "boolean") {
				proxyEnabled = body.proxy;
				writeProxyConfig(proxyEnabled);
			}
			respond(res, { proxy: proxyEnabled });
		} catch (err) {
			respond(res, { error: String(err && err.message ? err.message : err), proxy: proxyEnabled }, 500);
		}
	};

	/** POST upgrade：停止当前进程，并用最新版本命令重启。 */
	const upgradeHandler = async (req, res) => {
		if (req.method !== "POST") {
			respond(res, { error: "method-not-allowed" }, 405);
			return;
		}
		const latestVersion = cache && cache.latest;
		if (!latestVersion) {
			respond(res, { error: "暂无最新版本信息，请先执行检查更新" }, 400);
			return;
		}
		const current = readCurrentVersion();
		if (compareVersions(latestVersion, current) <= 0) {
			respond(res, { ok: false, message: "已是最新版本，无需升级" });
			return;
		}
		const cmd = `npx @deepseek-ai/dsh@${latestVersion} web`;

		// 先响应客户端，确保响应被发送
		respond(res, { ok: true, version: latestVersion, cmd });

		// 启动 detached 子进程，等待父进程退出后自动重启
		const { spawn } = await import("node:child_process");
		const child = spawn("sh", ["-c", `
			while kill -0 ${process.pid} 2>/dev/null; do sleep 0.5; done
			sleep 1
			${cmd}
		`], {
			detached: true,
			stdio: "ignore",
			cwd: process.cwd()
		});
		child.unref();

		// 给响应发送留一点时间，然后退出
		setTimeout(() => process.exit(0), 300);
	};

	ctx.effect(
		() => ctx.webServer.register({ kind: "exact", path: ROUTE_STATUS, handler: statusHandler }),
		`dsh-updater: ${ROUTE_STATUS} route`
	);
	ctx.effect(
		() => ctx.webServer.register({ kind: "exact", path: ROUTE_CHECK, handler: checkHandler }),
		`dsh-updater: ${ROUTE_CHECK} route`
	);
	ctx.effect(
		() => ctx.webServer.register({ kind: "exact", path: ROUTE_CONFIG, handler: configHandler }),
		`dsh-updater: ${ROUTE_CONFIG} route`
	);
	ctx.effect(
		() => ctx.webServer.register({ kind: "exact", path: ROUTE_UPGRADE, handler: upgradeHandler }),
		`dsh-updater: ${ROUTE_UPGRADE} route`
	);

	// 启动时预热一次（异步，不阻塞启动）。
	runCheck().catch(() => {});

	// 定时自动检查。
	ctx.effect(() => {
		const timer = setInterval(() => {
			runCheck().catch(() => {});
		}, CHECK_INTERVAL_MS);
		return () => clearInterval(timer);
	}, "dsh-updater: interval");
}

export { apply, inject, name };
