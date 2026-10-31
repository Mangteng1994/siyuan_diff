import { describe, it, expect } from 'vitest';
import { foldRows } from '../src/fold';
const flags=(length:number,...changed:number[])=>Array.from({length},(_,i)=>changed.includes(i));
const rows=(...indexes:number[])=>indexes.map(index=>({kind:'row',index}));
describe('折叠未变更内容',()=>{
  it('改动前后各保留 3 行上下文',()=>{
    expect(foldRows(flags(21,10))).toEqual([{kind:'fold',start:0,count:7},...rows(7,8,9,10,11,12,13),{kind:'fold',start:14,count:7}]);
  });
  it('少于 3 行的间隔不折叠',()=>{
    expect(foldRows(flags(10,1,8)).some(x=>x.kind==='fold')).toBe(false);
  });
  it('两处改动之间的长间隔单独折叠',()=>{
    expect(foldRows(flags(20,0,19))).toEqual([...rows(0,1,2,3),{kind:'fold',start:4,count:12},...rows(16,17,18,19)]);
  });
  it('没有改动时全部显示',()=>{
    expect(foldRows(flags(30))).toEqual(rows(...Array.from({length:30},(_,i)=>i)));
    expect(foldRows([])).toEqual([]);
  });
});
