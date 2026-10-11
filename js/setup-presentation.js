// Present measured import work separately from optional, concurrent enrichment.
const count = value => Math.max(0, Number.isFinite(Number(value)) ? Math.floor(Number(value)) : 0);
const format = value => count(value).toLocaleString('en-US');

export function historySetupState(job) {
  const done = count(job?.done), total = count(job?.total);
  const paused = ['error', 'cancelled'].includes(job?.state);
  const saving = job?.phase === 'saving' || job?.state === 'done';
  const progress = total ? Math.min(100, Math.floor(done / total * 100)) : null;
  return {
    paused, phase: saving ? 'saving' : 'reading', progress: saving ? 100 : progress,
    title: paused ? 'Your import is paused' : saving ? 'Saving your listening history' : job?.phase === 'resuming' ? 'Continuing your saved import' : 'Reading your listening history',
    detail: paused ? (job.error || 'Resume from the last saved page when you are ready.') : saving ? `${format(done)} plays read. Your profile is next.` : total ? `${format(done)} of ${format(total)} plays read` : 'Checking how much history is available…',
    ariaText: total ? `${format(done)} of ${format(total)} plays read` : 'Checking the size of your history',
  };
}

const stageLabels = {
  metadata: {waiting:'Queued',running:'Checking',done:'Ready',unavailable:'Some artist details unavailable',skipped:'No matches to check'},
  notes: {waiting:'Queued',running:'Writing from your measured findings',done:'Ready',unavailable:'Calculated findings ready · writing unavailable',skipped:'Calculated findings ready'},
  recommendations: {waiting:'Queued',running:'Checking your next records',done:'Ready',unavailable:'Not ready yet · retry in Discover',skipped:'Not enough listening to build picks'},
};
export function preparationSetupState(job) {
  const stages = ['metadata','notes','recommendations'].map(id => {
    const status = stageLabels[id][job?.stages?.[id]] ? job.stages[id] : 'waiting';
    const actual = id === 'metadata' && job?.metadata?.total && status === 'running'
      ? `${format(job.metadata.done)} of ${format(job.metadata.total)} checks complete` : '';
    return {id,status,label:stageLabels[id][status],detail:actual || job?.stageDetails?.[id] || ''};
  });
  const completed = stages.filter(stage => ['done','unavailable','skipped'].includes(stage.status)).length;
  return {stages,completed,summary:completed===3?'Preparation finished':`${completed} of 3 steps finished`,resumed:!!job?.resumed};
}
