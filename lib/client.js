/**
 * dsh-updater — client bundle.
 *
 * 1. 注册「关于」设置 Tab（settings.section slot，order 排在最后）：logo、当前版本、
 *    最新版本、手动检查、仓库链接、最近检查时间与 changelog。
 * 2. 常驻检查更新（sidebar.footer.action slot）：定时轮询 status；发现新版本时：
 *    - 在左上角 DeepSeek Harness logo 右上角显示红色「NEW」角标；
 *    - 侧边栏底部「更新」入口亮红点；
 *    - 弹出一次性 toast 提醒（同一版本只提醒一次）。
 * 3. 点击 logo 角标 / 底部入口 → 打开设置窗口并定位到「关于」Tab。
 *
 * 数据来自 host 半的同源路由（/plugins/dsh-updater/status 与 /check）。
 */
window.__ModuleLoader__.load({
	id: "dsh-updater",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");
		const { jsx, jsxs, Fragment } = require("react/jsx-runtime");
		const { BrandWordmark } = require("@deepseek-ai/dsh-client-ui-primitives");

		//#region 样式
		const css = [
			/* 关于 Tab 布局 */
			".dup-about{max-width:720px;color:var(--dsw-alias-label-primary);display:flex;flex-direction:column;gap:16px}",
			".dup-hero{display:flex;align-items:center;justify-content:flex-start}",
			".dup-brand{display:block;color:var(--dsw-alias-label-primary)}",
			".dup-card{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:10px}",
			".dup-row{display:flex;align-items:center;gap:12px}",
			".dup-rowLabel{flex:none;width:88px;font-size:13px;color:var(--dsw-alias-label-secondary)}",
			".dup-rowValue{flex:1;min-width:0;font-size:13px;line-height:20px;display:flex;align-items:center;gap:8px;font-variant-numeric:tabular-nums}",
			".dup-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;background:var(--dsw-alias-bg-module-platform);border-radius:5px;padding:1px 6px}",
			".dup-tag{flex:none;font-size:11px;line-height:16px;border-radius:999px;padding:1px 8px;border:1px solid transparent}",
			".dup-tag-ok{color:var(--dsw-alias-state-success-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 40%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 10%,transparent)}",
			".dup-tag-new{color:var(--dsw-alias-state-warn-label);border-color:color-mix(in srgb,var(--dsw-alias-state-warn-label) 40%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-warn-label) 10%,transparent)}",
			".dup-tag-err{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 40%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent)}",
			".dup-actions{display:flex;flex-wrap:wrap;gap:10px}",
			".dup-btn{box-sizing:border-box;height:36px;font:inherit;cursor:pointer;border:none;border-radius:18px;justify-content:center;align-items:center;gap:6px;padding:0 16px;font-size:14px;line-height:22px;display:inline-flex}",
			".dup-btn:disabled{opacity:.5;cursor:default}",
			".dup-btn-primary{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}",
			".dup-btn-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}",
			".dup-btn-ghost{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);background:transparent}",
			".dup-btn-ghost:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}",
			".dup-link{color:var(--dsw-alias-brand-primary);text-decoration:none;font-size:13px;display:inline-flex;align-items:center;gap:4px}",
			".dup-link:hover{text-decoration:underline}",
			".dup-changelog{white-space:pre-wrap;word-break:break-word;font-size:12px;line-height:20px;color:var(--dsw-alias-label-secondary);max-height:280px;overflow-y:auto;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:12px 14px;background:var(--dsw-alias-bg-module-platform)}",
			".dup-note{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}",
			/* 开关（使用 GitHub 加速） */
			".dup-switch{width:40px;height:22px;border-radius:11px;background:var(--dsw-alias-border-l2);border:none;cursor:pointer;position:relative;transition:background .15s ease;flex:none;padding:0}",
			".dup-switch[aria-checked=true]{background:var(--dsw-alias-button-primary-fill)}",
			".dup-switch:disabled{opacity:.6;cursor:default}",
			".dup-switch-knob{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;transition:transform .15s ease;display:block}",
			".dup-switch[aria-checked=true] .dup-switch-knob{transform:translateX(18px)}",
			/* 升级命令 + 复制按钮 */
			".dup-code-row{display:flex;align-items:center;gap:10px}",
			".dup-code-row .dup-mono{flex:1;min-width:0;padding:8px 12px;overflow-x:auto;white-space:nowrap}",
			/* logo 右上角红色 NEW 角标 */
			".dup-logo-badge{position:fixed;z-index:900;transform:translate(-50%,-50%);background:#f43f5e;color:#fff;font-size:10px;font-weight:700;line-height:1;padding:3px 6px;border-radius:999px;border:2px solid var(--dsw-alias-bg-layer-1);cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.28);letter-spacing:.02em;white-space:nowrap}",
			".dup-logo-badge:hover{background:#e11d48}",
			/* toast */
			".dup-toast{position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:99995;display:flex;align-items:center;gap:8px;max-width:min(480px,calc(100vw - 40px));background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:10px 16px;font-size:13px;line-height:20px;box-shadow:0 12px 40px rgba(0,0,0,.2);animation:dup-toast-in .22s cubic-bezier(.2,.8,.2,1)}",
			".dup-toast-dot{flex:none;width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-state-warn-label)}",
			"@keyframes dup-toast-in{from{opacity:0;transform:translate(-50%,-8px)}to{opacity:1;transform:translate(-50%,0)}}"
		].join("");
		const tagId = "dsh-updater/client.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-updater";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion

		const STATUS_URL = "/plugins/dsh-updater/status";
		const CHECK_URL = "/plugins/dsh-updater/check";
		const CONFIG_URL = "/plugins/dsh-updater/config";
		const REPO_URL = "https://github.com/deepseek-ai/deepseek-harness";
		const RELEASES_URL = REPO_URL + "/releases";
		/** 升级命令：npx 方式启动，重新运行即可拉取最新版。 */
		const UPGRADE_CMD = "npx @deepseek-ai/dsh@latest web";
		/** 客户端常驻轮询间隔：30 分钟。 */
		const POLL_MS = 30 * 60 * 1000;
		/** 已提醒版本 localStorage key。 */
		const NOTIFIED_KEY = "dsh-updater:notified-version";
		/** 「使用 GitHub 加速」开关的 localStorage key。 */
		const PROXY_KEY = "dsh-updater:proxy";
		/** 预览模式：true 时无条件显示 logo NEW 角标（调试用，正式保持 false，仅检测到新版本时显示）。 */
		const PREVIEW_BADGE = false;
		/**
		 * logo 角标的水平位置：相对 logo 宽度的比例（1 = 最右边缘）。
		 * BrandWordmark 里「HARNESS」字眼约占 x 132–178 / 182，居中约 0.85。
		 * 视觉微调改这里即可。
		 */
		const LOGO_BADGE_X_RATIO = 0.85;
		/** changelog 正文最大展示长度（字符）。 */
		const CHANGELOG_LIMIT = 2000;
		/** 「关于」Tab 的 section id（与服务端 / 设置面板导航对应）。 */
		const ABOUT_SECTION_ID = "about";

		function formatTime(iso) {
			if (!iso) return "—";
			const d = new Date(iso);
			if (Number.isNaN(d.getTime())) return "—";
			const p = (n) => String(n).padStart(2, "0");
			return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
		}

		function readNotified() {
			try {
				const v = window.localStorage.getItem(NOTIFIED_KEY);
				return v && v.length > 0 ? v : null;
			} catch {
				return null;
			}
		}
		function writeNotified(version) {
			try {
				window.localStorage.setItem(NOTIFIED_KEY, String(version));
			} catch {}
		}

		function readProxyPref() {
			try {
				const v = window.localStorage.getItem(PROXY_KEY);
				return v === null ? true : v === "1";
			} catch {
				return true;
			}
		}
		function writeProxyPref(value) {
			try {
				window.localStorage.setItem(PROXY_KEY, value ? "1" : "0");
			} catch {}
		}

		function openExternal(url) {
			window.open(url, "_blank", "noopener,noreferrer");
		}

		function fallbackCopy(text) {
			try {
				const ta = document.createElement("textarea");
				ta.value = text;
				ta.style.position = "fixed";
				ta.style.opacity = "0";
				document.body.appendChild(ta);
				ta.focus();
				ta.select();
				const ok = document.execCommand("copy");
				document.body.removeChild(ta);
				return ok;
			} catch {
				return false;
			}
		}
		/** 复制文本到剪贴板，返回 Promise<boolean>。 */
		function copyText(text) {
			if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
				return navigator.clipboard.writeText(text).then(() => true).catch(() => fallbackCopy(text));
			}
			return Promise.resolve(fallbackCopy(text));
		}

		function parseJson(res) {
			return res.text().then((text) => {
				try {
					return JSON.parse(text);
				} catch {
					throw Object.assign(new Error("响应不是 JSON"), { code: "parse" });
				}
			});
		}

		function fetchStatus(force, proxy) {
			if (force) {
				return fetch(CHECK_URL, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ proxy: !!proxy }),
					cache: "no-store"
				}).then((res) => parseJson(res));
			}
			return fetch(STATUS_URL, { method: "GET", cache: "no-store" }).then((res) => parseJson(res));
		}

		function saveProxy(proxy) {
			return fetch(CONFIG_URL, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ proxy: !!proxy }),
				cache: "no-store"
			}).then((res) => parseJson(res));
		}

		/**
		 * 定位左上角 logo 元素（sidebar 顶部的 brand / toggle 按钮）。
		 * 依赖结构：`[data-slot="sidebar"]`（display:contents）→ SidebarRoot 根 div
		 * → logoRow div → 第一个子元素（brand 按钮或折叠态 toggle 按钮）。
		 * @returns logo 元素，找不到返回 null。
		 */
		function findLogoElement() {
			const sidebarSlot = document.querySelector('[data-slot="sidebar"]');
			const root = sidebarSlot && sidebarSlot.firstElementChild;
			const logoRow = root && root.firstElementChild;
			const logo = logoRow && logoRow.firstElementChild;
			return logo instanceof HTMLElement ? logo : null;
		}

		/**
		 * 打开设置窗口并定位到「关于」Tab。
		 * 设置面板的 open/active 状态是 SettingsRoot 的本地 state，无全局 API，
		 * 这里通过 DOM 桥接：先点击 trigger 按钮打开面板，再点击导航里的「关于」项。
		 */
		function openAboutTab() {
			const trigger = document.querySelector('[data-slot="sidebar.settings"] button[aria-haspopup="dialog"]')
				|| document.querySelector('button[aria-haspopup="dialog"]');
			if (trigger && typeof trigger.click === "function") trigger.click();

			const clickAbout = () => {
				const buttons = document.querySelectorAll('[role="dialog"] nav button');
				for (const btn of buttons) {
					if ((btn.textContent || "").indexOf(ABOUT_SECTION_ID) !== -1 || (btn.textContent || "").indexOf("关于") !== -1) {
						btn.click();
						return true;
					}
				}
				return false;
			};
			if (clickAbout()) return;
			let attempts = 0;
			const timer = window.setInterval(() => {
				attempts += 1;
				if (clickAbout() || attempts >= 15) window.clearInterval(timer);
			}, 100);
		}

		/** 顶部居中提示条，4 秒后自动回调 onDone 让父组件卸载。 */
		function Toast({ text, onDone }) {
			React.useEffect(() => {
				const timer = window.setTimeout(onDone, 4000);
				return () => window.clearTimeout(timer);
			}, [onDone]);
			return jsxs("div", {
				className: "dup-toast",
				role: "alert",
				children: [
					jsx("span", { className: "dup-toast-dot", "aria-hidden": true }),
					jsx("span", { children: text })
				]
			});
		}

		/** 「关于」Tab 的版本信息卡片。 */
		function StatusBody({ data, checking, onCheck }) {
			const error = data && data.error ? data.error : null;
			const ready = data && !error;
			const current = data && data.current ? data.current : "unknown";
			const latest = data && data.latest ? data.latest : null;
			const updateAvailable = !!(data && data.updateAvailable);
			const checkedAt = data && data.checkedAt ? data.checkedAt : null;
			const githubError = data && data.githubError ? data.githubError : null;
			const [copied, setCopied] = React.useState(false);

			const onCopy = () => {
				copyText(UPGRADE_CMD).then((ok) => {
					if (ok) {
						setCopied(true);
						window.setTimeout(() => setCopied(false), 2000);
					}
				});
			};

			let statusTag = null;
			if (error) {
				statusTag = jsx("span", { className: "dup-tag dup-tag-err", children: "检查失败" });
			} else if (ready && updateAvailable) {
				statusTag = jsx("span", { className: "dup-tag dup-tag-new", children: "有新版本" });
			} else if (ready) {
				statusTag = jsx("span", { className: "dup-tag dup-tag-ok", children: "已是最新" });
			}

			return jsxs(Fragment, {
				children: [
					jsxs("div", {
						className: "dup-card",
						children: [
							jsxs("div", {
								className: "dup-row",
								children: [
									jsx("span", { className: "dup-rowLabel", children: "当前版本" }),
									jsx("span", {
										className: "dup-rowValue",
										children: jsx("code", { className: "dup-mono", children: current })
									})
								]
							}),
							jsxs("div", {
								className: "dup-row",
								children: [
									jsx("span", { className: "dup-rowLabel", children: "最新版本" }),
									jsx("span", {
										className: "dup-rowValue",
										children: [
											ready ? jsx("code", { className: "dup-mono", children: latest }) : jsx("span", { className: "dup-note", children: "—" }),
											statusTag
										]
									})
								]
							}),
							jsxs("div", {
								className: "dup-row",
								children: [
									jsx("span", { className: "dup-rowLabel", children: "检查时间" }),
									jsx("span", {
										className: "dup-rowValue",
										children: jsx("span", { className: "dup-note", children: formatTime(checkedAt) })
									})
								]
							})
						]
					}),
					error && jsx("p", { className: "dup-note", children: "检查失败：" + error }),
					githubError && jsx("p", { className: "dup-note", children: "更新详情获取失败（GitHub 数据源受限）：" + githubError + "（版本号不受影响）" }),
					jsxs("div", {
						className: "dup-actions",
						children: [
							jsx("button", {
								type: "button",
								className: "dup-btn dup-btn-primary",
								onClick: onCheck,
								disabled: checking,
								children: checking ? "检查中…" : "检查更新"
							}),
							jsx("button", {
								type: "button",
								className: "dup-btn dup-btn-ghost",
								onClick: () => openExternal(RELEASES_URL),
								children: "查看 Release 列表 ↗"
							})
						]
					}),
					updateAvailable && jsxs("div", {
						className: "dup-card",
						children: [
							jsx("span", { className: "dup-rowLabel", children: "升级方式" }),
							jsx("p", { className: "dup-note", children: "停止当前 DSH（Ctrl+C），重新运行下面命令即可升级到最新版：" }),
							jsxs("div", {
								className: "dup-code-row",
								children: [
									jsx("code", { className: "dup-mono", children: UPGRADE_CMD }),
									jsx("button", {
										type: "button",
										className: "dup-btn dup-btn-ghost",
										onClick: onCopy,
										children: copied ? "已复制 ✓" : "复制命令"
									})
								]
							})
						]
					})
				]
			});
		}

		/** 「关于」设置 Tab。 */
		function AboutSection() {
			const [data, setData] = React.useState(null);
			const [checking, setChecking] = React.useState(false);
			const [proxy, setProxy] = React.useState(readProxyPref);
			const [proxySaving, setProxySaving] = React.useState(false);

			const applyResult = React.useCallback((j) => {
				setData(j);
				if (j && typeof j.proxy === "boolean") setProxy(j.proxy);
			}, []);

			const load = React.useCallback((force) => {
				fetchStatus(force)
					.then(applyResult)
					.catch((err) => setData({ error: String(err && err.message ? err.message : err) }));
			}, [applyResult]);

			React.useEffect(() => {
				load(false);
			}, [load]);

			const onCheck = () => {
				setChecking(true);
				fetchStatus(true, proxy)
					.then(applyResult)
					.catch((err) => setData({ error: String(err && err.message ? err.message : err) }))
					.finally(() => setChecking(false));
			};

			const toggleProxy = () => {
				const next = !proxy;
				setProxy(next);
				writeProxyPref(next);
				setProxySaving(true);
				saveProxy(next)
					.catch(() => {})
					.finally(() => setProxySaving(false));
			};

			const updateAvailable = !!(data && data.updateAvailable);
			const body = data && typeof data.body === "string" ? data.body : "";
			const truncated = body.length > CHANGELOG_LIMIT ? body.slice(0, CHANGELOG_LIMIT) + "\n…（已截断，查看完整 Release）" : body;

			return jsxs("div", {
				className: "dup-about",
				children: [
					jsx("div", {
						className: "dup-hero",
						children: jsx(BrandWordmark, { size: 32, className: "dup-brand" })
					}),
					jsx(StatusBody, { data, checking, onCheck }),
					jsxs("div", {
						className: "dup-card",
						children: [
							jsxs("div", {
								className: "dup-row",
								children: [
									jsx("span", { className: "dup-rowLabel", children: "GitHub 加速" }),
									jsx("span", {
										className: "dup-rowValue",
										children: [
											jsx("button", {
												type: "button",
												role: "switch",
												"aria-checked": proxy,
												className: "dup-switch",
												onClick: toggleProxy,
												disabled: proxySaving,
												children: jsx("span", { className: "dup-switch-knob" })
											}),
											jsx("span", {
												className: "dup-note",
												children: proxy ? "已开启：GitHub 数据经第三方镜像/加速获取" : "已关闭：直连 GitHub（网络受限时可能失败）"
											})
										]
									})
								]
							})
						]
					}),
					jsxs("div", {
						className: "dup-card",
						children: [
							jsx("span", { className: "dup-rowLabel", children: "仓库" }),
							jsx("a", {
								className: "dup-link",
								href: REPO_URL,
								target: "_blank",
								rel: "noopener noreferrer",
								children: REPO_URL + " ↗"
							})
						]
					}),
					updateAvailable && body.length > 0 && jsxs("div", {
						className: "dup-card",
						children: [
							jsx("span", { className: "dup-rowLabel", children: "更新内容" }),
							jsx("div", { className: "dup-changelog", children: truncated }),
							jsx("a", {
								className: "dup-link",
								href: data && data.htmlUrl ? data.htmlUrl : RELEASES_URL,
								target: "_blank",
								rel: "noopener noreferrer",
								children: "查看完整 Release 说明 ↗"
							})
						]
					})
				]
			});
		}

		/** 左上角 logo 右上角的红色「NEW」角标（fixed 定位，动态跟随 logo）。 */
		function LogoBadge({ hasUpdate }) {
			const [pos, setPos] = React.useState(null);

			const reposition = React.useCallback(() => {
				const logo = findLogoElement();
				if (!logo) {
					setPos(null);
					return;
				}
				const rect = logo.getBoundingClientRect();
				setPos({
					top: Math.round(rect.top),
					left: Math.round(rect.left + rect.width * LOGO_BADGE_X_RATIO)
				});
			}, []);

			React.useEffect(() => {
				if (!hasUpdate) return undefined;
				reposition();
				window.addEventListener("resize", reposition);
				// 侧边栏折叠/展开不会触发 resize，用低频 interval 兜底跟随。
				const timer = window.setInterval(reposition, 1000);
				return () => {
					window.removeEventListener("resize", reposition);
					window.clearInterval(timer);
				};
			}, [hasUpdate, reposition]);

			if (!hasUpdate || !pos) return null;

			return jsx("button", {
				type: "button",
				className: "dup-logo-badge",
				style: { top: pos.top, left: pos.left },
				onClick: openAboutTab,
				"aria-label": "发现新版本，点击查看详情",
				title: "发现新版本，点击查看详情",
				children: "NEW"
			});
		}

		/** 常驻更新检查：定时轮询 status，发现新版本弹一次性 toast，并在 logo 右上角显示 NEW 角标。 */
		function UpdateWatcher() {
			const [data, setData] = React.useState(null);
			const [toast, setToast] = React.useState(null);
			const mountedRef = React.useRef(true);

			const check = React.useCallback(() => {
				fetchStatus(false)
					.then((j) => {
						if (!mountedRef.current) return;
						setData(j);
						if (j && j.updateAvailable && j.latest) {
							if (readNotified() !== j.latest) {
								writeNotified(j.latest);
								setToast({ id: Date.now(), text: "发现新版本 " + j.latest });
							}
						}
					})
					.catch(() => {
						/* 静默失败：网络抖动不打扰用户 */
					});
			}, []);

			React.useEffect(() => {
				mountedRef.current = true;
				check();
				const timer = window.setInterval(check, POLL_MS);
				return () => {
					mountedRef.current = false;
					window.clearInterval(timer);
				};
			}, [check]);

			const hasUpdate = !!(data && data.updateAvailable);

			// 只渲染 fixed 定位的 logo 角标与 toast，不占用侧边栏底部布局（无可见入口）。
			return jsxs(Fragment, {
				children: [
					jsx(LogoBadge, { hasUpdate: hasUpdate || PREVIEW_BADGE }),
					toast && jsx(Toast, {
						key: toast.id,
						text: toast.text,
						onDone: () => setToast(null)
					})
				]
			});
		}

		const inject = ["slots"];

		function apply(ctx) {
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: ABOUT_SECTION_ID,
				order: 100,
				label: () => "关于"
			}, AboutSection));
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "dsh-updater"
			}, UpdateWatcher));
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
