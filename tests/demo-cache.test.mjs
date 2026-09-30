import test from 'node:test';
import assert from 'node:assert/strict';

test('demo reloads within one day keep the same record and AI cache signature',async()=>{
  const RealDate=globalThis.Date;
  let now=new RealDate(2026,8,30,9,15).getTime();
  class PreviewDate extends RealDate {
    constructor(...args){super(...(args.length?args:[now]));}
    static now(){return now;}
  }
  try{
    globalThis.Date=PreviewDate;
    const morning=(await import('../js/sources/demo.js?cache-check=morning')).sampleArchive();
    now=new RealDate(2026,8,30,21,45).getTime();
    const evening=(await import('../js/sources/demo.js?cache-check=evening')).sampleArchive();
    assert.deepEqual(evening,morning);
    assert.ok(evening.at(-1).t<new RealDate(2026,8,30).getTime());
  }finally{globalThis.Date=RealDate;}
});
