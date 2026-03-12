# Orm TextTool

移动端优先的文本管理 Web App，用于导入本地 Excel/CSV，并按目录管理文本条目。

## 功能

- Excel / CSV 导入，按行拆分为独立条目
- 目录分类、目录删除、历史恢复
- 复制后自动归入历史记录
- 搜索、排序、分页
- IndexedDB 本地持久化

## 在线部署

仓库已内置 GitHub Pages 工作流。推送到 `master` 后，可通过仓库的 GitHub Actions 自动部署。

预期访问地址：

`https://fufu88088.github.io/ContentTool/`

## 使用说明

- 数据保存在访问者自己的浏览器本地数据库中
- 不同设备、不同浏览器之间的数据不会自动同步
- Excel 解析依赖页面运行时加载的 SheetJS 脚本
