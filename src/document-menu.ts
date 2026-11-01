export interface DocumentRef {id:string;title:string}
export interface MenuAction {label:string;click:()=>void}
interface Handlers {setBase(doc:DocumentRef):void;compare(left:DocumentRef,right:DocumentRef):void;history(doc:DocumentRef):void}
const TITLE_LIMIT=20;

/** 思源把菜单文字和消息当作 HTML 渲染，文档标题必须转义。 */
export function escapeHtml(text:string):string {
  return text.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]!);
}
export function readDocuments(elements:Iterable<HTMLElement>):DocumentRef[] {
  return [...elements].flatMap(e=>{
    const id=e.dataset.nodeId;
    return id?[{id,title:e.querySelector('.b3-list-item__text')?.textContent?.trim() || id}]:[];
  });
}
function menuTitle(title:string) {
  const chars=[...title];
  return escapeHtml(chars.length>TITLE_LIMIT?`${chars.slice(0,TITLE_LIMIT).join('')}…`:title);
}
export function buildMenuActions(selected:DocumentRef[],base:DocumentRef|undefined,handlers:Handlers):MenuAction[] {
  if(selected.length===2) {
    const [left,right]=selected;
    return [{label:'对比这两篇文档',click:()=>handlers.compare(left,right)}];
  }
  if(selected.length!==1)return [];
  const [doc]=selected;
  const actions:MenuAction[]=[{label:'设为对比原文',click:()=>handlers.setBase(doc)}];
  if(base && base.id!==doc.id)actions.push({label:`与「${menuTitle(base.title)}」对比`,click:()=>handlers.compare(base,doc)});
  actions.push({label:'与历史版本对比',click:()=>handlers.history(doc)});
  return actions;
}
