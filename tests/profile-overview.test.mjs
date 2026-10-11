import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window={};
globalThis.location={protocol:'http:',hostname:'localhost'};
const {analyze}=await import('../js/analysis.js');
const {shiftHTML,archiveNeededHTML,overviewHTML}=await import('../js/views/profile.js');
const DAY=864e5,start=Date.UTC(2025,0,1);
const row=(day,artist='New favorite')=>({t:start+day*DAY,artist,track:'Song',album:'Album'});
const render=rows=>shiftHTML({pid:'file',A:analyze(rows,{minMs:0}),L:{artist:name=>`#/artist/${encodeURIComponent(name)}`}});

test('a new ten-day account shows actual counts without invented prior-period growth',()=>{
  const html=render(Array.from({length:40},(_,i)=>row(i/4)));
  assert.match(html,/40 plays/);
  assert.match(html,/Getting to know your music/);
  assert.match(html,/missing earlier period is not counted as zero/);
  assert.doesNotMatch(html,/class="change-snapshot"|moved into focus|Previous 90 days/);
});

test('an older archive with too few earlier plays also withholds the change snapshot',()=>{
  const html=render([row(0,'Earlier'),...Array.from({length:50},(_,i)=>row(180+i/50))]);
  assert.match(html,/50 plays/);
  assert.doesNotMatch(html,/class="change-snapshot"|moved into focus/);
});

test('two sufficiently supported periods display their observed comparison',()=>{
  const html=render(Array.from({length:180},(_,i)=>row(i,i<90?'Earlier':'New favorite')));
  assert.match(html,/class="change-snapshot"/);
  assert.match(html,/Previous 90 days/);
  assert.match(html,/Latest 90 days/);
  assert.match(html,/90 plays/);
});

test('a supported archive without a rising artist explains the result without asking for missing history',()=>{
  const html=render(Array.from({length:180},(_,i)=>row(i,'Consistent')));
  assert.match(html,/No clear rise stands out/);
  assert.doesNotMatch(html,/Keep listening to build|moved into focus|class="change-snapshot"/);
});

test('a rising share can show fewer artist plays without claiming play growth',()=>{
  const rows=[];
  for(let i=0;i<2000;i++)rows.push(row(i/2000*89,i<1000?'Favorite':'Other'));
  for(let i=0;i<700;i++)rows.push(row(90+i/699*89,i<600?'Favorite':'Other'));
  const html=render(rows);
  assert.match(html,/1,000 plays/);
  assert.match(html,/600 plays/);
  assert.match(html,/50\.0<small>%/);
  assert.match(html,/85\.7<small>%/);
  assert.match(html,/bigger place in your listening/);
  assert.doesNotMatch(html,/more plays|plays increased/);
});

test('filtered file and demo histories lead every analytical empty state back to counting settings',()=>{
  for(const source of ['file','demo','lastfm']) {
    const ctx={pid:source==='lastfm'?'lastfm:example':source,source,A:null,p:{user:{playcount:50}},archive:{export:{rows:[row(0)]}}};
    for(const tab of ['timeline','evolution','patterns','insights','clock','discover']) {
      const html=archiveNeededHTML(ctx,tab);
      assert.match(html,/No plays match your counting settings/);
      assert.match(html,/original history is saved/);
      assert.match(html,/Review counting settings/);
      assert.doesNotMatch(html,/being prepared|Import my history/);
    }
  }
});

test('a genuinely empty file profile offers another file without requiring a live source',()=>{
  const ctx={pid:'file',source:'file',A:null,p:{user:{playcount:0},recent:[]},archive:{export:{rows:[]}},topArtists:[]};
  assert.match(archiveNeededHTML(ctx,'insights'),/Choose a history file/);
  assert.match(overviewHTML(ctx),/Choose a history file/);
  assert.doesNotMatch(overviewHTML(ctx),/undefined/);
});
