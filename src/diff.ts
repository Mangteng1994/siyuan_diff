export type DiffOp = 'equal' | 'add' | 'remove';
export interface Segment { op: DiffOp; text: string }
export interface Comparison { segments: Segment[]; lines: Segment[]; added: number; removed: number; changed: boolean }
const LIMIT = 50000;
const BUDGET = 1_000_000;

/** 沿用参考项目的行级 LCS 与回溯平局顺序。 */
export function buildUnifiedDiff(original: string, updated: string): Segment[] {
  const a = original ? original.split(/\r?\n/) : [];
  const b = updated ? updated.split(/\r?\n/) : [];
  if (original === updated) return a.map(text=>({op:'equal',text}));
  // 行级从尾部回溯；裁剪共同前缀会改变重复行的匹配位置。
  const aa = a, bb = b;
  if ((aa.length+1)*(bb.length+1)>4_000_000) throw new Error('行级差异过大，请分段对比。');
  const dp = Array.from({length:aa.length+1},()=>new Uint32Array(bb.length+1));
  for(let i=1;i<=aa.length;i++) for(let j=1;j<=bb.length;j++)
    dp[i][j] = aa[i-1]===bb[j-1] ? dp[i-1][j-1]+1 : Math.max(dp[i-1][j],dp[i][j-1]);
  const out: Segment[]=[];
  let i=aa.length,j=bb.length;
  while(i || j) {
    if(i && j && aa[i-1]===bb[j-1]) { out.push({op:'equal',text:aa[--i]}); j--; }
    else if(i && (!j || dp[i-1][j]>=dp[i][j-1])) out.push({op:'remove',text:aa[--i]});
    else out.push({op:'add',text:bb[--j]});
  }
  return out.reverse();
}

/** Myers 最短编辑路径；平局优先删除，与参考项目统一字符流一致。 */
export function buildUnifiedCharDiff(original: string, updated: string): Segment[] {
  if(original.length>LIMIT || updated.length>LIMIT) throw new Error(`每侧最多 ${LIMIT} 个 UTF-16 单元，请分段对比。`);
  if(!original)return updated?[{op:'add',text:updated}]:[];
  if(!updated)return [{op:'remove',text:original}];
  const a=[...original], b=[...updated];
  let head=0,tail=0;
  while(head<a.length && head<b.length && a[head]===b[head]) head++;
  // 不裁剪共同后缀，保留 Myers 对重复字符的原始匹配选择。
  const aa=a.slice(head,a.length-tail),bb=b.slice(head,b.length-tail);
  const raw: Segment[]=[];
  const trace: Map<number,number>[]=[];
  let v=new Map<number,number>([[1,0]]), cells=0, found=false;
  outer: for(let d=0;d<=aa.length+bb.length;d++) {
    if((cells+=2*d+1)>BUDGET) throw new Error('差异过大，请缩小文段后重试。');
    trace.push(new Map(v));
    const next=new Map<number,number>();
    for(let k=-d;k<=d;k+=2) {
      let x = k===-d || (k!==d && (v.get(k-1)??-1)<(v.get(k+1)??-1)) ? (v.get(k+1)??0) : (v.get(k-1)??0)+1;
      let y=x-k;
      while(x<aa.length && y<bb.length && aa[x]===bb[y]) {x++;y++;}
      next.set(k,x);
      if(x>=aa.length && y>=bb.length) {
        let xx=aa.length, yy=bb.length;
        for(let depth=d;depth>=0;depth--) {
          const prev=trace[depth], kk=xx-yy;
          const pk=kk===-depth || (kk!==depth && (prev.get(kk-1)??-1)<(prev.get(kk+1)??-1)) ? kk+1 : kk-1;
          const px=prev.get(pk)??0, py=px-pk;
          while(xx>px && yy>py) raw.push({op:'equal',text:aa[--xx]}), yy--;
          if(depth>0) {
            if(xx===px) raw.push({op:'add',text:bb[--yy]});
            else raw.push({op:'remove',text:aa[--xx]});
          }
        }
        found=true; break outer;
      }
    }
    v=next;
  }
  if(!found) throw new Error('无法完成差异计算。');
  const merged:Segment[]=[];
  const push=(s:Segment)=>{ if(!s.text)return; const last=merged.at(-1); if(last?.op===s.op)last.text+=s.text; else merged.push({...s}); };
  push({op:'equal',text:a.slice(0,head).join('')});
  raw.reverse().forEach(push);
  push({op:'equal',text:a.slice(a.length-tail).join('')});
  return merged;
}
export function compare(original:string,updated:string):Comparison {
  const a=original.replace(/\r\n/g,'\n'),b=updated.replace(/\r\n/g,'\n');
  const segments=buildUnifiedCharDiff(a,b);
  const count=(op:DiffOp)=>segments.filter(s=>s.op===op).reduce((n,s)=>n+[...s.text].length,0);
  const added=count('add'),removed=count('remove');
  return {segments,lines:buildUnifiedDiff(a,b),added,removed,changed:added+removed>0};
}
