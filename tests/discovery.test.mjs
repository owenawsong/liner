import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.location = { protocol: 'http:', hostname: 'localhost' };
globalThis.window = {};
const { discoverySeeds,rankCandidates,connectionReason,usefulCuration,revisitRecord } = await import('../js/discovery.js');
const { tasteKey } = await import('../js/taste.js');

test('a recently saved unheard artist becomes a seed on the next rebuild', () => {
  const now = Date.now();
  const A = { to: now, rows: [{ t: now - 864e5, artist: 'Old favorite' }],
    artists: Array.from({ length: 24 }, (_, i) => ({ name: `Artist ${i}` })) };
  const taste = { items: { 'artist:|new favorite': {
    kind: 'artist', name: 'New Favorite', status: 'saved', updated: now,
  } } };
  assert.ok(discoverySeeds(A, taste).some((seed) => seed.name === 'New Favorite'));
});

test('connection diversity does not refill a seed beyond the cap',()=>{
  const pool=Array.from({length:8},(_,i)=>({name:`New ${i}`,score:10-i,match:.8,sources:[{name:'Same seed',match:.8,weight:1}]}));
  const picks=rankCandidates(pool,{items:{}});
  assert.equal(picks.length,3);
});

test('the strongest weighted source supplies the explanation, with recorded counts',()=>{
  const candidate={name:'Next artist',sources:[{name:'Weak',weight:.1,match:1,recentPlays:2},
    {name:'Current favorite',weight:2,match:.7,recentPlays:430,lifetimePlays:900}]};
  assert.match(connectionReason(candidate),/^Current favorite has 430 plays in your latest 90 days/);
  assert.match(connectionReason(candidate),/Last.fm listeners/);
});

test('a genre list is rejected even if it finishes with a seed name',()=>{
  const candidate={tags:['dream pop','indie pop','alternative'],sources:[{name:'Current favorite'}]};
  assert.equal(usefulCuration('Dream pop, indie pop and alternative sounds connect this artist to Current favorite.',candidate),false);
  assert.equal(usefulCuration('Current favorite is dominating your recent listening; this artist is also connected to Older favorite.',candidate),true);
});

test('returning records are genuinely absent from the latest recorded period and respect passes',()=>{
  const now=Date.UTC(2026,0,1),old=now-200*864e5;
  const A={to:now,albums:[{album:'Current',artist:'A',n:99},{album:'Past',artist:'B',n:20}],
    rows:[{t:old,album:'Past',artist:'B',track:'Old track'},{t:now,album:'Current',artist:'A',track:'Now track'}]};
  assert.equal(revisitRecord(A,{items:{}}).album.name,'Past');
  assert.equal(revisitRecord(A,{items:{[tasteKey('album','Past','B')]:{status:'hidden'}}}),null);
  assert.equal(revisitRecord(A,{items:{[tasteKey('artist','B')]:{rating:1}}}),null);
});
