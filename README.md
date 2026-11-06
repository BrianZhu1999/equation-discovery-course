# 物理规律发现 · 76 篇研习室

[进入课程](https://brianzhu1999.github.io/equation-discovery-course/) · [三维谱图](https://brianzhu1999.github.io/equation-discovery-course/spectrum/)

30 天递进课程、76 张学习卡、301 道自测、代码入口与运行记录和 8 期双人播客脚本。交互谱图围绕六个方法家族及共享研究步骤组织关键论文，连线是课程整理，不代表作者宣称的历史谱系。

## 使用与保存

- 学习笔记、答案、自评、复习时间、复现草稿和进度仅保存在当前浏览器的 localStorage。
- 用首页的“导出记录 / 导入记录”在设备之间迁移。清理浏览器前先备份；没有自动云同步。
- 公网初始记录为空，不包含维护者的个人笔记或本机学习进度。
- 运行记录和学习笔记保存在当前浏览器，可从首页导出 JSON。
- 课程提供 76 篇论文的学习卡和出版页面链接；全文及出版社附件通过 DOI 访问。
- 提供 8 期双人对谈脚本。

## 本地运行

```sh
git clone https://github.com/BrianZhu1999/equation-discovery-course.git
cd equation-discovery-course
python -m http.server 8768 --bind 127.0.0.1
```

打开 http://127.0.0.1:8768/ 。纯静态页面，无服务端依赖、无账户系统、无需 API 密钥；三维视图使用本地 Canvas 透视投影，支持旋转、缩放和节点点击，不依赖外部 CDN。

第一课独立教学实验：`python -m pip install numpy scipy`，然后 `python downloads/lab_sindy.py --out labs/runs/my_run`。该脚本是独立教学实现，作者代码运行另行记录。

## 检查与发布

`node --test tests/public_runtime.test.cjs` 验证记录保存、错误回滚、运行记录及备份导入导出。`python tools/check_site.py` 检查内容数量、站内静态链接和发布文件范围。

GitHub Pages 从 main 分支根目录发布。更新后推送 main 即触发站点构建。`data/course.json` 是公网课程内容快照，`cards/` 为可直接阅读的学习卡，`spectrum/` 为谱图。

课程资料和来源信息按发布版本整理；论文事实请以引用的原文为准。第三方论文与仓库的权利和许可仍归其原作者。该站点并非任何期刊或论文作者的官方课程。
