# 粤读校园

面向小学高年级和初中学生的香港繁体、粤拼与粤语朗读 MVP。

## 功能

- 简体中文转换为香港繁体
- 根据标点自动分句，超长句按软标点切分
- 按词显示粤拼，六个声调使用不同颜色辅助辨认
- 使用设备自带的 `yue-HK` / `zh-HK` 粤语声音逐句朗读
- 复制繁体和粤拼
- API 已预留 `written` 与 `colloquial` 两种表达模式；口语模式当前返回 `501`
- 输入不写入磁盘、不记录历史

## 运行

需要 Node.js 20 或更高版本，不需要安装第三方依赖：

```powershell
npm run dev
```

打开 <http://127.0.0.1:3000>。

如果当前 Windows 沙箱限制父目录读取，可以直接使用：

```powershell
node --preserve-symlinks --preserve-symlinks-main server.mjs
```

## 测试

```powershell
npm test
```

## API

`POST /api/v1/convert`

```json
{
  "text": "老师说我们明天上课。",
  "expression": "written"
}
```

每次最多 2,000 个 Unicode 字符。响应包含香港繁体、分句结果以及按词组织的粤拼 token。

## 免费部署到 Render

项目根目录的 `render.yaml` 已包含免费 Web Service 配置。将仓库推送到 GitHub 后，在 Render 选择 **New → Blueprint**，连接仓库并确认创建即可。平台会执行测试、启动服务并使用 `/health` 检查运行状态。

线上服务会监听平台提供的 `PORT` 和公网容器地址；本地仍然通过 <http://127.0.0.1:3000> 访问。转换接口按来源地址限制为每分钟 30 次请求。

## 发音说明

浏览器只会选择语言标识为 `yue-HK`、`zh-HK` 或名称明确包含粤语/香港的声音；没有找到时不会降级成普通话。请在系统语言或辅助功能设置中安装“粤语（香港）”。

## 第三方组件

转换词典随项目一同放在 `vendor/`，运行时不依赖 CDN：

- opencc-js 1.4.1
- to-jyutping 3.1.1

对应许可证保存在同一目录。
