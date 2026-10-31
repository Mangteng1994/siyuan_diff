import { compare } from './diff';

self.onmessage=({data}:MessageEvent<{original:string;updated:string}>)=>{
  try {postMessage({result:compare(data.original,data.updated)});}
  catch(error) {postMessage({error:error instanceof Error?error.message:String(error)});}
};
