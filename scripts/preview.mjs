import {build} from 'esbuild';
import {writeFile,readFile} from 'node:fs/promises';
import {workerDefine} from './worker-define.mjs';
const manifest=JSON.parse((await readFile('plugin.json','utf8')).replace(/^\uFEFF/,''));
const a='## 项目计划\n\n我们计划在周三发布第一版。\n重点：文档对比、复制文段对比。';
const b='## 项目计划\n\n我们计划在周五发布第一版。\n重点：文档对比、复制文段对比，以及差异导航。';
await build({stdin:{contents:`import {DiffPanel} from './src/panel';new DiffPanel(document.querySelector('main'));document.querySelector('[data-action=mode-text]').click();document.querySelector('[data-text=left]').value=${JSON.stringify(a)};document.querySelector('[data-text=right]').value=${JSON.stringify(b)};document.querySelector('[data-action=compare]').click();`,resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'iife',outfile:'dist/preview.js',define:await workerDefine()});
await writeFile('dist/preview.html',`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>文档Diff 界面预览</title><link rel="stylesheet" href="${manifest.name}/index.css"><style>html,body,main{height:100%;margin:0}</style><main></main><script src="preview.js"></script></html>`);
console.log('已生成 dist/preview.html，可直接在浏览器打开；文档接口需要在思源内使用。');
