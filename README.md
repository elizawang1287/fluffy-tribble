# 粤读校园

面向小学高年级和初中学生的香港繁体、粤拼与校园粤语学习网站。

## 当前功能

- 简体中文转换为香港繁体并生成粤拼
- 书面语与保守的香港校园口语转换
- 按句拆分长文本并提供浏览器粤语朗读
- 校园情景短句、生词本、学习记录和每日任务
- 每日学生短新闻及最近 30 天归档
- 学习数据仅保存在当前浏览器，不上传用户输入

## 技术架构

- Cloudflare Pages 托管 HTML、CSS、JavaScript 和新闻 JSON
- Pages Functions 提供 `/api/v1/convert`、`/api/v1/news` 和 `/health`
- GitHub Actions 每天更新 `data/news/` 并触发 Pages 自动部署
- 运行时不需要数据库或第三方 npm 依赖

Google TTS、Azure 跟读评分和持久化免费额度计数尚未接入，将在迁移版体验确认后实施。

## 本地开发

需要 Node.js 22 或更高版本。

```powershell
npm install
npm run dev
```

本地体验地址固定为 <http://127.0.0.1:3001>。

`npm run dev` 使用轻量预览适配器运行同一份 `dist` 和 Functions。需要完全模拟 Cloudflare Workers 运行时时，可使用：

```powershell
npm run dev:cloudflare
```

## 测试

```powershell
npm test
```

测试会先生成 `dist/`，再检查转换、新闻、Cloudflare Functions、安全响应和纯静态发布目录。

## Cloudflare Pages 部署

在 Cloudflare Pages 中连接 GitHub 仓库，并使用以下设置：

- Build command：`npm run build`
- Build output directory：`dist`
- Root directory：项目根目录
- Node.js：22 或更高版本

也可以在已经登录 Wrangler 的电脑上运行：

```powershell
npm run deploy
```

静态资源请求不会调用 Functions。转换和新闻接口会计入 Workers 免费请求额度。

## API

### `POST /api/v1/convert`

```json
{
  "text": "老师说我们明天上课。",
  "expression": "written"
}
```

`expression` 支持 `written` 和 `colloquial`。每次最多 2,000 个 Unicode 字符。

### `GET /api/v1/news`

返回最近 30 天经过规范化的新闻归档。

### `GET /health`

返回 Cloudflare Pages Functions 的健康状态。

## 安全与隐私

- 发布目录采用文件白名单，源代码、测试、配置和 Git 元数据不会作为静态资源发布
- 响应包含 CSP、`nosniff`、Referrer Policy 和麦克风权限策略
- API 凭证以后只能放入 Cloudflare Secrets，不能提交到 GitHub
- 未来的学生录音只用于单次评分，完成后立即删除

## 第三方组件

转换词典随项目保存在 `vendor/`，运行时不依赖 CDN：

- opencc-js 1.4.1
- to-jyutping 3.1.1

许可证文件位于同一目录。
