import { describe, it, expect, vi } from 'vitest';
import { SiyuanClient, parseDocumentId } from '../src/siyuan-client';
const id = '20261020123456-abcdefg';
describe('思源只读文档接口', () => {
  it('支持 ID、思源链接、Markdown 链接，拒绝不合法输入', () => {
    for (const input of [id, `siyuan://blocks/${id}`, `[标题](siyuan://blocks/${id})`]) expect(parseDocumentId(input)).toBe(id);
    expect(()=>parseDocumentId("x' OR 1=1")).toThrow(/文档/);
  });
  it('校验文档类型后读取 Markdown', async () => {
    const request = vi.fn().mockResolvedValueOnce({code:0,data:[{id,type:'d',content:'标题',hpath:'/标题'}]})
      .mockResolvedValueOnce({code:0,data:{id,hpath:'/标题',content:'# 标题\n正文'}});
    const client = new SiyuanClient(request);
    expect(await client.readDocument(id)).toEqual({id,title:'标题',markdown:'# 标题\n正文'});
    expect(request.mock.calls.map(c=>c[0])).toEqual(['/api/query/sql','/api/export/exportMdContent']);
  });
  it('导出时关闭元数据和自动标题，避免标题与时间被算作差异', async () => {
    const request = vi.fn().mockResolvedValueOnce({code:0,data:[{id,type:'d',content:'标题'}]})
      .mockResolvedValueOnce({code:0,data:{content:'正文'}});
    await new SiyuanClient(request).readDocument(id);
    expect(request.mock.calls[1][1]).toEqual({id,yfm:false,addTitle:false});
  });
  it('搜索结果带笔记本名，未知笔记本时只显示路径', async () => {
    const request = vi.fn().mockImplementation(async (path:string)=>path==='/api/query/sql'
      ?{code:0,data:[{id,type:'d',box:'b1',content:'同名',hpath:'/甲/同名'},{id:'x',type:'d',box:'b2',content:'同名',hpath:'/同名'}]}
      :{code:0,data:{notebooks:[{id:'b1',name:'工作'}]}});
    expect(await new SiyuanClient(request).searchDocuments('同名')).toEqual([{id,title:'工作/甲/同名'},{id:'x',title:'/同名'}]);
  });
  const historyRequest=()=>vi.fn().mockImplementation(async (path:string)=>{
    if(path==='/api/query/sql')return {code:0,data:[{id,type:'d',content:'标题'}]};
    if(path==='/api/history/searchHistory')return {code:0,data:{histories:['1793116892']}};
    if(path==='/api/history/getDocHistorySnapshots')return {code:0,data:{histories:[{created:'1793116892',historyPath:'/history/2026-10-28-000132-update/b/x.sy'}]}};
    return {code:0,data:{left:{content:'旧 DOM'},right:{content:'新 DOM'},large:false,message:''}};
  });
  it('按文档 ID 列出历史版本，显示时间和操作类型', async () => {
    const request=historyRequest();
    const versions=await new SiyuanClient(request).listHistory(id);
    expect(versions).toHaveLength(1);expect(versions[0].path).toContain('update');expect(versions[0].label).toContain('更新');
    expect(request.mock.calls.find(c=>c[0]==='/api/history/searchHistory')![1]).toEqual({query:id,page:1,op:'all',type:3});
  });
  it('没有历史时不继续请求，段落块被拒绝', async () => {
    const request=vi.fn().mockImplementation(async (path:string)=>path==='/api/query/sql'?{code:0,data:[{id,type:'d',content:'标题'}]}:{code:0,data:{histories:null}});
    expect(await new SiyuanClient(request).listHistory(id)).toEqual([]);
    expect(request.mock.calls.some(c=>c[0]==='/api/history/getDocHistorySnapshots')).toBe(false);
    await expect(new SiyuanClient(vi.fn().mockResolvedValue({code:0,data:[{id,type:'p',content:'段落'}]})).listHistory(id)).rejects.toThrow(/完整文档/);
  });
  it('两侧内容来自同一接口并用同一转换，只调用只读接口', async () => {
    const request=historyRequest();
    const result=await new SiyuanClient(request,html=>`转换:${html}`).readHistory('/history/x.sy',id);
    expect(result).toEqual({original:'转换:旧 DOM',current:'转换:新 DOM'});
    expect(request.mock.calls[0]).toEqual(['/api/history/diffDocVersions',{left:{type:'history',path:'/history/x.sy'},right:{type:'current',id}}]);
  });
  it('文档过大或内容缺失时明确报错', async () => {
    const reject=(data:unknown)=>new SiyuanClient(vi.fn().mockResolvedValue({code:0,data}),html=>html).readHistory('/h',id);
    await expect(reject({large:true,left:{content:'a'},right:{content:'b'},message:'文档太大'})).rejects.toThrow('文档太大');
    await expect(reject({left:null,right:null,message:''})).rejects.toThrow(/无法对比/);
  });
  it('默认转换前恢复 Lute 需要的可编辑标记', async () => {
    const BlockDOM2StdMd=vi.fn().mockReturnValue('正文');
    vi.stubGlobal('window',{Lute:{New:()=>({BlockDOM2StdMd})}});
    const data={left:{content:'<div contenteditable="false">甲</div>'},right:{content:'乙'}};
    await new SiyuanClient(vi.fn().mockResolvedValue({code:0,data})).readHistory('/h',id);
    expect(BlockDOM2StdMd).toHaveBeenCalledWith('<div contenteditable="true">甲</div>');
    vi.unstubAllGlobals();
  });
  it('拒绝将段落块当成完整文档', async () => {
    const request = vi.fn().mockResolvedValue({code:0,data:[{id,type:'p',content:'段落'}]});
    await expect(new SiyuanClient(request).readDocument(id)).rejects.toThrow(/完整文档/);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('接口错误、网络错误必须反馈', async () => {
    await expect(new SiyuanClient(vi.fn().mockResolvedValue({code:-1,msg:'无权限'})).searchDocuments('甲')).rejects.toThrow('无权限');
    await expect(new SiyuanClient(vi.fn().mockRejectedValue(new Error('断线'))).searchDocuments('甲')).rejects.toThrow('断线');
  });
  it('搜索转义 SQL 引号和通配符，只查询文档', async () => {
    const request = vi.fn().mockResolvedValue({code:0,data:[]});
    await new SiyuanClient(request).searchDocuments("a'%_");
    const sql = request.mock.calls[0][1].stmt;
    expect(sql).toContain("type = 'd'"); expect(sql).toContain("a''\\%\\_");
  });
});
