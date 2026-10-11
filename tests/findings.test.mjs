import test from 'node:test';
import assert from 'node:assert/strict';
const {analyze}=await import('../js/analysis.js');
const {deeperFindings,selectFindings}=await import('../js/findings.js');
const {recordEvidence,dossierFacts,recordSignature}=await import('../js/dossier.js');
const DAY=864e5,base=Date.UTC(2022,0,1,12);
const play=(day,artist,track='Song',album='Record')=>({t:base+day*DAY,artist,track,album});
const archive=rows=>analyze(rows.sort((a,b)=>a.t-b.t),{minMs:0});
const add=(rows,day,artist,count,tracks=1,album='Record')=>{for(let i=0;i<count;i++)rows.push({...play(day,artist,`Song ${i%tracks}`,album),t:base+day*DAY+i*1000});};

test('report ranking selects distinct artist subjects and families rather than six repetitions',()=>{
  const evidence=[{id:'a',title:'A',family:'change',score:99,artists:['Dominant']},{id:'b',title:'B',family:'retention',score:98,artists:['Dominant']},{id:'c',title:'C',family:'change',score:90,artists:['Other']},{id:'d',title:'D',family:'album',score:85,artists:['Third']},{id:'e',title:'E',family:'clock',score:80,artists:['Fourth']}];
  assert.deepEqual(selectFindings(evidence).map(x=>x.id),['a','d','e']);
  assert.deepEqual(selectFindings(evidence,{excludeArtists:['dominant'],limit:2}).map(x=>x.id),['c','d']);
  assert.deepEqual(selectFindings(evidence,{excludeFamilies:['change'],limit:2}).map(x=>x.id),['b','d']);
  assert.deepEqual(selectFindings(evidence,{limit:0}),[]);
});

test('a supported return requires continued recording during the gap and listening on distinct days',()=>{
  const rows=[];add(rows,0,'Returning',12);for(let day=1;day<120;day++)rows.push(play(day,'Other'));add(rows,120,'Returning',3);add(rows,121,'Returning',3);
  const finding=deeperFindings(archive(rows)).find(x=>x.family==='returns');
  assert.equal(finding.target.name,'Returning');assert.equal(finding.visual.gapDays,119);assert.equal(finding.visual.plays,6);
  const missing=[];add(missing,0,'Returning',12);add(missing,120,'Returning',3);add(missing,121,'Returning',3);
  assert.equal(deeperFindings(archive(missing)).some(x=>x.family==='returns'),false);
  const burst=[];add(burst,0,'Returning',12);for(let day=1;day<120;day++)burst.push(play(day,'Other'));add(burst,120,'Returning',10);
  assert.equal(deeperFindings(archive(burst)).some(x=>x.family==='returns'),false);
});

test('discovery retention excludes archive-boundary artists and discoveries without follow-up',()=>{
  const rows=[];for(let day=0;day<=365;day++)rows.push(play(day,'Archive boundary'));
  for(const day of [110,150,210,300])add(rows,day,'Stayed',3);
  add(rows,130,'Sampled',2);add(rows,170,'Sampled too',2);add(rows,350,'Too fresh',50);
  const finding=deeperFindings(archive(rows)).find(x=>x.id==='retention');
  assert.deepEqual([finding.visual.kept,finding.visual.total],[1,3]);
  assert.equal(finding.visual.artists[0].name,'Stayed');assert.match(finding.basis,/90 days of follow-up/);
});

test('single-day bursts are not presented as multi-day concentrated runs',()=>{
  const rows=[];add(rows,0,'Burst',50);add(rows,80,'Other',20);
  assert.equal(deeperFindings(archive(rows)).some(x=>x.family==='concentration'),false);
  const spread=[];for(const day of [0,1,2,3])add(spread,day,'Run',8);add(spread,100,'Other',40);
  const finding=deeperFindings(archive(spread)).find(x=>x.family==='concentration');
  assert.equal(finding.target.name,'Run');assert.equal(finding.visual.points[0].value,32);
});

test('enduring favorites need substantial listening in three years, not one boundary play',()=>{
  const rows=[];for(const day of [0,370,740,780])add(rows,day,'Constant',15);for(const day of [0,370,780])add(rows,day,'Incidental',1);
  const findings=deeperFindings(archive(rows)).filter(x=>x.family==='enduring');
  assert.equal(findings.length,1);assert.equal(findings[0].target.name,'Constant');assert.equal(findings[0].visual.points.length,3);
});

test('album breadth measures observed track titles and does not invent completion',()=>{
  const rows=[];for(const day of [0,2,5,9])add(rows,day,'Album artist',8,8,'Deep record');
  const finding=deeperFindings(archive(rows)).find(x=>x.family==='album-breadth');
  assert.equal(finding.visual.distinct,8);assert.equal(finding.visual.days,4);assert.equal(finding.target.kind,'album');assert.match(finding.basis,/completion is unknown/);
  const unknown=archive(rows.map(r=>({...r,album:''})));
  assert.equal(deeperFindings(unknown).some(x=>x.family==='album-breadth'),false);
});

test('personal surprise compares against complete supported earlier periods',()=>{
  const rows=[];for(let day=0;day<720;day++){add(rows,day,'Background',2);if(day%10===0)add(rows,day,'Change',1);if(day>=630)add(rows,day,'Change',2);}
  const finding=deeperFindings(archive(rows)).find(x=>x.family==='personal-change');
  assert.equal(finding.target.name,'Change');assert.ok(finding.visual.comparisons>=3);assert.ok(finding.visual.recent>finding.visual.previousMax+3);
  const sparse=archive(rows.filter(r=>r.artist==='Change'));
  assert.equal(deeperFindings(sparse).some(x=>x.family==='personal-change'),false);
});

test('empty and short records omit unsupported changes and missing summer stories',()=>{
  assert.deepEqual(recordEvidence(archive([])),[]);
  const rows=[];add(rows,0,'Small record',15);add(rows,3,'Other',5);
  const findings=recordEvidence(archive(rows));
  assert.equal(findings.some(x=>['shift','stayed','revisit','summer','years'].includes(x.id)),false);
  assert.equal(findings.some(x=>/^No |^Your record needs /.test(x.title)),false);
});

test('AI bundle stays bounded and exclusion edits change record identity',()=>{
  const rows=[];for(let day=0;day<720;day++)rows.push(play(day,`Artist ${day%8}`,`Song ${day%16}`));
  const A=archive(rows),evidence=recordEvidence(A);
  assert.ok(dossierFacts(A,evidence).length<=4900);
  assert.notEqual(recordSignature(A),recordSignature({...A,filterSignature:'exclude-one-song'}));
  for(const entry of selectFindings(evidence))assert.ok(entry.facts&&entry.family&&Number.isFinite(entry.score));
});

test('equal artist totals and endpoints cannot reuse a different listening-sequence report',()=>{
  const first=archive([play(0,'A'),play(1,'B'),play(2,'A'),play(3,'B')]);
  const second=archive([play(0,'A'),play(1,'A'),play(2,'B'),play(3,'B')]);
  assert.deepEqual(first.artists.map(a=>[a.name,a.n]),second.artists.map(a=>[a.name,a.n]));
  assert.equal(first.from,second.from);assert.equal(first.to,second.to);
  assert.notEqual(recordSignature(first),recordSignature(second));
});
