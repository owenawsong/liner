import test from 'node:test';
import assert from 'node:assert/strict';
import { validStructuredWriting } from '../functions/lib/writing-quality.js';
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
