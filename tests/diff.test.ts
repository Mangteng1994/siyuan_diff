import { describe, it, expect } from 'vitest';
import { buildUnifiedDiff, buildUnifiedCharDiff, compare } from '../src/diff';
import { createHash } from 'node:crypto';
import golden from './reference-golden.json';

describe('参考项目 diff 兼容规则', () => {
  it('1922 组参考结果的固定摘要保持一致', () => {
    const samples=[''];
    for(let n=1;n<=4;n++)for(let i=0;i<2**n;i++)samples.push(i.toString(2).padStart(n,'0').replaceAll('0','甲').replaceAll('1','乙'));
    const results=[];
    for(const a of samples)for(const b of samples)results.push(buildUnifiedCharDiff(a,b),buildUnifiedDiff([...a].join('\n'),[...b].join('\n')));
    expect(createHash('sha256').update(JSON.stringify(results)).digest('hex')).toBe(golden.resultSha256);
  });
  it('重复内容的匹配位置与参考回溯规则一致', () => {
    expect(buildUnifiedDiff('甲\n甲','甲')).toEqual([{op:'remove',text:'甲'},{op:'equal',text:'甲'}]);
    expect(buildUnifiedCharDiff('aba','baa')).toEqual([{op:'remove',text:'a'},{op:'equal',text:'ba'},{op:'add',text:'a'}]);
  });
  it('行级忽略 CRLF 与 LF 的区别，保留空白行', () => {
    expect(buildUnifiedDiff('甲\r\n\n乙', '甲\n\n乙')).toEqual([
      {op:'equal',text:'甲'}, {op:'equal',text:''}, {op:'equal',text:'乙'}]);
  });
  it('行级平局顺序与参考一致', () => {
    expect(buildUnifiedDiff('旧', '新')).toEqual([{op:'add',text:'新'},{op:'remove',text:'旧'}]);
  });
  it('中英文、emoji 字符级标出增删，合并相邻操作', () => {
    expect(buildUnifiedCharDiff('你好🙂 old', '你好🙂 new')).toEqual([
      {op:'equal',text:'你好🙂 '},{op:'remove',text:'old'},{op:'add',text:'new'}]);
  });
  it('覆盖空文本与相同文本', () => {
    expect(buildUnifiedCharDiff('', '')).toEqual([]);
    expect(buildUnifiedCharDiff('', '甲')).toEqual([{op:'add',text:'甲'}]);
    expect(compare('', '').changed).toBe(false);
    expect(compare('甲', '甲').added).toBe(0);
  });
  it('合并流可无损还原左右原文', () => {
    const samples = ['', '甲乙甲', '\n甲\n', '🙂test', '<script>x</script>', '  a\t'];
    for (const a of samples) for (const b of samples) {
      const result = compare(a,b);
      expect(result.segments.filter(s=>s.op!=='add').map(s=>s.text).join('')).toBe(a);
      expect(result.segments.filter(s=>s.op!=='remove').map(s=>s.text).join('')).toBe(b);
    }
  });
  it('统计 Unicode 字符数量，支持忽略换行格式', () => {
    const r = compare('甲🙂', '甲🙂乙');
    expect(r.added).toBe(1); expect(r.removed).toBe(0);
    expect(compare('甲\r\n乙', '甲\n乙').changed).toBe(false);
  });
  it('超长文本和超大行级表在计算前明确拒绝，避免阻塞宿主', () => {
    expect(()=>compare('甲'.repeat(50001), '')).toThrow(/50000/);
    const lines=(prefix:string)=>Array.from({length:2100},(_,i)=>prefix+i).join('\n');
    expect(()=>compare(lines('a'), lines('b'))).toThrow(/行级/);
  });
  it('单块超出字符预算时整块标记，不影响其他区块', () => {
    const big=(c:string)=>c.repeat(4000);
    const r=compare(`开头旧\n${big('甲')}\n结尾`, `开头新\n${big('乙')}\n结尾`);
    expect(r.coarse).toBe(1);
    expect(r.segments.filter(s=>s.op!=='add').map(s=>s.text).join('')).toBe(`开头旧\n${big('甲')}\n结尾`);
    expect(r.segments.filter(s=>s.op!=='remove').map(s=>s.text).join('')).toBe(`开头新\n${big('乙')}\n结尾`);
    expect(r.rows.at(-1)).toEqual([{op:'equal',text:'结尾'}]);
  });
  it('分散的大量改动按区块计算，可完成字符级对比', () => {
    const doc=(c:string)=>Array.from({length:40},(_,i)=>`共同${i}\n${c.repeat(100)}`).join('\n');
    const r=compare(doc('甲'), doc('乙'));
    expect(r.coarse).toBe(0);expect(r.added).toBe(4000);expect(r.removed).toBe(4000);
  });
  it('超过行级表上限的长文，只要改动集中仍可对比', () => {
    const doc=Array.from({length:3000},(_,i)=>`行${i}`);
    const updated=[...doc];updated[1500]='改动';
    const r=compare(doc.join('\n'), updated.join('\n'));
    expect(r.changed).toBe(true);expect(r.rows).toHaveLength(3000);
  });
  it('双栏行在相同内容处对齐，改动聚合为同一行', () => {
    expect(compare('甲\n乙\n丙', '甲\n新增\n乙\n丙').rows).toEqual([
      [{op:'equal',text:'甲'}], [{op:'add',text:'新增'}], [{op:'equal',text:'乙'}], [{op:'equal',text:'丙'}]]);
    expect(compare('甲\n旧句\n丙', '甲\n新句\n丙').rows[1]).toEqual([{op:'remove',text:'旧'},{op:'add',text:'新'},{op:'equal',text:'句'}]);
  });
  it('插入或删除空行时双栏仍有可见标记，统计不计入标记', () => {
    const r=compare('甲\n乙', '甲\n\n乙');
    expect(r.rows[1]).toEqual([{op:'add',text:'↵'}]);
    expect(r.added).toBe(1);
  });
  it('换行边界变化同样可无损还原', () => {
    const samples=['', '\n', '\n\n', '甲', '甲\n', '\n甲', '甲\n乙', '甲\n\n乙', '乙\n甲\n', '甲\n乙\n丙'];
    for(const a of samples) for(const b of samples) {
      const result=compare(a,b);
      expect(result.segments.filter(s=>s.op!=='add').map(s=>s.text).join('')).toBe(a);
      expect(result.segments.filter(s=>s.op!=='remove').map(s=>s.text).join('')).toBe(b);
    }
  });
});
