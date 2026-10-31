// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { DiffPanel } from '../src/panel';
import { SiyuanClient } from '../src/siyuan-client';
const setup=()=>{const root=document.createElement('div');document.body.replaceChildren(root); const client=new SiyuanClient();const panel=new DiffPanel(root,client,()=> '20261020123456-abcdefg');return {root,client,panel};};
const click=(root:HTMLElement,action:string)=>root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!.click();
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
describe('两个功能块和差异审阅',()=>{
  it('文段对比、切换视图、导航、安全渲染',async()=>{
    const {root}=setup();click(root,'mode-text');
    const fields=root.querySelectorAll('textarea');fields[0].value='<img src=x onerror=alert(1)>旧';fields[1].value='<img src=x onerror=alert(1)>新';
    click(root,'compare'); await tick();
    expect(root.querySelector('[data-result]')!.textContent).toContain('新');
    expect(root.querySelector('[data-result] img')).toBeNull();
    expect(root.querySelectorAll('del').length).toBeGreaterThan(0);
    click(root,'view-unified');expect(root.querySelector('[data-result]')!.textContent).toContain('旧');
    click(root,'next');expect(root.querySelector('.dd-current')).not.toBeNull();
  });
  it('交换、清空会清理旧结果',async()=>{
    const {root}=setup();click(root,'mode-text');const fields=root.querySelectorAll('textarea');
    fields[0].value='甲';fields[1].value='乙';click(root,'compare');await tick();
    click(root,'swap');expect(fields[0].value).toBe('乙');expect(fields[1].value).toBe('甲');
    expect(root.querySelector('[data-result]')!.textContent).not.toContain('甲');
    click(root,'clear');expect(fields[0].value).toBe('');
  });
  it('从两个文档读取内容，载入当前文档 ID',async()=>{
    const {root,client}=setup();
    vi.spyOn(client,'readDocument').mockImplementation(async id=>({id,title:id,markdown:id.endsWith('g')?'旧内容':'新内容'}));
    click(root,'current-left');
    const inputs=root.querySelectorAll<HTMLInputElement>('[data-doc-id]');
    expect(inputs[0].value).toBe('20261020123456-abcdefg');inputs[1].value='20261020123456-abcdefh';
    click(root,'compare');await tick();
    expect(client.readDocument).toHaveBeenCalledTimes(2);expect(root.querySelector('del')!.textContent).toBe('旧');
  });
  it('剪贴板权限错误反馈给用户，并允许手动粘贴',async()=>{
    const {root}=setup();click(root,'mode-text');
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{readText:vi.fn().mockRejectedValue(new Error('denied'))}});
    click(root,'paste-left');await tick();expect(root.querySelector('[role=status]')!.textContent).toContain('手动粘贴');
  });
  it('编辑内容后结果失效，防止误读上一次结果',async()=>{
    const {root}=setup();click(root,'mode-text');const fields=root.querySelectorAll('textarea');fields[0].value='甲';
    click(root,'compare');await tick();fields[0].value='乙';fields[0].dispatchEvent(new Event('input',{bubbles:true}));
    expect(root.querySelector('[data-result]')!.textContent).toContain('开始对比');
  });
  it('结果失效后空状态占满结果区，不残留双栏布局',async()=>{
    const {root}=setup();click(root,'mode-text');const fields=root.querySelectorAll('textarea');fields[0].value='甲';
    click(root,'compare');await tick();expect(root.querySelector('.dd-split')).not.toBeNull();
    fields[0].dispatchEvent(new Event('input',{bubbles:true}));
    expect(root.querySelector('.dd-split')).toBeNull();expect(root.querySelector('[data-result]>.dd-empty')).not.toBeNull();
  });
  it('在标题搜索框输入不会清空已有结果',async()=>{
    const {root}=setup();click(root,'mode-text');root.querySelectorAll('textarea')[0].value='甲';click(root,'compare');await tick();
    root.querySelector('[data-search=left]')!.dispatchEvent(new Event('input',{bubbles:true}));
    expect(root.querySelector('[data-result] ins, [data-result] del')).not.toBeNull();
  });
  it('搜索框按 Enter 触发搜索，输入法组字时不触发',async()=>{
    const {root,client}=setup();const search=vi.spyOn(client,'searchDocuments').mockResolvedValue([]);
    const input=root.querySelector<HTMLInputElement>('[data-search=right]')!;input.value='甲';
    input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,isComposing:true}));
    expect(search).not.toHaveBeenCalled();
    input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await tick();
    expect(search).toHaveBeenCalledWith('甲');
  });
  it('选中搜索结果后持续显示标题，改动来源时不残留旧标题',async()=>{
    const {root,client}=setup();
    vi.spyOn(client,'searchDocuments').mockResolvedValue([{id:'20261020123456-abcdefh',title:'工作/周报'}]);
    const shown=(side:string)=>root.querySelector<HTMLElement>(`[data-selected=${side}]`)!;
    click(root,'search-left');await tick();root.querySelector<HTMLButtonElement>('[data-choices=left] button')!.click();
    expect(shown('left').textContent).toContain('工作/周报');expect(shown('left').hidden).toBe(false);
    click(root,'swap');expect(shown('left').hidden).toBe(true);expect(shown('right').textContent).toContain('工作/周报');
    const input=root.querySelector<HTMLInputElement>('[data-doc-id=right]')!;
    input.dispatchEvent(new Event('input',{bubbles:true}));expect(shown('right').hidden).toBe(true);
    click(root,'search-left');await tick();root.querySelector<HTMLButtonElement>('[data-choices=left] button')!.click();
    click(root,'current-left');expect(shown('left').hidden).toBe(true);
    click(root,'search-left');await tick();root.querySelector<HTMLButtonElement>('[data-choices=left] button')!.click();
    click(root,'clear');expect(shown('left').hidden).toBe(true);
  });
  it('双栏按行成对渲染，新增行左侧留空保持对齐',async()=>{
    const {root}=setup();click(root,'mode-text');const fields=root.querySelectorAll('textarea');
    fields[0].value='甲\n乙';fields[1].value='甲\n新增\n乙';click(root,'compare');await tick();
    const cells=[...root.querySelectorAll('.dd-cell')].map(c=>c.textContent);
    expect(cells).toEqual(['甲','甲','','新增','乙','乙']);
  });
  it('部分区块过大时在状态栏说明按整块标记',async()=>{
    const {root}=setup();click(root,'mode-text');const fields=root.querySelectorAll('textarea');
    fields[0].value='甲'.repeat(4000);fields[1].value='乙'.repeat(4000);click(root,'compare');await tick();
    expect(root.querySelector('[role=status]')!.textContent).toContain('整块');
  });
  it('销毁面板时异步读取结果不能继续修改界面',async()=>{
    const {root,client,panel}=setup();let resolve!:(v:{id:string,title:string,markdown:string})=>void;
    vi.spyOn(client,'readDocument').mockReturnValue(new Promise(r=>resolve=r));
    root.querySelectorAll<HTMLInputElement>('[data-doc-id]').forEach(x=>x.value='20261020123456-abcdefg');
    click(root,'compare');panel.destroy();const previous=root.innerHTML;resolve({id:'x',title:'x',markdown:'已销毁'});await tick();
    expect(root.innerHTML).toBe(previous);
  });
});
