import { describe, it, expect } from 'vitest';
import { compare } from '../src/diff';
import { buildReport } from '../src/report';

describe('Markdown 差异报告',()=>{
  it('写明来源和统计，每处改动单独成节并带上下文',()=>{
    const report=buildReport(compare('一\n二\n三\n四\n五\n六\n七\n八\n旧','一\n二\n三\n四\n五\n六\n七\n八\n新\n加'),'甲文档','乙文档');
    expect(report).toContain('- 原文：甲文档');expect(report).toContain('- 修改后：乙文档');
    expect(report).toContain('共 1 处改动');
    expect(report).toContain('## 第 1 处（原文第 9 行，修改后第 9 行）');
    expect(report).toContain('```diff\n  六\n  七\n  八\n');
    expect(report).toContain('- 旧');expect(report).toContain('+ 新');expect(report).toContain('+ 加');
    expect(report).not.toContain('  五');
  });
  it('纯新增时行号指向插入位置，连续改动合并为一处',()=>{
    const report=buildReport(compare('甲\n乙\n丙\n丁','甲\n乙\n新\n丙\n改'),'A','B');
    expect(report).toContain('共 2 处改动');
    expect(report).toContain('## 第 1 处（原文第 3 行，修改后第 3 行）');
    expect(report).toContain('## 第 2 处（原文第 4 行，修改后第 5 行）');
  });
  it('内容含代码围栏时加长围栏，避免结构被破坏',()=>{
    const report=buildReport(compare('```js\n旧\n```','```js\n新\n```'),'A','B');
    expect(report).toContain('````diff\n');expect(report.trimEnd().endsWith('````')).toBe(true);
  });
  it('两版相同时明确说明，有整块标记时提示',()=>{
    expect(buildReport(compare('甲','甲'),'A','B')).toContain('两个版本完全一致');
    const coarse=buildReport(compare('甲'.repeat(4000),'乙'.repeat(4000)),'A','B');
    expect(coarse).toContain('1 个区块改动过大');
  });
  it('报告中的改动行逐字保留原文，不丢失空格',()=>{
    const report=buildReport(compare('  a  b','  a b'),'A','B');
    expect(report).toContain('-   a  b\n');expect(report).toContain('+   a b\n');
  });
});
