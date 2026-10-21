export interface DocumentInfo {id:string; title:string}
export interface DocumentContent extends DocumentInfo {markdown:string}
interface Block {id:string;type:string;content:string;hpath?:string}
interface ResponseData {code:number;msg?:string;data?:unknown}
export type Request = (path:string, body:Record<string,unknown>)=>Promise<ResponseData>;
export function parseDocumentId(value:string):string {
  const s=value.trim();
  if(/^\d{14}-[a-z0-9]{7}$/.test(s))return s;
  const match=s.match(/siyuan:\/\/blocks\/(\d{14}-[a-z0-9]{7})(?=$|[/?#)])/);
  if(match)return match[1];
  throw new Error('请输入文档 ID 或思源文档链接。');
}
const defaultRequest:Request=async(path,body)=>{
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!response.ok)throw new Error(`思源接口请求失败（HTTP ${response.status}）`);
  return response.json();
};
export class SiyuanClient {
  constructor(private request:Request=defaultRequest){}
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
    const blocks=await this.query(`SELECT id, type, content, hpath FROM blocks WHERE type = 'd' AND content LIKE '%${q}%' ESCAPE '\\' ORDER BY updated DESC LIMIT 50`);
    return blocks.map(b=>({id:b.id,title:b.hpath || b.content}));
  }
  async readDocument(input:string):Promise<DocumentContent> {
    const id=parseDocumentId(input);
    const blocks=await this.query(`SELECT id, type, content FROM blocks WHERE id = '${id}' LIMIT 1`);
    if(blocks[0]?.type!=='d')throw new Error('请选择完整文档，当前 ID 不是文档或文档已删除。');
    const data=await this.call('/api/export/exportMdContent',{id}) as {content?:unknown}|null;
    if(typeof data?.content!=='string')throw new Error('思源返回了无效的 Markdown 内容');
    return {id,title:blocks[0].content,markdown:data.content};
  }
}
