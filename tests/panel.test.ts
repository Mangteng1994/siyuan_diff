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
  it('从右键菜单发起时切回文档模式、填入来源并开始对比',async()=>{
    const {root,client,panel}=setup();click(root,'mode-text');
    vi.spyOn(client,'readDocument').mockImplementation(async id=>({id,title:id,markdown:id==='20261020123456-abcdefg'?'旧':'新'}));
    panel.compareDocuments({id:'20261020123456-abcdefg',title:'甲'},{id:'20261020123456-abcdefh',title:'乙'});await tick();
    expect(root.querySelector<HTMLElement>('[data-document-source]')!.hidden).toBe(false);
    expect(root.querySelector('[data-action=mode-document]')!.getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelector('[data-selected=right]')!.textContent).toContain('乙');
    expect(root.querySelector('del')!.textContent).toBe('旧');
  });
  const longText=(changed:string)=>Array.from({length:30},(_,i)=>i===15?changed:`第${i}行`).join('\n');
  const compareLong=async(root:HTMLElement)=>{
    click(root,'mode-text');const fields=root.querySelectorAll('textarea');
    fields[0].value=longText('旧');fields[1].value=longText('新');click(root,'compare');await tick();
  };
  it('默认折叠未变更内容，点击后就地展开',async()=>{
    const {root}=setup();await compareLong(root);
    const result=root.querySelector('[data-result]')!;
    expect(result.textContent).not.toContain('第0行');expect(result.textContent).toContain('第12行');
    const bars=root.querySelectorAll<HTMLButtonElement>('.dd-fold');
    expect(bars).toHaveLength(2);expect(bars[0].textContent).toContain('12');
    bars[0].click();
    expect(result.textContent).toContain('第0行');expect(root.querySelectorAll('.dd-fold')).toHaveLength(1);
    expect(root.querySelectorAll('.dd-cell')).toHaveLength(2*(12+7));
  });
  it('可关闭折叠，切换视图时保持设置',async()=>{
    const {root}=setup();await compareLong(root);
    click(root,'toggle-fold');
    expect(root.querySelector('[data-action=toggle-fold]')!.getAttribute('aria-pressed')).toBe('false');
    expect(root.querySelectorAll('.dd-fold')).toHaveLength(0);expect(root.querySelector('[data-result]')!.textContent).toContain('第0行');
    click(root,'view-lines');expect(root.querySelectorAll('.dd-fold')).toHaveLength(0);
    click(root,'toggle-fold');expect(root.querySelectorAll('.dd-fold')).toHaveLength(2);
  });
  it('三种视图都能折叠，逐行视图的行号不受影响',async()=>{
    const {root}=setup();await compareLong(root);
    click(root,'view-unified');expect(root.querySelectorAll('.dd-fold')).toHaveLength(2);
    click(root,'view-lines');expect(root.querySelectorAll('.dd-fold')).toHaveLength(2);
    expect(root.querySelector('.dd-line .dd-line-number')!.textContent).toContain('13 │ 13');
  });
  it('连续改动算作一处，一次跳转选中整处',async()=>{
    const {root}=setup();click(root,'mode-text');const fields=root.querySelectorAll('textarea');
    fields[0].value='甲\n旧一\n旧二\n丙\n旧三';fields[1].value='甲\n新一\n新二\n新加\n丙\n新三';click(root,'compare');await tick();
    expect(root.querySelector('[role=status]')!.textContent).toContain('2 处改动');
    click(root,'next');expect(root.querySelector('[role=status]')!.textContent).toContain('1 / 2');
    expect(root.querySelectorAll('.dd-current').length).toBeGreaterThan(1);
    click(root,'view-lines');click(root,'next');
    expect(root.querySelector('[role=status]')!.textContent).toContain('1 / 2');
    expect(root.querySelectorAll('.dd-current')).toHaveLength(5);
  });
  const historySetup=()=>{
    const context=setup();
    vi.spyOn(context.client,'listHistory').mockResolvedValue([{path:'/h1',label:'昨天 · 更新'},{path:'/h2',label:'前天 · 同步'}]);
    vi.spyOn(context.client,'readHistory').mockResolvedValue({original:'旧',current:'新'});
    return context;
  };
  it('历史版本页签：选文档、列版本、点击后自动对比',async()=>{
    const {root,client,panel}=historySetup();
    panel.showHistory({id:'20261020123456-abcdefg',title:'周报'});await tick();
    expect(root.querySelector('[data-action=mode-history]')!.getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelector<HTMLElement>('[data-history-source]')!.hidden).toBe(false);
    expect(root.querySelectorAll<HTMLElement>('[data-document-source]')[0].hidden).toBe(true);
    expect(root.querySelectorAll<HTMLElement>('[data-document-source]')[1].hidden).toBe(false);
    expect(root.querySelector('[data-source-title=left]')!.textContent).toBe('历史版本');
    const buttons=root.querySelectorAll<HTMLButtonElement>('[data-history-list] button');expect(buttons).toHaveLength(2);
    buttons[1].click();await tick();
    expect(client.readHistory).toHaveBeenCalledWith('/h2','20261020123456-abcdefg');
    expect(root.querySelector('del')!.textContent).toBe('旧');expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelector('[role=status]')!.textContent).toContain('前天 · 同步');
  });
  it('未选版本不能对比，也不支持交换',async()=>{
    const {root}=historySetup();click(root,'mode-history');
    click(root,'compare');await tick();expect(root.querySelector('[role=status]')!.textContent).toContain('历史版本');
    click(root,'swap');await tick();expect(root.querySelector('[role=status]')!.textContent).toContain('交换');
  });
  it('换了文档后清掉旧的历史列表和选择',async()=>{
    const {root,client,panel}=historySetup();
    panel.showHistory({id:'20261020123456-abcdefg',title:'周报'});await tick();
    root.querySelector<HTMLButtonElement>('[data-history-list] button')!.click();await tick();
    const input=root.querySelector<HTMLInputElement>('[data-doc-id=right]')!;input.value='20261020123456-abcdefh';
    input.dispatchEvent(new Event('input',{bubbles:true}));
    expect(root.querySelectorAll('[data-history-list] button')).toHaveLength(0);
    click(root,'compare');await tick();expect(client.readHistory).toHaveBeenCalledTimes(1);
  });
  it('使用当前文档时自动加载历史，没有历史时明确提示',async()=>{
    const {root,client}=historySetup();vi.mocked(client.listHistory).mockResolvedValue([]);
    click(root,'mode-history');click(root,'current-right');await tick();
    expect(client.listHistory).toHaveBeenCalledWith('20261020123456-abcdefg');
    expect(root.querySelector('[role=status]')!.textContent).toContain('没有历史版本');
  });
  it('刷新重新读取文档，没有结果时提示',async()=>{
    const {root,client}=setup();click(root,'refresh');await tick();
    expect(root.querySelector('[role=status]')!.textContent).toContain('请先完成对比');
    const read=vi.spyOn(client,'readDocument').mockImplementation(async id=>({id,title:id,markdown:'甲'}));
    root.querySelectorAll<HTMLInputElement>('[data-doc-id]').forEach(x=>x.value='20261020123456-abcdefg');
    click(root,'compare');await tick();click(root,'refresh');await tick();
    expect(read).toHaveBeenCalledTimes(4);
  });
  it('打开源文档只用已填写的文档 ID，按来源显示按钮',()=>{
    const root=document.createElement('div');const open=vi.fn();
    new DiffPanel(root,new SiyuanClient(),()=>undefined,open);
    root.querySelector<HTMLInputElement>('[data-doc-id=left]')!.value='siyuan://blocks/20261020123456-abcdefg';
    click(root,'open-left');expect(open).toHaveBeenCalledWith('20261020123456-abcdefg');
    click(root,'open-right');expect(open).toHaveBeenCalledTimes(1);
    expect(root.querySelector('[role=status]')!.textContent).toContain('文档');
    const button=(side:string)=>root.querySelector<HTMLElement>(`[data-action=open-${side}]`)!;
    click(root,'mode-text');expect(button('left').hidden).toBe(true);expect(button('right').hidden).toBe(true);
    click(root,'mode-history');expect(button('left').hidden).toBe(true);expect(button('right').hidden).toBe(false);
    expect(button('right').textContent).toContain('当前文档');
  });
  it('导出差异报告为 Markdown 文件，没有结果时提示',async()=>{
    const {root}=setup();const clicked=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
    const blobs:Blob[]=[];vi.stubGlobal('URL',Object.assign(URL,{createObjectURL:(b:Blob)=>{blobs.push(b);return 'blob:x';},revokeObjectURL:vi.fn()}));
    click(root,'export-report');await tick();expect(root.querySelector('[role=status]')!.textContent).toContain('请先完成对比');
    click(root,'mode-text');const fields=root.querySelectorAll('textarea');fields[0].value='旧';fields[1].value='新';click(root,'compare');await tick();
    click(root,'export-report');await tick();
    expect(clicked).toHaveBeenCalledTimes(1);expect(blobs).toHaveLength(1);expect(blobs[0].type).toContain('markdown');
    expect((clicked.mock.contexts[0] as HTMLAnchorElement).download).toMatch(/^文档差异-\d{8}-\d{6}\.md$/);
    expect(root.querySelector('[role=status]')!.textContent).toContain('已导出');
    vi.unstubAllGlobals();clicked.mockRestore();
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
