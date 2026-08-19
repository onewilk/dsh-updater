# dsh-updater

[![dsh-plugin](https://img.shields.io/badge/dsh--plugin-DeepSeek%20Harness-3772ff)](https://github.com/topics/dsh-plugin)

> DeepSeek Harness 更新检查插件：定时检查新版本，在左上角 logo 右上角显示红色 `NEW` 角标提醒，并在设置中提供「关于」Tab。

[English](#english) · 中文

## 功能特性

- **定时检查更新**：服务端每 6 小时自动检查，客户端每 30 分钟轮询；版本号以 npm registry 为主源（`dist-tags.latest`），changelog 通过第三方镜像获取。
- **logo `NEW` 角标**：检测到新版本时，在左上角 DeepSeek Harness logo 右上角显示红色 `NEW` 角标，点击直接打开设置窗口并定位到「关于」Tab。
- **一次性提醒**：同一新版本只弹一次 toast 提醒，不重复打扰。
- **「关于」设置 Tab**：展示 logo、当前版本 / 最新版本、最近检查时间、手动检查入口、仓库链接，以及新版本的 changelog。
- **GitHub 加速开关**：内置 `ungh.cc` 镜像（首选）与 `gh-proxy` 拼接（兜底），解决直连 `api.github.com` 被墙 / rate limit（403）导致 changelog 拿不到的问题；开关持久化，默认开启。
- **升级指引**：有新版本时在「关于」Tab 显示升级命令（`npx @deepseek-ai/dsh@latest web`）并提供一键复制。

## 数据源与网络

| 数据源 | 用途 | 说明 |
|--------|------|------|
| `registry.npmjs.org` | 最新版本号（主源） | 直连可达，作为 `updateAvailable` 的判定依据 |
| `ungh.cc` | changelog（首选镜像） | unjs 维护的 GitHub 数据镜像，直连可达、自带缓存、不受 GitHub API rate limit 限制 |
| `gh-proxy.com` | changelog（加速兜底） | ghproxy 类拼接，受 GitHub rate limit 影响，仅作后备 |
| `api.github.com` | changelog（直连兜底） | 多数网络下被墙或 rate limit，最后才尝试 |

每个请求带 8 秒超时，npm 与 GitHub 并行请求，保证「检查更新」总能在有限时间内返回（不会一直「检查中」）。changelog 获取失败不影响版本号检查，会在「关于」Tab 明确提示失败原因。

## 安装

### 通过 `dsh plugin`（推荐）

```bash
# 从 npm 安装
dsh plugin --profile web add dsh-updater

# 或从 GitHub 安装
dsh plugin --profile web add github:onewilk/dsh-updater
```

安装后，插件的 `dsh.bundle` 声明会让它自动加入 profile 的 bundles 层（host 半自动加载），`dsh.client` 声明让客户端半自动注入。

### 手动安装（开发 / 本地）

```bash
# 1. 链接到 web profile 的 node_modules
ln -sfn "$PWD" "$DSH_HOME/profiles/web/node_modules/dsh-updater"

# 2. 在 $DSH_HOME/profiles/web/cordis.patch.yml 中插入 host 插件
#    若使用 bundle 方式（dsh plugin add）则此步可省略
- insert:
    - id: dsh-updater
      name: 'dsh-updater'
```

安装或改动后需重启 harness（重新运行 `npx @deepseek-ai/dsh@latest web`）生效。

## 配置

「关于」Tab 内提供 **「GitHub 加速」开关**：

- 开启（默认）：GitHub changelog 走 `ungh.cc 镜像 → gh-proxy 拼接 → 直连` 顺序兜底；
- 关闭：仅直连 `api.github.com`。

开关持久化到 `$DSH_HOME/profiles/web/dsh-updater.json`（`{ "proxy": true|false }`），客户端同步到 localStorage，重启后保留。

## 插件标识（便于 DSH 收录）

`package.json` 通过 `dsh` 字段声明自身为 DSH 插件：

```json
"dsh": {
  "bundle": { "patch": "./cordis.patch.yml" },
  "client": {
    "inject": ["@deepseek-ai/dsh-client-runtime"],
    "platform": "web"
  }
}
```

> 本仓库已在 GitHub 添加官方推荐的 [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic，用于插件被发现 / 收录。

- `dsh.bundle.patch`：host 半（`lib/index.js`，注册 `/plugins/dsh-updater/*` 路由）通过 `cordis.patch.yml` 的 `insert` 自动加载，`dsh plugin add` 安装后自动加入 bundles 层。
- `dsh.client`：client 半（`lib/client.js`，关于 Tab / NEW 角标 / toast）由 DSH 客户端模块系统按 `platform` 与 `inject` 自动发现并注入。

## 目录结构

```
.
├── lib/
│   ├── index.js    # host 半：路由、定时检查、版本对比、多源兜底
│   └── client.js   # client 半：关于 Tab、NEW 角标、toast、加速开关
├── cordis.patch.yml  # bundle patch：加载 host 插件
└── package.json      # dsh.bundle + dsh.client 插件标识
```

## 开发

```bash
node --check lib/index.js   # 语法检查 host 半
node --check lib/client.js  # 语法检查 client 半
```

## License

[MIT](LICENSE)

---

## English

A DeepSeek Harness plugin that periodically checks for new releases, shows a red `NEW` badge on the top-left logo, and adds an "About" tab in Settings with version info, manual check, a GitHub acceleration toggle, and upgrade instructions.

- **Host half** (`lib/index.js`): registers `/plugins/dsh-updater/status|check|config` routes, runs the scheduled check (npm registry as the version source, `ungh.cc` mirror / `gh-proxy` as changelog fallbacks), and persists the acceleration toggle.
- **Client half** (`lib/client.js`): the "About" settings tab, the fixed `NEW` logo badge (click → open Settings → About), and the one-shot toast.

Install:

```bash
dsh plugin --profile web add dsh-updater
# or
dsh plugin --profile web add github:onewilk/dsh-updater
```

Then restart the harness.
