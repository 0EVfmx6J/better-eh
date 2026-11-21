# Better EH

Better EH 是一个面向桌面 Tampermonkey 和 iOS Userscripts 的用户脚本，支持 E-Hentai、ExHentai 和 nHentai。

nHentai 适配首页（当前热门、最新上传）、搜索、已登录的收藏夹、标签画廊列表、画廊详情和阅读器。标签按原站分类显示，可以添加到搜索框或直接搜索。浏览历史、稍后阅读和阅读进度保存在当前站点的浏览器存储中。登录、设置和标签目录通过原站页面使用。

## 功能

- 黑白两套主题，偏好使用 localStorage 保存
- SPA 式画廊索引、分类、搜索、详情和阅读器
- 侧栏提供浏览历史和稍后阅读，记录保存在当前站点的浏览器存储中。画廊详情页可从上次阅读的位置继续，也可从头开始
- E-Hentai 和 ExHentai 的画廊标签和「我的标签」支持中文译名，搜索框支持中英文联想
- nHentai 搜索框支持中文译名和原站标签联想，可输入 `artist:`、`language:` 等前缀限定类别
- 首页索引、画廊缩略图和阅读页支持连续追加加载
- 网格 / 列表布局切换
- 阅读器通过纵向滚动连续阅读，并显示当前页码
- iOS 安全区、窄屏布局和 reduced-motion 支持
- 请求串行化、429 / 访问限流提示，以及按站点、列表条件和画廊分组的 Pinia 内存缓存
- 保留浏览器原生惯性滚动与 iOS 回弹，追加内容不重置滚动位置
- Shadow DOM 隔离原站样式
- 用户脚本产物内联 CSS，安装后只有一个主脚本文件
- vite-plugin-monkey 负责元数据、单文件构建和 .meta.js 输出
- Greasy Fork 发布构建保持可读格式，不压缩，并在脚本中保留内嵌依赖来源

发布到 Greasy Fork 时，需要在更新页面将脚本标记为成人内容。

## 开发

阅读记录由 `ReadingLibraryRepository` 提供，界面通过 `read()` 读取记录，通过 `apply(change)` 提交单项或批量变更。用户脚本在 `mount.ts` 注入本地实现，后续接入服务端时可替换该实现。

标签翻译来自 [EhTagTranslation Database](https://github.com/EhTagTranslation/Database) 的贡献者，使用 [CC BY-NC-SA 3.0 CN](https://creativecommons.org/licenses/by-nc-sa/3.0/cn/) 许可。脚本按需加载固定版本的纯文本 JSON，在本地匹配译名和搜索联想。

nHentai 中文词库来自 lgou2w / L2 Studio 发布的 [`@l2studio/nhentai-tags` 0.3.5](https://github.com/l2studio/nhentai-tags)，上游包使用 Apache-2.0，翻译数据参考 [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)。脚本按需下载并缓存固定版本的词库，从纯文本中提取中文译名。词库加载成功后，会在本地没有匹配时使用 nHentai 原站联想。加载失败时可重试，也可直接输入关键词搜索。

```bash
pnpm install
pnpm dev
pnpm lint
pnpm format
pnpm format:check
pnpm typecheck
pnpm build
```

`pnpm run ci` 会依次运行 lint、格式检查、类型检查和构建。

GitHub Release 发布后会运行同一套检查，并把 `better-eh.user.js` 和 `better-eh.meta.js` 上传到该 Release。发版前更新 `apps/userscript/package.json` 的版本，并使用对应的标签，例如版本 `0.1.0` 对应标签 `v0.1.0`。正式版和预发布版都在发布后构建。
如果仓库启用了 GitHub 的不可变发行版（Immutable releases），需在发布草稿前手动附上构建产物。

开发服务器会显示一个本地示例索引。用户脚本根据当前域名选择适配器，解析支持的页面。

构建产物位于 \`apps/userscript/dist/better-eh.user.js\`，元数据文件位于 \`apps/userscript/dist/better-eh.meta.js\`。将 .user.js 文件导入 Tampermonkey 或 Userscripts 即可。

## 目录

- \`packages/core\` 包含页面类型、请求队列、缓存和限流处理
- \`packages/site-eh\` 包含 E-Hentai DOM 解析与站点链接构造
- \`packages/site-nhentai\` 包含 nHentai DOM 解析与站点链接构造
- \`packages/ui\` 包含 Vue 组件、主题和响应式布局
- \`apps/userscript\` 包含 Vite 用户脚本入口和元数据

## 许可

Better EH 自有源码采用 [MIT 许可](LICENSE)。第三方库和词库各自适用其上游许可。
