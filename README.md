# Arena Universal Markdown Export

[English](README.en.md) · [MIT License](LICENSE) · 版本 **2.6.0**

用于 Arena 的 Tampermonkey 用户脚本：将 Direct / Battle 对话导出为 Markdown，并提供可恢复的 Battle 胜者阅读视图。

**[点击安装脚本](https://raw.githubusercontent.com/atmago/arena-universal-export/main/arena-universal-export.user.js)** · [下载发布版本](https://github.com/atmago/arena-universal-export/releases)

## 功能

- **Direct 导出**：按接口返回的顺序导出用户、助手和系统文本，尽可能附带模型名称、来源链接和导出时间。
- **Battle 导出**：逐轮选择保留左侧 A、右侧 B，或两边都保留；所有轮次选择完成后下载 `.md` 文件。
- **胜者阅读视图**：尝试识别投票后的绿色边框或模型标识，隐藏另一侧并展开保留的回答，减少回答内部的嵌套滚动。
- **手动切换与恢复**：右侧中部的「胜者视图 ▸」按钮可展开「自动 / 仅左侧 / 仅右侧 / 双侧显示 / 全部恢复」菜单；点击外部、按 Esc 或执行操作后收起。
- **本地保存偏好**：按对话保存手动视图选择，最多保留 100 个对话的偏好。

胜者阅读视图与导出选择分别控制。切换阅读视图不会替你提交 Arena 投票，也不会修改原始对话。

## 安装

1. 浏览器需安装并启用 Tampermonkey，允许其在目标网站运行用户脚本。
2. 停用或卸载同名旧脚本，避免重复按钮或布局冲突。
3. 点击上方安装链接，在 Tampermonkey 中确认安装；也可以新建脚本并粘贴 `arena-universal-export.user.js` 的完整内容。
4. 刷新 Arena 页面。

脚本匹配以下域名：`arena.ai`、`lmarena.ai`、`canaryarena.ai`。具体可用性取决于网站当前页面结构与接口。

## 使用

1. 登录 Arena，打开已保存的 `/c/<id>` 或 `/chat/<id>` 对话页面。
2. 点击右下角「导出对话」。
3. Direct 对话确认信息后导出；Battle 对话为每轮选择 A、B 或两边都保留，再导出。
4. 阅读 Battle 时，可通过右侧「胜者视图」菜单切换显示方式。手动选项控制当前定位到的最后一轮回答；「全部恢复」恢复当前对话各轮双侧显示。

## 数据与权限

- 使用 `@grant none`，没有远程运行时依赖，也没有分析统计代码。
- 点击导出时，携带当前站点的登录会话请求同源的 `/api/evaluation/<id>`，失败时尝试 `/nextjs-api/evaluation/<id>`。
- Markdown 通过浏览器生成并下载，脚本没有把对话发送到第三方服务的逻辑。
- 手动视图偏好存放在目标站点的 `localStorage` 中（键名 `arena-winner-manual-v24`），目标站点的其他脚本也能访问该存储。
- 导出文件包含对话文本、来源地址及可能的模型信息，分享前请检查其中的私人内容。
- 脚本管理器可通过本仓库的 `@updateURL` / `@downloadURL` 检查与安装后续更新，具体行为由管理器设置决定。

## 限制与排查

- 这是独立的社区脚本，与 Arena 官方没有隶属关系。
- 网站接口、消息格式或 DOM 改动可能导致导出或胜者识别失效；自动识别有误时可改用手动选项或恢复双侧显示。
- 主要导出文本，不下载图片、音频或视频附件，也不保证还原富媒体内容。
- 导出失败时，确认已登录、对话已保存，并刷新页面后重试。
- 提交 Issue 时请附脚本版本、浏览器、脚本管理器、目标域名及脱敏后的错误信息。不要上传 Cookie、令牌或完整私人对话。

## 开发与验证

无需构建或安装 npm 依赖。使用 Node.js 22 或更新版本：

```sh
node --check arena-universal-export.user.js
node --test
```

测试覆盖启动加载、对话识别、消息格式兼容、Battle 分组、Markdown 导出及接口回退。模拟测试不能替代真实网站验证；本次开源整理未在已登录的 Arena 页面进行实测。

修改后可将脚本粘贴到 Tampermonkey 测试。发布新功能时请同步更新脚本头部版本号与 `CHANGELOG.md`。

## 许可证

采用 [MIT License](LICENSE)。欢迎通过 Issue 反馈问题或提交 Pull Request。
