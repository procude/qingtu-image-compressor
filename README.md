# 轻图 · 在线图片压缩

轻图是一款无需注册、免费使用的中文在线图片压缩工具。支持批量压缩 JPG、PNG 与 WebP 图片，调整质量及输出格式，并直接下载压缩结果。

## 开始使用

```bash
npm install
npm run dev
```

在浏览器打开 Vite 提供的本地地址即可使用。

## 构建与预览

```bash
npm run build
npm run preview
```

## 图片隐私

所有图片均使用浏览器原生 Canvas API 在本机处理，没有图片上传接口，也不需要服务器。支持单张不超过 20 MB、最高 4000 万像素的图片，最多可同时添加 30 张。

支持输出 WebP、JPG 与 PNG。浏览器原生压缩为光栅图像的重新编码；PNG 的质量控制不适用。

## 可选命令

```bash
npm test
```
