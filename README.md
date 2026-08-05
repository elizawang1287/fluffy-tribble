# 粤读校园

面向小学高年级和初中学生的香港繁体、粤拼与校园粤语学习网站。

## 当前功能

- 简体中文转换为香港繁体并生成粤拼
- 书面语与保守的香港校园口语转换
- 按句拆分长文本并提供粤语朗读
- 校园情景短句、生词本、学习记录和每日任务
- 每日学生短新闻及最近 30 天归档
- 新闻逐句跟读录音、回放、重录和删除（仅保存在当前页面）
- 学习数据仅保存在当前浏览器，不上传用户输入

## 技术架构

- Cloudflare Pages 托管 HTML、CSS、JavaScript 和新闻 JSON
- Pages Functions 提供 `/api/v1/convert`、`/api/v1/news`、`/api/v1/tts` 和 `/health`
- GitHub Actions 每天更新 `data/news/` 并触发 Pages 自动部署
- Google TTS 未启用时，新闻自动使用浏览器的香港粤语声音
- Google TTS 启用后，D1 只保存每月已使用字符数，不保存学生内容

Azure 跟读评分尚未接入；当前基础版录音不会上传服务器。

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

### Google TTS（可选）

代码默认关闭 Google TTS，没有凭证也能正常运行，并自动回退到设备声音。正式启用前：

1. 在 Cloudflare 创建一个 D1 数据库，并在 Pages 项目中绑定为 `TTS_DB`。
2. 对该数据库执行 `migrations/0001_google_tts_usage.sql`。
3. 将 Google 服务账号 JSON 完整内容保存为 Cloudflare Secret `GOOGLE_TTS_SERVICE_ACCOUNT_JSON`，不要写入代码或 GitHub。
4. 添加变量 `GOOGLE_TTS_ENABLED=true`。
5. 添加变量 `GOOGLE_TTS_MONTHLY_CHAR_LIMIT=800000`；代码强制最高为 800,000，也可以填更小的数。

可选变量 `GOOGLE_TTS_VOICE` 用于指定 `yue-HK` 声音，默认是 `yue-HK-Chirp3-HD-Aoede`。接口只朗读仓库中已有的新闻，缓存命中不重复扣减额度；数据库异常或额度用完时会暂停云端朗读并回退到设备声音。

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

### `POST /api/v1/tts`

```json
{
  "newsDate": "2026-08-05",
  "sentenceIndex": 0,
  "speakingRate": 0.92
}
```

`sentenceIndex` 也可以是 `"all"`。成功时返回 MP3；接口不接受任意文本，未配置或达到月限额时前端自动使用设备声音。

### `GET /health`

返回 Cloudflare Pages Functions 的健康状态。

## 安全与隐私

- 发布目录采用文件白名单，源代码、测试、配置和 Git 元数据不会作为静态资源发布
- 响应包含 CSP、`nosniff`、Referrer Policy 和麦克风权限策略
- API 凭证只能放入 Cloudflare Secrets，不能提交到 GitHub
- 当前跟读录音仅使用浏览器内存，单次最长 20 秒，不上传服务器，刷新页面后自动删除
- 将来接入发音评分时，录音也只用于单次评分并在处理后立即删除

## 第三方组件

转换词典随项目保存在 `vendor/`，运行时不依赖 CDN：

- opencc-js 1.4.1
- to-jyutping 3.1.1

许可证文件位于同一目录。
