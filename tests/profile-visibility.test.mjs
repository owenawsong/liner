import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window={};
globalThis.location={protocol:'http:',hostname:'localhost'};
const {profileNavHTML}=await import('../js/profile-nav.js');
const {facts}=await import('../js/ai.js');
const {analyze}=await import('../js/analysis.js');
const {findingHTML}=await import('../js/views/aiviews.js');

test('core analytical pages have direct links with a current-page marker',()=>{
  for(const current of ['overview','top','timeline','evolution','patterns','insights','discover','clock','data']){
    const html=profileNavHTML('demo',current);
    const target=`#/demo${current==='overview'?'':`/${current}`}`;
    assert.ok(html.includes(`href="${target}" aria-current="page"`),current);
    assert.equal((html.match(/aria-current="page"/g)||[]).length,1);
    assert.doesNotMatch(html,/<details|Explore more/);
  }
});

test('AI evidence compares periods ending at the archive rather than today',()=>{
  const start=Date.UTC(2020,0,1),DAY=864e5;
  const A=analyze(Array.from({length:180},(_,i)=>({t:start+i*DAY,artist:i<90?'Earlier':'Later',track:'Track',album:'Album'})),{minMs:0});
  assert.match(facts(A,{source:'file'},{detailed:true}),/latest and previous 90 days: 90 vs 90 plays/);
});

test('a useful prepared interpretation is visible and labeled in full findings',()=>{
  const entry={id:'return',title:'A favorite returned',detail:'Recorded listening returned.',basis:'Recorded plays',family:'return'};
  const ctx={prepared:{dossier:{observations:{return:'The gap makes this a rediscovery rather than a continuation of your earlier rotation.'}}},L:{}};
  const full=findingHTML(ctx,entry);
  assert.match(full,/<aside class="finding-context"><span class="label">AI interpretation/);
  assert.doesNotMatch(full,/<details/);
  assert.match(findingHTML(ctx,entry,{compact:true}),/<details class="finding-context">/);
});
