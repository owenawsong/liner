import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStructuredWriting, validStructuredWriting, validYearWriting } from '../functions/lib/writing-quality.js';

test('year commentary rejects selected counts promoted into annual leadership',()=>{
  const facts='Year: 2025. Selected artists: Alpha 160 plays; Beta 120 plays. January: Alpha 40 plays.';
  assert.equal(validYearWriting("In 2025, Alpha led with 160 plays compared to Beta's 120.",facts),false);
  assert.equal(validYearWriting('Alpha led January but dominated the whole year.',facts),false);
  assert.equal(validYearWriting('You recorded 160 plays of Alpha and 120 of Beta in 2025.',facts),true);
  assert.equal(validYearWriting('Alpha led January with 40 plays.',facts),true);
});

test('year commentary keeps its numeric and length budget',()=>{
  const facts='Year: 2025. Alpha 160; Beta 120; January 40.';
  assert.equal(validYearWriting('You recorded 160 plays of Alpha, 120 of Beta and 40 in January.',facts),false);
  assert.equal(validYearWriting('A recorded comparison. '+Array(66).fill('word').join(' '),facts),false);
});
test('a profile observation must refer to the supplied evidence',()=>{
  const value={notes:'Artist A returned while Artist B stayed.',observations:[{id:'invented',text:'A relationship beyond the available evidence.'}]};
  assert.equal(validStructuredWriting('profile',value,'Evidence ID="return"\nArtist A returned.'),false);
  value.observations[0].id='return';assert.equal(validStructuredWriting('profile',value,'Evidence ID="return"\nArtist A returned.'),true);
});
test('structured curation cannot introduce an artist or duplicate a selection',()=>{
  const value={picks:['artist_a','artist_b','artist_x'].map(id=>({id,reason:'Connected to your recent rotation.'}))};
  assert.equal(validStructuredWriting('curate',value,'artist_a artist_b artist_c'),false);
  value.picks[2].id='artist_b';assert.equal(validStructuredWriting('curate',value,'artist_a artist_b artist_c'),false);
  value.picks[2].id='artist_c';assert.equal(validStructuredWriting('curate',value,'artist_a artist_b artist_c'),true);
});
test('a generated era cannot name an artist outside the submitted facts',()=>{
  const value={notes:'Artist A returned to your rotation.',observations:[],eras:[{artist:'Invented artist',title:'A new chapter',line:'Listening returned to an older favorite.'}]};
  assert.equal(validStructuredWriting('profile',value,'Artist A has a recorded era.'),false);
});

test('a number elsewhere in the profile cannot be borrowed by a different finding',()=>{
  const facts='Evidence ID="alpha":\nAlpha returned with 41 plays.\n\nEvidence ID="beta":\nBeta continued with 620 plays.\n\nYear summaries: 2025: 999 plays.';
  const value={notes:'Alpha returned as Beta kept appearing.',observations:[{id:'alpha',text:'Alpha returned with 620 plays.'}]};
  assert.equal(validStructuredWriting('profile',value,facts),false);
  value.observations[0].text='Alpha returned with 41 plays.';
  assert.equal(validStructuredWriting('profile',value,facts),true);
  value.observations.push({...value.observations[0]});
  assert.equal(validStructuredWriting('profile',value,facts),false);
});

test('curation must use its own seed connections and numbers',()=>{
  const facts=`artist_a: Candidate A. Connections: Björk (40 recent plays; 620 lifetime plays; returning); Beta (35 recent plays; 90 lifetime plays; older favorite). Last.fm audience: 180000. Artist tags: alternative.
artist_b: Candidate B. Connections: Delta (73 recent plays; 82 lifetime plays; rising share). Last.fm audience: 25000. Artist tags: jazz.
artist_c: Candidate C. Connections: Gamma (41 recent plays; 127 lifetime plays; returned). Last.fm audience: 90000. Artist tags: folk.`;
  const value={picks:[{id:'artist_a',reason:'Björk returned to your rotation; Beta supplies a second listener connection.'},{id:'artist_b',reason:'Delta rose in your recent listening and links to this artist.'},{id:'artist_c',reason:'Gamma returned to your listening and connects here.'}]};
  assert.equal(validStructuredWriting('curate',value,facts),true);
  value.picks[0].reason='Delta connects to this artist through your recent listening.';
  assert.equal(validStructuredWriting('curate',value,facts),false);
  value.picks[0].reason='Björk connects here after 73 recent plays.';
  assert.equal(validStructuredWriting('curate',value,facts),false);
  value.picks[0].reason='Björk connects here after 40 recent plays.';
  assert.equal(validStructuredWriting('curate',value,facts),true);
});

test('only the observed singleton curator envelope is normalized',()=>{
  const value={picks:['artist_a','artist_b','artist_c'].map(id=>({id,reason:'Connected to a supplied seed.'}))};
  assert.deepEqual(normalizeStructuredWriting('curate',[value]),value);
  assert.equal(validStructuredWriting('curate',normalizeStructuredWriting('curate',[value]),'artist_a artist_b artist_c'),true);
  assert.equal(validStructuredWriting('curate',normalizeStructuredWriting('curate',[value,value]),'artist_a artist_b artist_c'),false);
  assert.deepEqual(normalizeStructuredWriting('profile',[value]),[value]);
});

test('parentheses in an actual seed artist name are preserved',()=>{
  const facts=['artist_a','artist_b','artist_c'].map(id=>`${id}: Candidate. Connections: Ghost (Sweden) (40 recent plays; 80 lifetime plays; returning). Last.fm audience: 1000. Artist tags: rock.`).join('\n');
  const value={picks:['artist_a','artist_b','artist_c'].map(id=>({id,reason:'Ghost (Sweden) returned to your listening and connects here.'}))};
  assert.equal(validStructuredWriting('curate',value,facts),true);
  value.picks[0].reason='Ghost returned to your listening and connects here.';
  assert.equal(validStructuredWriting('curate',value,facts),false);
});
