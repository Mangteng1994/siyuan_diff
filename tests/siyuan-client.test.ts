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
