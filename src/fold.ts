export type FoldItem = {kind:'row';index:number} | {kind:'fold';start:number;count:number};
const CONTEXT = 3;
const MIN_FOLD = 3;

/** 保留改动前后的上下文，把其余连续未变更行合并为可展开的折叠项。 */
export function foldRows(changed:boolean[]):FoldItem[] {
  const items:FoldItem[]=[];
  const pushRows=(start:number,end:number)=>{for(let index=start;index<end;index++)items.push({kind:'row',index});};
  if(!changed.includes(true)) {pushRows(0,changed.length);return items;}
  const keep=changed.map(()=>false);
  changed.forEach((isChanged,i)=>{
    if(isChanged)for(let k=Math.max(0,i-CONTEXT);k<=Math.min(changed.length-1,i+CONTEXT);k++)keep[k]=true;
  });
  for(let i=0;i<changed.length;) {
    if(keep[i]) {pushRows(i,i+1);i++;continue;}
    let end=i;
    while(end<changed.length && !keep[end])end++;
    if(end-i>=MIN_FOLD)items.push({kind:'fold',start:i,count:end-i});else pushRows(i,end);
    i=end;
  }
  return items;
}
