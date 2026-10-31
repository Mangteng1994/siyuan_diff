import { build } from 'esbuild';

/** 插件只分发单个 index.js，把 Worker 脚本作为字符串内联进去。 */
export async function workerDefine() {
  const worker=await build({entryPoints:['src/diff-worker.ts'],bundle:true,format:'iife',platform:'browser',target:'es2022',minify:true,write:false});
  return {__DIFF_WORKER_SOURCE__:JSON.stringify(worker.outputFiles[0].text)};
}
