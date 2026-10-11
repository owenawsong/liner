// Opt-in, synthetic-only provider benchmark. Credentials never enter reports.
// node scripts/ai-evaluate.mjs [--models=id,id] [--tasks=profile,curate] [--output=path]
import { readFile, writeFile } from 'node:fs/promises';
import { TASKS, STYLE } from '../functions/api/ai.js';
import { normalizeStructuredWriting, validStructuredWriting } from '../functions/lib/writing-quality.js';

const option = name => process.argv.find(x => x.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const models = (option('models') || 'dots-studio/dots-3-note-preview:free,nvidia/nemotron-3-ultra-550b-a55b:free,thinkingmachines/inkling:free,google/gemma-4-26b-a4b-it:free,google/gemma-4-31b-it:free').split(',');
const tasks = (option('tasks') || 'profile,curate').split(',');
if (models.length * tasks.length > 12 || tasks.some(x => !['profile','curate','notes'].includes(x))) throw new Error('At most 12 synthetic requests; allowed tasks: profile, curate, notes.');
const secrets = process.env.OPENROUTER_API_KEY ? '' : await readFile(process.env.SLEEVE_DEV_VARS || 'C:/Users/Owen/.sleeve/dev/.dev.vars', 'utf8');
const key = process.env.OPENROUTER_API_KEY || secrets.match(/^OPENROUTER_API_KEY\s*=\s*["']?([^"'\r\n]+)/m)?.[1]?.trim();
if (!key) throw new Error('Private OPENROUTER_API_KEY not configured.');
const baselineProfile = `Synthetic listener; no real listening history. Coverage: January 2023 through September 2026.
Evidence ID="return_alpha". Artist: Alpha. Returned after 120 days absent. Before gap: 86 plays. Latest return: 41 plays across 12 days. This is a return, not a new discovery.
Evidence ID="enduring_beta". Artist: Beta. 620 recorded plays across 24 active months; heard in 2023, 2024, 2025 and 2026. The latest 90 days include 38 plays.
Evidence ID="retained_gamma". Artist: Gamma. First heard March 2026 with 29 plays in first 30 days, and 35 plays in following 60 days. An initial discovery continued beyond its first month.
Evidence ID="change_delta". Artist: Delta. Two complete equal 90 day windows: previous 9 plays, 2% artist share; current 73 plays, 14% share. Nonzero previous listening is not a discovery.
Year 2025: monthly leaders: January Beta, February Alpha, March Beta. Recorded months only; do not infer other months.
Era artist: Beta. May to August 2025; 104 plays across those months; leadership was interrupted by Alpha in June.`;
const baselineCurate = `Synthetic listener. Older favorite: Beta, 620 plays. Recent rising artist: Delta, 73 plays. Retained discovery: Gamma, 35 plays. Alpha returned with 41 plays.
artist_a: Candidate A. Supplied tags: alternative, dream pop. Connections: Beta (older favorite); Gamma (retained discovery).
artist_b: Candidate B. Supplied tags: jazz, instrumental. Connections: Delta (recent rising artist).
artist_c: Candidate C. Supplied tags: folk, alternative. Connections: Alpha (returning artist); Beta (older favorite).
artist_d: Candidate D. Supplied tags: dream pop. Connections: Gamma (retained discovery).
artist_e: Candidate E. Supplied tags: jazz. Connections: Delta (recent rising artist); Beta (older favorite).
artist_f: Candidate F. Supplied tags: electronic. Connections: Alpha (returning artist).
These candidates have no recorded listening. Select only the supplied IDs.`;
const fixture = option('fixture') || 'baseline';
const profile = fixture === 'contrast' ? `Synthetic listener; no real listening history. Coverage is a partial archive.
Evidence ID="shift_alpha":
Alpha declined from 160 plays and 32% share in the previous complete 90 days to 40 plays and 8% share in the latest complete 90 days. Alpha was still heard on 18 latest days. Delta rose from 9 plays and 2% share to 73 plays and 14% share across the same windows. These are different artists; Alpha did not rise or disappear, and Delta was not a first discovery.
Evidence ID="return_gamma":
Gamma returned after a 120 day absence, with 41 plays on 12 days following the gap. Prior listening included 86 plays. Gamma was already known; this is a return.
Evidence ID="retention_beta":
Beta was first recorded in February 2026, heard 29 times over the first 30 days and 35 times over the following 60 days. This discovery lasted beyond its first month.
Year summaries: 2026 has incomplete coverage. Known monthly leaders: February Beta, March Alpha, April Delta. No other month leaders supplied.
Eras: no reliably supported era.` : baselineProfile;
const curate = fixture === 'contrast' ? `Synthetic listener. Recent means the latest 90 days. Seeds: Alpha: 40 recent plays; declining share; Gamma: 41 recent plays; returned after gap; Delta: 73 recent plays; rising share; Beta: 35 recent plays; retained discovery.
Candidates (all absent from this listening history):
artist_a: Candidate A. Connections: Alpha (40 recent plays; 600 lifetime plays; declining share); Beta (35 recent plays; 64 lifetime plays; retained discovery). Last.fm audience: 180000. Artist tags: alternative, dream pop.
artist_b: Candidate B. Connections: Delta (73 recent plays; 82 lifetime plays; rising share). Last.fm audience: 25000. Artist tags: jazz, instrumental.
artist_c: Candidate C. Connections: Gamma (41 recent plays; 127 lifetime plays; returned after gap); Alpha (40 recent plays; 600 lifetime plays; declining share). Last.fm audience: 90000. Artist tags: folk, alternative.
artist_d: Candidate D. Connections: Beta (35 recent plays; 64 lifetime plays; retained discovery). Last.fm audience: 7000. Artist tags: dream pop.
artist_e: Candidate E. Connections: Delta (73 recent plays; 82 lifetime plays; rising share); Alpha (40 recent plays; 600 lifetime plays; declining share). Last.fm audience: 60000. Artist tags: jazz.
artist_f: Candidate F. Connections: Gamma (41 recent plays; 127 lifetime plays; returned after gap). Last.fm audience: 5000. Artist tags: electronic.` : baselineCurate;
const catalogue = (await (await fetch('https://openrouter.ai/api/v1/models')).json()).data;
const rows = []; let lastStarted = 0;
const numericGrounding = (text, facts) => {
  const numbers = s => [...s.matchAll(/\b\d[\d,]*(?:\.\d+)?\b/g)].map(x=>x[0].replaceAll(',',''));
  const allowed = new Set(numbers(facts)); return numbers(text).every(x=>allowed.has(x));
};
for (const model of models) {
  const listed = catalogue.find(x => x.id === model);
  if (!listed || +listed.pricing.prompt !== 0 || +listed.pricing.completion !== 0) { rows.push({model,status:'skipped: not a listed free model'}); continue; }
  for (const task of tasks) {
    await new Promise(resolve => setTimeout(resolve, Math.max(0, 3300 - (Date.now() - lastStarted))));
    const facts = task === 'curate' ? curate : profile;
    const formatted = task !== 'notes' && listed.supported_parameters.includes('response_format');
    const reasoning = listed.reasoning?.mandatory ? {effort:'minimal',exclude:true} : {enabled:false};
    const payload = {model, messages:[{role:'system',content:STYLE},{role:'user',content:TASKS[task].prompt(facts)}], max_tokens:1800, temperature:0.35, top_p:0.9, provider:{data_collection:'deny',...(formatted?{require_parameters:true}:{})},
      ...(formatted?{response_format:{type:'json_object'}}:{}), ...(listed.supported_parameters.includes('reasoning')?{reasoning}:{})};
    lastStarted = Date.now(); const row = {model,task,jsonMode:formatted,reasoning:listed.reasoning||null};
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',signal:AbortSignal.timeout(25000),headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','X-Title':'Sleeve synthetic evaluation'},body:JSON.stringify(payload)});
      row.ms = Date.now()-lastStarted; row.status=res.status;
      const data=await res.json();
      if (!res.ok) row.error=String(data.error?.message || 'Provider request failed').replaceAll(key,'[redacted]').slice(0,400);
      else {
        row.servedModel=data.model; row.provider=data.provider; row.finish=data.choices?.[0]?.finish_reason; row.usage=data.usage;
        const output=String(data.choices?.[0]?.message?.content||'').replace(/<think>[\s\S]*?<\/think>/gi,'').trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i,'$1').trim();
        row.output=output; row.groundedNumbers=numericGrounding(output,facts);
        try { row.structured=task==='notes'||validStructuredWriting(task,normalizeStructuredWriting(task,JSON.parse(output)),facts); } catch { row.structured=false; }
        row.accepted=output.length>=20&&row.groundedNumbers&&row.structured;
      }
    } catch (error) { row.ms=Date.now()-lastStarted;row.status=error.name==='TimeoutError'?'timeout':'network';row.error=String(error.message).replaceAll(key,'[redacted]').slice(0,200); }
    rows.push(row); console.log(JSON.stringify({...row,output:undefined,usage:undefined,reasoning:undefined}));
    // A privacy route rejection applies to all tasks; do not waste another attempt.
    if (row.status===404 && /data policy|data collection|privacy|No endpoints/i.test(row.error||'')) break;
  }
}
const report={at:new Date().toISOString(),syntheticOnly:true,fixture,dataCollection:'deny',attempts:rows.filter(x=>x.task).length,rows};
if(option('output')) await writeFile(option('output'),JSON.stringify(report,null,2)+'\n');
else console.log(JSON.stringify(report,null,2));
