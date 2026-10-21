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
  it('长文与巨大差异在计算前明确拒绝，避免阻塞宿主', () => {
    expect(()=>compare('甲'.repeat(50001), '')).toThrow(/50000/);
    expect(()=>compare('甲'.repeat(4000), '乙'.repeat(4000))).toThrow(/差异/);
  });
});
