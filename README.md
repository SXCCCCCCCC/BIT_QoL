# BIT_QoL

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> 北京理工大学（BIT）校园 Web 体验增强脚本集合。
> Quality-of-life userscripts for BIT campus web services.

目前包含：

- **延河课堂 · 课程列表显示过滤** —— 隐藏「大学物理实验」系列课程与任务数为 0 的课程。

![课程列表过滤开关](docs/screenshot.png)

## 延河课堂 · 课程列表显示过滤

### 背景

「大学物理实验」按教学班拆成几十门同名课程，加上其他课程后，「我的课程」列表会膨胀到几十条、多页，很难快速找到想找的课。

### 功能

- 在「搜索」按钮右侧嵌入两个开关：
  - **隐藏物理实验**：隐藏所有以「大学物理实验」开头的课程（同时覆盖 `大学物理实验Ⅰ` 和 `大学物理实验 Ⅱ`）。
  - **隐藏0任务**：隐藏任务数为 0 的课程。
- 开关状态写入 `localStorage`，刷新或重开页面后保持。
- 在数据层过滤并重新分页：「全部课程（N）」「共 N 条」与页码都按过滤后的结果计算，不会出现整页课程被藏空的情况。
- 与站内搜索、课程类型下拉（全部课程 / 我的课程 / 选听课程 / 其他课程）兼容。
- 过滤后的课程卡片仍由站点原生组件渲染，「开始学习」「退选课程」「课后任务」按钮正常可用。

### 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)（Edge / Chrome / Firefox）。
2. 打开 [脚本安装链接](https://raw.githubusercontent.com/SXCCCCCCCC/BIT_QoL/main/yanhekt-course-filter.user.js)，Tampermonkey 会弹出安装页；也可以手动新建脚本后粘贴 `yanhekt-course-filter.user.js` 的内容。
3. 打开 <https://aita.yanhekt.cn/education/>，进入「我的课程」。

> 脚本需要注入课程列表所在的 iframe，请确保 Tampermonkey 的「注入到框架」选项开启（默认开启）。

### 使用

- 默认状态：隐藏物理实验 **开启**，隐藏0任务 **关闭**。
- 两个开关独立生效；同时开启时取并集。
- 需要查看被隐藏的课程时，关闭对应开关即可。
- 修改默认值或要隐藏的课程前缀：编辑脚本顶部的 `DEFAULTS`、`PHYSICS_PREFIX`。

### 工作原理

课程列表位于 `personal` 子页面的 iframe 中，由 Vue 2 + Element UI 渲染。脚本会：

1. 监听 DOM，等待课程列表组件挂载；
2. 通过站点自身的 `account-profile/course` 接口一次拉取全部课程（自动翻页取完）；
3. 按开关过滤后，接管组件实例的 `getCourseList`，按每页 10 条切片回填；
4. 观察列表变化并自校正，避免站点自己的异步响应晚到、把列表覆盖回未过滤状态。

全量列表会做 5 分钟的会话级缓存，并发请求合并为一次：首次加载通常只等站点接口一次（实测约 2–3 秒），5 分钟内再次进入几乎瞬时完成过滤（实测约 0.2 秒），超过 1 分钟的缓存会先展示、再后台刷新。

脚本不修改站点后端，也不向第三方发送任何数据。

### 兼容性

- 2026-11 在 Edge + Tampermonkey 下实测通过（59 门课程）。
- 依赖延河课堂当前的前端结构与同源接口；站点改版后可能需要更新选择器或字段。

### 隐私

- 仅向 `aita.yanhekt.cn` 发起与站点自身一致的请求。
- 不读取或导出 Cookie、账号密码等凭据；同源请求由浏览器自动携带登录态。
- 开关状态只保存在本机 `localStorage`。
- 无遥测、无外部网络请求。

### 贡献

欢迎提交 Issue / PR。请保持脚本无外部依赖、无遥测，并在真实环境中验证后提交。

### AI 使用声明

本项目的代码、调试与文档由 AI 编程助手 **Claude Code（Anthropic Claude）** 辅助完成，维护者负责在真实登录环境中验证、审查与发布。AI 助手仅在维护者提供的已登录浏览器会话中检查页面结构、执行功能测试，未导出、记录或上传任何账号密码、Cookie 或个人信息。AI 生成内容可能存在错误，使用前请自行审阅。

### 作者

[@SXCCCCCCCC](https://github.com/SXCCCCCCCC)

### License

[MIT](LICENSE)
