// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { buildMenuActions, escapeHtml, readDocuments } from '../src/document-menu';
const a={id:'a',title:'甲'},b={id:'b',title:'乙'};
const handlers=()=>({setBase:vi.fn(),compare:vi.fn(),history:vi.fn()});
describe('文档树右键菜单',()=>{
  it('从文档树元素读取 ID 和标题，跳过没有 ID 的元素',()=>{
    const root=document.createElement('ul');
    root.innerHTML='<li data-node-id="a"><span class="b3-list-item__text"> 甲 </span></li><li data-node-id="b"></li><li></li>';
    expect(readDocuments(root.querySelectorAll('li'))).toEqual([a,{id:'b',title:'b'}]);
  });
  it('单选且没有原文时，可设为原文或查看历史版本',()=>{
    const h=handlers();const actions=buildMenuActions([a],undefined,h);
    expect(actions.map(x=>x.label)).toEqual(['设为对比原文','与历史版本对比']);
    actions[0].click();expect(h.setBase).toHaveBeenCalledWith(a);
    actions[1].click();expect(h.history).toHaveBeenCalledWith(a);
  });
  it('已有原文时，可与另一篇文档对比',()=>{
    const h=handlers();const actions=buildMenuActions([b],a,h);
    expect(actions.map(x=>x.label)).toEqual(['设为对比原文','与「甲」对比','与历史版本对比']);
    actions[1].click();expect(h.compare).toHaveBeenCalledWith(a,b);
  });
  it('原文本身不提供和自己对比',()=>{
    expect(buildMenuActions([a],a,handlers()).map(x=>x.label)).toEqual(['设为对比原文','与历史版本对比']);
  });
  it('选中两篇时直接对比，其他数量不显示',()=>{
    const h=handlers();const actions=buildMenuActions([a,b],undefined,h);
    expect(actions.map(x=>x.label)).toEqual(['对比这两篇文档']);
    actions[0].click();expect(h.compare).toHaveBeenCalledWith(a,b);
    expect(buildMenuActions([],a,h)).toEqual([]);expect(buildMenuActions([a,b,a],a,h)).toEqual([]);
  });
  it('菜单文字截断长标题并转义 HTML',()=>{
    const long={id:'x',title:'长'.repeat(30)};
    expect(buildMenuActions([b],long,handlers())[1].label).toBe(`与「${'长'.repeat(20)}…」对比`);
    expect(buildMenuActions([b],{id:'x',title:'<img src=x>'},handlers())[1].label).toBe('与「&lt;img src=x&gt;」对比');
    expect(escapeHtml('a&b"')).toBe('a&amp;b&quot;');
  });
});
