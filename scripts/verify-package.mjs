import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { unzipSync } from 'fflate';
const manifest=JSON.parse((await readFile('plugin.json','utf8')).replace(/^\uFEFF/,''));
const versioned=await readFile(`dist/${manifest.name}-${manifest.version}.zip`);
assert.deepEqual(await readFile('dist/package.zip'),versioned,'集市附件必须与版本安装包完全一致');
const archive=unzipSync(new Uint8Array(versioned));
const packagedManifest=JSON.parse(new TextDecoder().decode(archive['plugin.json']));
assert.deepEqual(packagedManifest,manifest,'ZIP 内清单必须与仓库清单一致');
assert.equal(manifest.name,new URL(manifest.url).pathname.split('/').at(-1),'集市包名必须与仓库名一致');
for(const name of ['index.js','index.css','plugin.json','README.md','LICENSE','i18n/zh_CN.json','i18n/en_US.json'])assert.ok(archive[name],`安装包缺少 ${name}`);
const dom=new JSDOM('<main></main>');
let tabOptions,topOptions,command,opened;
const events=new Map();
class Plugin {
  name=manifest.name;app={};
  eventBus={on:(name,cb)=>events.set(name,cb),off:(name)=>events.delete(name)};
  addIcons(){} addTab(options){tabOptions=options;} addTopBar(options){topOptions=options;} addCommand(options){command=options;}
}
const module={exports:{}};
const context={module,exports:module.exports,document:dom.window.document,navigator:dom.window.navigator,AbortController:dom.window.AbortController,
  require(name){assert.equal(name,'siyuan');return {Plugin,openTab:async options=>{opened=options;},getActiveEditor:()=>({protyle:{block:{rootID:'20261020123456-abcdefg'}}}),showMessage:message=>{throw new Error(message);}};}};
vm.runInNewContext(new TextDecoder().decode(archive['index.js']),context);
assert.equal(typeof module.exports.default,'function','CommonJS 默认导出必须是插件类');
const plugin=new module.exports.default();plugin.onload();assert.equal(events.size,3);assert.ok(command.callback);
const menuItems=[];events.get('open-menu-doctree')({detail:{type:'doc',elements:[dom.window.document.createElement('li')],menu:{addItem:item=>menuItems.push(item)}}});assert.equal(menuItems.length,0,'没有文档 ID 的元素不显示菜单');
const docItem=dom.window.document.createElement('li');docItem.dataset.nodeId='20261020123456-abcdefg';
events.get('open-menu-doctree')({detail:{type:'doc',elements:[docItem],menu:{addItem:item=>menuItems.push(item)}}});assert.equal(menuItems[0].label,'设为对比原文');
topOptions.callback();assert.equal(opened.custom.id,manifest.name+'document-diff');
const element=dom.window.document.querySelector('main');tabOptions.init.call({element});
element.querySelector('[data-action=current-left]').click();assert.equal(element.querySelector('[data-doc-id=left]').value,'20261020123456-abcdefg');
element.querySelector('[data-action=mode-text]').click();element.querySelector('[data-text=left]').value='旧版本';element.querySelector('[data-text=right]').value='新版本';
element.querySelector('[data-action=compare]').click();await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(element.querySelector('del').textContent,'旧');assert.equal(element.querySelector('ins').textContent,'新');
tabOptions.destroy.call({element});plugin.onunload();assert.equal(events.size,0);dom.window.close();
console.log('安装包结构、CommonJS 加载、顶栏入口、当前文档、文段对比、销毁与卸载验证通过。');
