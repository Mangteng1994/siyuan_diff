文档Diff v0.1.1 补齐首次集市上架所需的 MIT 许可证，并将许可证包含在安装包中。插件功能与 v0.1.0 一致。

- 文档对比和复制文段对比。
- 双栏、合并、逐行视图、增删统计与差异跳转。
- 桌面端已由用户实测验收；Android / iOS 暂不支持。

下载 `package.zip`，解压到思源工作空间的 `data/plugins/siyuan_diff/`，在设置中启用「文档Diff」。如果此前安装开发版 `siyuan-document-diff`，请先禁用旧插件，避免重复入口。

验证：24 项自动测试、TypeScript 严格检查、构建和安装包模拟加载通过；黄金摘要覆盖 1922 组参考 diff 规则结果。

集市上架申请：https://github.com/siyuan-note/bazaar/pull/2377
