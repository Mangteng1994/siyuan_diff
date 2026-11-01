export interface DocumentInfo {id:string; title:string}
export interface DocumentContent extends DocumentInfo {markdown:string}
interface Block {id:string;type:string;content:string;hpath?:string;box?:string}
interface ResponseData {code:number;msg?:string;data?:unknown}
export type Request = (path:string, body:Record<string,unknown>)=>Promise<ResponseData>;
export function parseDocumentId(value:string):string {
  const s=value.trim();
  if(/^\d{14}-[a-z0-9]{7}$/.test(s))return s;
  const match=s.match(/siyuan:\/\/blocks\/(\d{14}-[a-z0-9]{7})(?=$|[/?#)])/);
  if(match)return match[1];
  throw new Error('请输入文档 ID 或思源文档链接。');
}
export interface HistoryVersion {path:string;label:string}
const HISTORY_OPS:Record<string,string>={update:'更新',sync:'同步',format:'格式化',replace:'替换',outline:'大纲',delete:'删除'};
function historyLabel(created:string,path:string) {
  const time=new Date(Number(created)*1000).toLocaleString('zh-CN',{hour12:false});
  const op=path.match(/^\/history\/[\d-]+-([a-z]+)\//)?.[1];
  return op?`${time} · ${HISTORY_OPS[op] ?? op}`:time;
}
/** 历史内容是只读 DOM；Lute 只把 contenteditable="true" 的元素当作文字容器。 */
const defaultToMarkdown=(html:string)=>{
  const lute=(window as unknown as {Lute?:{New():{BlockDOM2StdMd(dom:string):string}}}).Lute;
  if(!lute)throw new Error('当前环境无法转换历史内容，请在思源内使用。');
  return lute.New().BlockDOM2StdMd(html.replace(/contenteditable="false"/g,'contenteditable="true"'));
};
const defaultRequest:Request=async(path,body)=>{
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!response.ok)throw new Error(`思源接口请求失败（HTTP ${response.status}）`);
  return response.json();
};
export class SiyuanClient {
  constructor(private request:Request=defaultRequest,private toMarkdown:(html:string)=>string=defaultToMarkdown){}
  private async call(path:string,body:Record<string,unknown>):Promise<unknown> {
    const r=await this.request(path,body);
    if(r.code!==0)throw new Error(r.msg || '思源接口返回错误');
    return r.data;
  }
  private async query(stmt:string):Promise<Block[]> {
    const data=await this.call('/api/query/sql',{stmt});
    if(!Array.isArray(data))throw new Error('思源返回了无效的文档列表');
    return data as Block[];
  }
  async searchDocuments(query:string):Promise<DocumentInfo[]> {
    const q=query.trim().slice(0,100).replace(/'/g,"''").replace(/[\\%_]/g,'\\$&');
    const blocks=await this.query(`SELECT id, type, content, hpath, box FROM blocks WHERE type = 'd' AND content LIKE '%${q}%' ESCAPE '\\' ORDER BY updated DESC LIMIT 50`);
    if(!blocks.length)return [];
    const data=await this.call('/api/notebook/lsNotebooks',{}) as {notebooks?:{id:string;name:string}[]}|null;
    const notebooks=new Map(data?.notebooks?.map(n=>[n.id,n.name]));
    return blocks.map(b=>({id:b.id,title:(notebooks.get(b.box ?? '') ?? '')+(b.hpath || b.content)}));
  }
  private async requireDocument(id:string):Promise<Block> {
    const blocks=await this.query(`SELECT id, type, content FROM blocks WHERE id = '${id}' LIMIT 1`);
    if(blocks[0]?.type!=='d')throw new Error('请选择完整文档，当前 ID 不是文档或文档已删除。');
    return blocks[0];
  }
  async readDocument(input:string):Promise<DocumentContent> {
    const id=parseDocumentId(input);
    const block=await this.requireDocument(id);
    const data=await this.call('/api/export/exportMdContent',{id,yfm:false,addTitle:false}) as {content?:unknown}|null;
    if(typeof data?.content!=='string')throw new Error('思源返回了无效的 Markdown 内容');
    return {id,title:block.content,markdown:data.content};
  }
  async listHistory(input:string):Promise<HistoryVersion[]> {
    const id=parseDocumentId(input);
    await this.requireDocument(id);
    const found=await this.call('/api/history/searchHistory',{query:id,page:1,op:'all',type:3}) as {histories?:string[]|null}|null;
    const created=found?.histories ?? [];
    if(!created.length)return [];
    const data=await this.call('/api/history/getDocHistorySnapshots',{id,created,op:'all'}) as {histories?:{created:string;historyPath:string}[]|null}|null;
    return (data?.histories ?? []).filter(h=>h.historyPath).map(h=>({path:h.historyPath,label:historyLabel(h.created,h.historyPath)}));
  }
  /** 两侧由同一接口返回并走同一转换，避免把格式差异算成改动。 */
  async readHistory(path:string,input:string):Promise<{original:string;current:string}> {
    const id=parseDocumentId(input);
    const data=await this.call('/api/history/diffDocVersions',{left:{type:'history',path},right:{type:'current',id}}) as {large?:boolean;message?:string;left?:{content:string}|null;right?:{content:string}|null}|null;
    if(data?.large || !data?.left || !data.right)throw new Error(data?.message || '文档过大或内容不可用，无法对比历史版本。');
    return {original:this.toMarkdown(data.left.content),current:this.toMarkdown(data.right.content)};
  }
}
