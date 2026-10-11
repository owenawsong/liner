import test from 'node:test';
import assert from 'node:assert/strict';
import { historySetupState, preparationSetupState } from '../js/setup-presentation.js';

test('history progress remains indeterminate until the source reports a total',()=>{
  assert.equal(historySetupState(null).progress,null);
  assert.equal(historySetupState({done:20,total:0}).progress,null);
  const known=historySetupState({done:499,total:500});
  assert.equal(known.progress,99);
  assert.equal(known.detail,'499 of 500 plays read');
});

test('import recovery keeps saved counts and makes the resume state explicit',()=>{
  const paused=historySetupState({state:'error',done:500,total:2000,error:'Last.fm is temporarily unavailable.'});
  assert.equal(paused.paused,true);
  assert.equal(paused.progress,25);
  assert.equal(paused.detail,'Last.fm is temporarily unavailable.');
  const resumed=historySetupState({state:'running',phase:'resuming',done:500,total:2000});
  assert.equal(resumed.title,'Continuing your saved import');
  assert.equal(resumed.progress,25);
  assert.equal(historySetupState({phase:'saving',done:1800,total:1800}).title,'Saving your listening history');
});

test('concurrent preparation shows actual checks and completed stages, not estimated percent',()=>{
  const state=preparationSetupState({progress:87,resumed:true,stages:{metadata:'running',notes:'done',recommendations:'running'},metadata:{done:12,total:40},stageDetails:{recommendations:'Checking candidate album identities'}});
  assert.equal(state.summary,'1 of 3 steps finished');
  assert.equal(state.resumed,true);
  assert.equal(state.stages[0].detail,'12 of 40 checks complete');
  assert.equal(state.stages[2].detail,'Checking candidate album identities');
  assert.equal('progress' in state,false);
});

test('optional writing failures never claim that recommendations or exact stats failed',()=>{
  const state=preparationSetupState({stages:{metadata:'done',notes:'unavailable',recommendations:'done'}});
  assert.equal(state.completed,3);
  assert.match(state.stages[1].label,/Calculated findings ready/);
  assert.equal(state.stages[2].label,'Ready');
  assert.equal(preparationSetupState({stages:{notes:'skipped'}}).stages[1].label,'Calculated findings ready');
  assert.equal(preparationSetupState({stages:{notes:'skipped'},stageDetails:{notes:'Demo writing is already prepared'}}).stages[1].detail,'Demo writing is already prepared');
  assert.match(preparationSetupState({stages:{recommendations:'unavailable'}}).stages[2].label,/retry in Discover/);
});
