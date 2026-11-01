import type { Comparison, DiffOp } from './diff';

const CONTEXT=3;
const MARK:Record<DiffOp,string>={equal:' ',add:'+',remove:'-'};
const fence=(text:string)=>'`'.repeat(Math.max(2,...(text.match(/`+/g) ?? []).map(run=>run.length))+1);

export function reportFileName(now=new Date()) {
  const pad=(n:number)=>String(n).padStart(2,'0');
  const date=`${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}`;
  return `文档差异-${date}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.md`;
}

/** 每处改动带上下文写入 diff 代码块，文字逐字保留。 */
export function buildReport(result:Comparison,original:string,updated:string):string {
  const {lines}=result;
  let left=1,right=1;
  const starts=lines.map(s=>{
    const start={left,right};
    if(s.op!=='add')left++;
    if(s.op!=='remove')right++;
    return start;
  });
  const sections:string[]=[];
  for(let i=0;i<lines.length;) {
    if(lines[i].op==='equal') {i++;continue;}
    let end=i;
    while(end<lines.length && lines[end].op!=='equal')end++;
    const body=lines.slice(Math.max(0,i-CONTEXT),Math.min(lines.length,end+CONTEXT)).map(s=>`${MARK[s.op]} ${s.text}`).join('\n');
    const marker=fence(body);
    sections.push(`## 第 ${sections.length+1} 处（原文第 ${starts[i].left} 行，修改后第 ${starts[i].right} 行）\n\n${marker}diff\n${body}\n${marker}`);
    i=end;
  }
  const coarse=result.coarse?`，其中 ${result.coarse} 个区块改动过大，已按整块标记`:'';
  const summary=result.changed?`共 ${sections.length} 处改动，新增 ${result.added} 字符，删除 ${result.removed} 字符${coarse}。`:'两个版本完全一致。';
  return [`# 文档差异报告\n\n- 原文：${original}\n- 修改后：${updated}\n- ${summary}`,...sections].join('\n\n')+'\n';
}
