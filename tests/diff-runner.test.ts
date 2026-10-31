import { afterEach, describe, it, expect, vi } from 'vitest';
import { startCompare } from '../src/diff-runner';
import { compare } from '../src/diff';

class FakeWorker {
  static last:FakeWorker;
  onmessage?:(event:{data:unknown})=>void;
  onerror?:(event:{preventDefault():void})=>void;
  posted:unknown;terminated=false;
  constructor(){FakeWorker.last=this;}
  postMessage(data:unknown){this.posted=data;}
  terminate(){this.terminated=true;}
}
const stubWorker=()=>{
  vi.stubGlobal('Worker',FakeWorker);
  vi.stubGlobal('URL',{createObjectURL:()=>'blob:x',revokeObjectURL:vi.fn()});
};
afterEach(()=>vi.unstubAllGlobals());

describe('后台对比',()=>{
  it('没有 Worker 时退回本地计算，错误照常反馈',async()=>{
    await expect(startCompare('甲','乙').result).resolves.toEqual(compare('甲','乙'));
    await expect(startCompare('甲'.repeat(50001),'').result).rejects.toThrow(/50000/);
  });
  it('把文本发给 Worker，收到结果后关闭 Worker',async()=>{
    stubWorker();const task=startCompare('甲','乙','source');const worker=FakeWorker.last;
    expect(worker.posted).toEqual({original:'甲',updated:'乙'});
    const result=compare('甲','乙');worker.onmessage!({data:{result}});
    await expect(task.result).resolves.toEqual(result);expect(worker.terminated).toBe(true);
  });
  it('Worker 内的计算错误原样反馈',async()=>{
    stubWorker();const task=startCompare('甲','乙','source');
    FakeWorker.last.onmessage!({data:{error:'行级差异过大'}});
    await expect(task.result).rejects.toThrow('行级差异过大');
  });
  it('Worker 启动失败时退回本地计算',async()=>{
    stubWorker();const task=startCompare('甲','乙','source');const preventDefault=vi.fn();
    FakeWorker.last.onerror!({preventDefault});
    await expect(task.result).resolves.toEqual(compare('甲','乙'));expect(preventDefault).toHaveBeenCalled();
  });
  it('取消时立即终止 Worker',async()=>{
    stubWorker();const task=startCompare('甲','乙','source');task.cancel();
    expect(FakeWorker.last.terminated).toBe(true);await expect(task.result).rejects.toThrow('取消');
  });
});
