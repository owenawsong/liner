import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectWriting,writingErrorCode} from '../functions/lib/writing-output.js';
import {launchWritingCases} from './fixtures/writing-launch.mjs';
for(const fixture of launchWritingCases){
  test(`launch writing regression: ${fixture.id}`,()=>{
    const accepted=inspectWriting(fixture.task,JSON.stringify(fixture.valid),fixture.facts);
    assert.equal(accepted.code,null);assert.ok(accepted.text);
    assert.equal(inspectWriting(fixture.task,JSON.stringify(fixture.invalid),fixture.facts).code,'unsupported_output');
  });
}
test('format errors and unsupported claims have different failure causes',()=>{
  assert.equal(inspectWriting('year','Not JSON','Year: 2025').code,'invalid_response');
  assert.equal(inspectWriting('ask','{"text":null}','A was heard.').code,'invalid_response');
  assert.equal(writingErrorCode({budget:true,status:429}),'rate_limited');
  assert.equal(writingErrorCode({budget:true}),'budget_unavailable');
  assert.equal(writingErrorCode({name:'AbortError'}),'timeout');
  assert.equal(writingErrorCode({status:503}),'provider_unavailable');
});

test('curator listener overlap cannot establish sound, motivation or significant audience',()=>{
  const fixture=launchWritingCases.find(row=>row.task==='curate');
  for(const phrase of ['suggests renewed interest in their sound','indicates active exploration','is a natural extension of your taste','shares a significant Last.fm audience']){
    const proposed=structuredClone(fixture.valid);
    proposed.picks[0].reason=`Björk ${phrase}.`;
    assert.equal(inspectWriting('curate',JSON.stringify(proposed),fixture.facts).code,'unsupported_output');
  }
});
