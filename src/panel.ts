import type { Comparison, Segment } from './diff';
import { startCompare, type CompareTask } from './diff-runner';
import { SiyuanClient } from './siyuan-client';

type Side = 'left' | 'right';
/** 面板状态仅驻留内存，不保存笔记或剪贴板内容。 */
export class DiffPanel {
  private mode: 'document' | 'text' = 'document';
  private view: 'split' | 'unified' = 'split';
  private result?: Comparison;
  private task?: CompareTask;
  private generation = 0;
  private disposed = false;
  private activeChange = -1;
  private abort = new AbortController();
  private searchGeneration = {left:0,right:0};
  private selectedTitles = {left:'',right:''};
  constructor(private root:HTMLElement,private client=new SiyuanClient(),private currentDocument:()=>string|undefined=()=>undefined) {
    root.classList.add('document-diff');
    root.innerHTML=`
      <header class="dd-header"><div><h2>文档 Diff</h2><p>逐字看清每一次修改</p></div><span class="dd-local">只读 · 本地对比</span></header>
      <nav class="dd-modes" aria-label="对比来源"><button data-action="mode-document" aria-pressed="true">文档对比</button><button data-action="mode-text" aria-pressed="false">复制文段对比</button></nav>
      <section class="dd-inputs" aria-label="对比内容">
        ${(['left','right'] as Side[]).map((side,index)=>`<div class="dd-source"><div class="dd-source-title"><strong>${index?'修改后':'原文'}</strong><span>${index?'B':'A'}</span></div>
          <div data-document-source><label>文档 ID 或链接<input data-doc-id="${side}" placeholder="粘贴思源文档链接或 ID" autocomplete="off"></label>
          <div class="dd-source-actions"><span data-selected="${side}" class="dd-selected" hidden></span><button data-action="current-${side}">使用当前文档</button></div>
          <div class="dd-search"><label>按标题搜索<input data-search="${side}" placeholder="输入标题关键词" autocomplete="off"></label><button data-action="search-${side}">搜索</button></div>
          <div data-choices="${side}" class="dd-choices" aria-live="polite"></div></div>
          <div data-text-source hidden><div class="dd-source-actions"><button data-action="paste-${side}">读取剪贴板</button></div><label class="dd-sr">${index?'修改后文段':'原文文段'}</label><textarea data-text="${side}" aria-label="${index?'修改后文段':'原文文段'}" placeholder="在此粘贴${index?'修改后':'原文'}文段…" spellcheck="false"></textarea></div>
        </div>`).join('')}
      </section>
      <div class="dd-actions"><button class="dd-primary" data-action="compare">开始对比</button><button data-action="swap">交换左右</button><button data-action="clear">清空</button><span class="dd-hint">Ctrl / ⌘ + Enter 开始对比</span></div>
      <div class="dd-status" role="status" aria-live="polite">选择两篇文档，或切换到复制文段对比。</div>
      <section class="dd-review" aria-label="差异结果"><div class="dd-review-tools"><div class="dd-view"><button data-action="view-split" aria-pressed="true">双栏</button><button data-action="view-unified" aria-pressed="false">合并</button><button data-action="view-lines" aria-pressed="false">逐行</button></div><div><button data-action="previous" aria-label="上一处差异">↑ 上一处</button><button data-action="next" aria-label="下一处差异">↓ 下一处</button><button data-action="copy-result">复制差异</button></div></div>
      <div data-result class="dd-result"><div class="dd-empty">准备好两个版本后，点击「开始对比」。</div></div></section>`;
    const opts={signal:this.abort.signal};
    root.addEventListener('click',e=>{
      const button=(e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
      if(button && !button.disabled) void this.action(button.dataset.action!);
    },opts);
    root.addEventListener('input',e=>{
      const target=e.target as HTMLElement;
      if(target.matches('[data-search]'))return;
      if(target.dataset.docId)this.select(target.dataset.docId as Side);
      this.invalidate();
    },opts);
    root.addEventListener('keydown',e=>{
      if((e.ctrlKey || e.metaKey) && e.key==='Enter') {e.preventDefault();void this.action('compare');return;}
      const target=e.target as HTMLElement;
      if(e.key==='Enter' && !e.isComposing && target.matches('[data-search]')) {e.preventDefault();void this.action(`search-${target.dataset.search}`);}
    },opts);
  }
  private el<T extends HTMLElement=HTMLElement>(selector:string):T {return this.root.querySelector<T>(selector)!;}
  private text(side:Side) {return this.el<HTMLTextAreaElement>(`[data-text="${side}"]`);}
  private id(side:Side) {return this.el<HTMLInputElement>(`[data-doc-id="${side}"]`);}
  private status(message:string) {if(!this.disposed)this.el('[role=status]').textContent=message;}
  private select(side:Side,title='') {
    this.selectedTitles[side]=title;
    const label=this.el(`[data-selected="${side}"]`);
    label.textContent=title?`已选择：${title}`:'';label.hidden=!title;
  }
  private invalidate() {
    this.generation++;this.task?.cancel();this.result=undefined;this.activeChange=-1;
    this.el<HTMLButtonElement>('[data-action=compare]').disabled=false;
    this.el('[data-result]').replaceChildren(Object.assign(document.createElement('div'),{className:'dd-empty',textContent:'内容已就绪，点击「开始对比」。'}));
    this.status('等待对比。');
  }
  compareDocuments(left:{id:string;title:string},right:{id:string;title:string}) {
    void this.action('mode-document');
    this.id('left').value=left.id;this.select('left',left.title);
    this.id('right').value=right.id;this.select('right',right.title);
    this.invalidate();void this.action('compare');
  }
  private async action(action:string) {
    try {
      if(action.startsWith('mode-')) {
        this.mode=action==='mode-text'?'text':'document';this.invalidate();
        this.root.querySelectorAll<HTMLElement>('[data-document-source]').forEach(e=>e.hidden=this.mode!=='document');
        this.root.querySelectorAll<HTMLElement>('[data-text-source]').forEach(e=>e.hidden=this.mode!=='text');
        this.setPressed('mode-',action);return;
      }
      if(action==='compare') {await this.run();return;}
      if(action.startsWith('current-')) {
        const id=this.currentDocument();if(!id)throw new Error('请先打开一篇思源文档，再使用当前文档。');
        const side=action.endsWith('left')?'left':'right';
        this.id(side).value=id;this.select(side);this.invalidate();return;
      }
      if(action.startsWith('search-')) {await this.search(action.endsWith('left')?'left':'right');return;}
      if(action.startsWith('paste-')) {
        const side=action.endsWith('left')?'left':'right';
        const stamp=this.generation;
        let text:string;
        try {text=await navigator.clipboard.readText();}catch {throw new Error('无法读取剪贴板，请在输入框内手动粘贴（Ctrl / ⌘ + V）。');}
        if(!this.disposed && stamp===this.generation){this.text(side).value=text;this.invalidate();}return;
      }
      if(action==='swap') {
        for(const getter of [(s:Side)=>this.text(s),(s:Side)=>this.id(s)]) {
          const left=getter('left'),right=getter('right');[left.value,right.value]=[right.value,left.value];
        }
        const {left,right}=this.selectedTitles;this.select('left',right);this.select('right',left);
        this.invalidate();return;
      }
      if(action==='clear') {
        this.root.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('input,textarea').forEach(e=>e.value='');
        this.root.querySelectorAll('[data-choices]').forEach(e=>e.replaceChildren());
        this.select('left');this.select('right');
        this.searchGeneration.left++;this.searchGeneration.right++;this.invalidate();return;
      }
      if(action.startsWith('view-')) {
        this.view=action==='view-unified'?'unified':'split';
        this.setPressed('view-',action);this.render(action==='view-lines');return;
      }
      if(action==='next' || action==='previous') {this.navigate(action==='next'?1:-1);return;}
      if(action==='copy-result') {
        if(!this.result)throw new Error('请先完成对比。');
        const output=this.result.lines.map(s=>`${s.op==='add'?'+':s.op==='remove'?'-':' '} ${s.text}`).join('\n');
        try{await navigator.clipboard.writeText(output);}catch{throw new Error('无法写入剪贴板，请选择结果手动复制。');}
        this.status('差异已复制。');
      }
    } catch(error) {this.status(error instanceof Error?error.message:String(error));}
  }
  private setPressed(prefix:string,current:string) {
    this.root.querySelectorAll<HTMLButtonElement>(`button[data-action^="${prefix}"]`).forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.action===current)));
  }
  private async search(side:Side) {
    const input=this.el<HTMLInputElement>(`[data-search="${side}"]`);
    const stamp=++this.searchGeneration[side];
    this.status('正在搜索文档…');
    try {
      const list=await this.client.searchDocuments(input.value);
      if(this.disposed || stamp!==this.searchGeneration[side])return;
      const choices=this.el(`[data-choices="${side}"]`);choices.replaceChildren();
      for(const doc of list) {
        const button=document.createElement('button');button.textContent=doc.title;button.title=doc.id;
        button.addEventListener('click',()=>{this.id(side).value=doc.id;this.select(side,doc.title);choices.replaceChildren();this.invalidate();this.status(`已选择：${doc.title}`);},{signal:this.abort.signal});
        choices.append(button);
      }
      this.status(list.length?`找到 ${list.length} 篇文档，点击标题选择（最多显示 50 篇）。`:'没有找到文档，请调整关键词。');
    }catch(error){if(!this.disposed && stamp===this.searchGeneration[side])this.status(error instanceof Error?error.message:String(error));}
  }
  private async run() {
    const stamp=++this.generation;
    this.task?.cancel();
    this.result=undefined;this.el('[data-result]').replaceChildren();
    this.el<HTMLButtonElement>('[data-action=compare]').disabled=true;this.status('正在读取并对比…');
    try {
      let a=this.text('left').value,b=this.text('right').value;
      let titles=['原文','修改后'];
      if(this.mode==='document') {
        const docs=await Promise.all([this.client.readDocument(this.id('left').value),this.client.readDocument(this.id('right').value)]);
        [a,b]=docs.map(d=>d.markdown);titles=docs.map(d=>d.title);
      }
      if(this.disposed || stamp!==this.generation)return;
      this.task=startCompare(a,b);
      const result=await this.task.result;
      if(this.disposed || stamp!==this.generation)return;
      this.result=result;this.activeChange=-1;
      const coarse=this.result.coarse?`　其中 ${this.result.coarse} 个区块改动过大，已按整块标记`:'';
      this.status(this.result.changed?`${titles[0]} → ${titles[1]}　新增 ${this.result.added} 字符 · 删除 ${this.result.removed} 字符${coarse}`:'两个版本完全一致（已统一 CRLF / LF 换行）。');
      this.render(this.el('[data-action=view-lines]').getAttribute('aria-pressed')==='true');
    } catch(error) {
      if(!this.disposed && stamp===this.generation)this.status(error instanceof Error?error.message:String(error));
    }finally{if(!this.disposed && stamp===this.generation)this.el<HTMLButtonElement>('[data-action=compare]').disabled=false;}
  }
  private render(lines=false) {
    if(!this.result)return;
    const container=this.el('[data-result]');container.replaceChildren();
    const append=(target:HTMLElement,segment:Segment,index:number)=>{
      const node=document.createElement(segment.op==='add'?'ins':segment.op==='remove'?'del':'span');
      node.textContent=segment.text;
      if(segment.op!=='equal') {node.dataset.change=String(index);node.title=segment.op==='add'?'新增':'删除';}
      target.append(node);
    };
    if(lines) {
      const list=document.createElement('div');list.className='dd-lines';
      let left=0,right=0;
      this.result.lines.forEach((s,index)=>{
        const row=document.createElement('div');row.className=`dd-line dd-line-${s.op}`;
        const numbers=document.createElement('span');numbers.className='dd-line-number';
        numbers.textContent=`${s.op==='add'?'':++left} │ ${s.op==='remove'?'':++right} ${s.op==='add'?'+':s.op==='remove'?'−':' '}`;
        row.append(numbers);append(row,s,index);list.append(row);
      });container.append(list);
    } else if(this.view==='unified') {
      const pre=document.createElement('div');pre.className='dd-content';
      this.result.segments.forEach((s,i)=>append(pre,s,i));container.append(pre);
    } else {
      const grid=document.createElement('div');grid.className='dd-split';grid.setAttribute('aria-label','双栏差异');
      let index=0;
      for(const row of this.result.rows) {
        const left=document.createElement('div'),right=document.createElement('div');
        left.className=right.className='dd-cell';
        for(const s of row) {if(s.op!=='add')append(left,s,index);if(s.op!=='remove')append(right,s,index);index++;}
        grid.append(left,right);
      }
      container.append(grid);
    }
    this.activeChange=-1;
  }
  private navigate(direction:number) {
    const changes=Array.from(this.root.querySelectorAll<HTMLElement>('[data-change]'));
    const ids=[...new Set(changes.map(n=>Number(n.dataset.change)))].sort((a,b)=>a-b);
    if(!ids.length){this.status('没有可跳转的差异。');return;}
    this.activeChange=this.activeChange<0?(direction>0?0:ids.length-1):(this.activeChange+direction+ids.length)%ids.length;
    changes.forEach(e=>e.classList.toggle('dd-current',Number(e.dataset.change)===ids[this.activeChange]));
    const selected=changes.find(e=>Number(e.dataset.change)===ids[this.activeChange]);
    selected?.scrollIntoView?.({block:'nearest',behavior:'auto'});
    this.status(`第 ${this.activeChange+1} / ${ids.length} 处差异`);
  }
  destroy() {this.disposed=true;this.generation++;this.task?.cancel();this.abort.abort();}
}
