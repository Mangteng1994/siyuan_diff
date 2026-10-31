import { compare, type Comparison } from './diff';

/** 构建时注入的 Worker 脚本；测试环境未注入时退回本地计算。 */
declare const __DIFF_WORKER_SOURCE__: string | undefined;
const bundledSource = typeof __DIFF_WORKER_SOURCE__==='string' ? __DIFF_WORKER_SOURCE__ : undefined;
export interface CompareTask {result:Promise<Comparison>;cancel():void}

function createWorker(source:string|undefined) {
  if(!source || typeof Worker==='undefined')return undefined;
  const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
  try {return {worker:new Worker(url),url};}
  catch {URL.revokeObjectURL(url);return undefined;}
}

/** 在 Worker 中对比，避免长文阻塞思源界面；Worker 不可用时退回本地计算。 */
export function startCompare(original:string,updated:string,source=bundledSource):CompareTask {
  const local=()=>Promise.resolve().then(()=>compare(original,updated));
  const created=createWorker(source);
  if(!created)return {result:local(),cancel(){}};
  const {worker,url}=created;
  const stop=()=>{worker.terminate();URL.revokeObjectURL(url);};
  let abort!:(reason:Error)=>void;
  const result=new Promise<Comparison>((resolve,reject)=>{
    abort=reject;
    worker.onmessage=({data}:MessageEvent<{result?:Comparison;error?:string}>)=>{
      stop();
      if(data.result)resolve(data.result);else reject(new Error(data.error ?? '无法完成差异计算。'));
    };
    worker.onerror=event=>{event.preventDefault();stop();local().then(resolve,reject);};
    worker.postMessage({original,updated});
  });
  return {result,cancel(){stop();abort(new Error('对比已取消。'));}};
}
