// Optional, explicitly requested sound audit. Identity first; coverage before charts.
export const AUDIO_VERSION='audio-v1';
const norm=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim();
const validId=s=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s||'');
const VERSION=/\b(live|remix|remixed|instrumental|karaoke|demo|acoustic|radio edit|alternate|re-recorded|sped up|slowed)\b/i;
const abort=()=>new DOMException('Audit paused','AbortError');
export const audioTrackKey=t=>`${norm(t.artist)}\u0000${norm(t.track)}\u0000${norm(t.album)}`;
const quote=s=>`"${String(s||'').replace(/[\\"]/g,'\\$&')}"`;
export const recordingSearchURL=t=>`https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(`recording:${quote(t.track)} AND artist:${quote(t.artist)}${t.album?` AND release:${quote(t.album)}`:''}`)}&fmt=json&limit=25`;

export function selectRecording(track,data) {
  const found=(data?.recordings||[]).filter(r=>{
    if(!validId(r.id)||Number(r.score)<95||norm(r.title)!==norm(track.track))return false;
    const credit=(r['artist-credit']||[]).map(c=>`${c.name||c.artist?.name||''}${c.joinphrase||''}`).join('');
    if(norm(credit)!==norm(track.artist))return false;
    const description=`${r.title} ${r.disambiguation||''}`;
    if(VERSION.test(description)&&!VERSION.test(`${track.track} ${track.album||''}`))return false;
    const sourceVersions=[...`${track.track} ${track.album||''}`.matchAll(new RegExp(VERSION.source,'gi'))].map(m=>m[0].toLowerCase());
    if(sourceVersions.length&&sourceVersions.some(version=>!description.toLowerCase().includes(version)))return false;
    if(track.album&&!(r.releases||[]).some(release=>norm(release.title)===norm(track.album)))return false;
    return true;
  });
  const unique=[...new Map(found.map(r=>[r.id,r])).values()];
  if(unique.length!==1)return {status:unique.length?'ambiguous':'unmatched',candidateCount:unique.length};
  const r=unique[0];return {status:'matched',mbid:r.id,title:r.title,artist:track.artist,album:track.album||'',length:r.length||null,sourceURL:`https://musicbrainz.org/recording/${r.id}`,verifiedBy:'exact title + full credited artist + source album; unique recording'};
}

const finite=(value,min,max)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max?value:null;
export function parseAudio(low,high,mbid) {
  const submittedIds=low?.metadata?.tags?.musicbrainz_recordingid;
  if(Array.isArray(submittedIds)&&submittedIds.length&&!submittedIds.some(id=>norm(id)===norm(mbid)))return {bpm:null,key:null,keyStrength:null,estimates:{},provenance:{source:'AcousticBrainz',recording:mbid,submissionOffset:0,rejected:'Submission recording identifier differs from the verified match'}};
  const bpm=finite(low?.rhythm?.bpm,30,300),strength=finite(low?.tonal?.key_strength,0,1);
  const key=low?.tonal?.key_key,scale=low?.tonal?.key_scale;
  const validKey=/^(?:[A-G](?:#|b)?)$/.test(key||'')&&['major','minor'].includes(scale)&&strength!=null&&strength>=.5;
  const estimates={};
  for(const [field,classifier,label] of [['happy','mood_happy','happy'],['acoustic','mood_acoustic','acoustic'],['electronic','mood_electronic','electronic'],['danceable','danceability','danceable']]){
    const value=high?.highlevel?.[classifier];const probability=finite(value?.all?.[label],0,1);
    if(probability!=null)estimates[field]={probability,model:value.version?.essentia||high.metadata?.version?.essentia||'AcousticBrainz classifier'};
  }
  return {bpm,key:validKey?`${key} ${scale}`:null,keyStrength:validKey?strength:null,estimates,
    provenance:{source:'AcousticBrainz',recording:mbid,submissionOffset:0,lowURL:`https://acousticbrainz.org/${mbid}`,analyzer:low?.metadata?.version?.essentia||null,sampleRate:finite(low?.metadata?.audio_properties?.sample_rate,8000,192000),submissionTags:low?.metadata?.tags||null}};
}

export async function audioJSON(url,{signal,fetcher=fetch,timeout=12000,headers={}}={}) {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout),stop=()=>controller.abort();
  signal?.addEventListener('abort',stop,{once:true});
  if(signal?.aborted){clearTimeout(timer);throw abort();}
  try{const r=await fetcher(url,{signal:controller.signal,headers});if(!r.ok){const e=new Error(`Source returned HTTP ${r.status}`);e.status=r.status;e.retryAfter=r.headers?.get('Retry-After')||r.headers?.get('X-RateLimit-Reset-In');throw e;}return await r.json();}
  catch(e){if(signal?.aborted)throw abort();throw e;}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',stop);}
}

export async function fetchAudioBatch(ids,options={}) {
  if(ids.length>25)throw new Error('AcousticBrainz batches may contain at most 25 recordings');
  const query=encodeURIComponent(ids.join(';'));
  const lowURL=`https://acousticbrainz.org/api/v1/low-level?recording_ids=${query}&features=rhythm.bpm;tonal.key_key;tonal.key_scale;tonal.key_strength;metadata.tags`;
  const highURL=`https://acousticbrainz.org/api/v1/high-level?recording_ids=${query}`;
  const low=await audioJSON(lowURL,options);
  let high={},highError=null;try{high=await audioJSON(highURL,options);}catch(e){if(options.signal?.aborted)throw e;highError=e.message;}
  return Object.fromEntries(ids.map(id=>{const lowDoc=low[id]?.['0'],highDoc=high[id]?.['0'];
    return [id,{status:lowDoc?'available':'missing',audio:lowDoc?parseAudio(lowDoc,highDoc,id):null,highStatus:highError?'error':highDoc?'available':'missing',highError,checkedAt:Date.now()}];}));
}

export function summarizeAudio(A,audit) {
  const items=Object.values(audit?.items||{}),matched=items.filter(x=>x.identity?.status==='matched'),covered=matched.filter(x=>x.sound?.status==='available'&&(x.sound.audio?.bpm!=null||x.sound.audio?.key));
  const map=new Map(covered.map(x=>[audioTrackKey(x.track),x.sound.audio]));
  let coveredPlays=0,bpmPlays=0,bpmSum=0,keyPlays=0;const years=new Map(),keys=new Map();
  for(const r of A.rows){const audio=map.get(audioTrackKey(r));if(!audio)continue;coveredPlays++;const year=new Date(r.t).getFullYear(),y=years.get(year)||{year,total:0,covered:0,bpmPlays:0,bpmSum:0};years.set(year,y);y.covered++;if(audio.bpm!=null){bpmPlays++;bpmSum+=audio.bpm;y.bpmPlays++;y.bpmSum+=audio.bpm;}if(audio.key){keyPlays++;keys.set(audio.key,(keys.get(audio.key)||0)+1);}}
  for(const r of A.rows){const year=new Date(r.t).getFullYear(),y=years.get(year);if(y)y.total++;}
  const ready=covered.length>=10&&coveredPlays>=Math.max(100,A.plays*.1);
  return {audited:items.length,selected:audit?.tracks?.length||0,matched:matched.length,ambiguous:items.filter(x=>x.identity?.status==='ambiguous').length,unmatched:items.filter(x=>x.identity?.status==='unmatched').length,errors:items.filter(x=>x.identity?.status==='error'||x.sound?.status==='error').length,
    audioTracks:covered.length,coveredPlays,totalPlays:A.plays,playCoverage:A.plays?coveredPlays/A.plays:0,ready,bpmTracks:covered.filter(x=>x.sound.audio.bpm!=null).length,keyTracks:covered.filter(x=>x.sound.audio.key).length,meanBpm:bpmPlays?bpmSum/bpmPlays:null,bpmPlays,keyPlays,
    years:[...years.values()].sort((a,b)=>a.year-b.year).map(y=>({...y,meanBpm:y.bpmPlays?y.bpmSum/y.bpmPlays:null,coverage:y.total?y.covered/y.total:0,bpmCoverage:y.total?y.bpmPlays/y.total:0,ready:y.bpmPlays>=30&&y.bpmPlays/y.total>=.2})),keys:[...keys].sort((a,b)=>b[1]-a[1]),estimates:covered.filter(x=>Object.keys(x.sound.audio.estimates||{}).length).map(x=>({track:x.track,...x.sound.audio.estimates}))};
}

export function newAudioAudit(A) {
  // Separate album labels, rather than incorrectly applying one recording match
  // to every play of the same title and artist across alternate albums.
  const counts=new Map();for(const r of A.rows){const key=audioTrackKey(r),t=counts.get(key)||{artist:r.artist,track:r.track,album:r.album||'',plays:0};t.plays++;counts.set(key,t);}
  return {version:AUDIO_VERSION,startedAt:Date.now(),state:'idle',tracks:[...counts.values()].sort((a,b)=>b.plays-a.plays).slice(0,100),items:{}};
}

export async function runAudioAudit(A,audit,{signal,onProgress=()=>{},checkpoint=async()=>{},lookup,audioLookup=fetchAudioBatch}={}) {
  const identityLookup=lookup||((track,s)=>import('./meta.js').then(m=>m.recordingForTrack(track,s)));
  audit.state='running';audit.error=null;await checkpoint(audit);
  try{
    for(const track of audit.tracks){if(signal?.aborted)throw abort();const key=audioTrackKey(track),saved=audit.items[key];if(saved?.identity&&saved.identity.status!=='error')continue;
      let identity;try{identity=await identityLookup(track,signal);}catch(e){if(signal?.aborted)throw e;identity={status:'error',error:e.message};}
      audit.items[key]={track,identity,at:Date.now()};onProgress(audit);await checkpoint(audit);
    }
    const needing=Object.values(audit.items).filter(x=>x.identity.status==='matched'&&(!x.sound||x.sound.status==='error'||x.sound.highStatus==='error'));
    for(let i=0;i<needing.length;i+=25){if(signal?.aborted)throw abort();const batch=needing.slice(i,i+25),ids=[...new Set(batch.map(x=>x.identity.mbid))];
      try{const data=await audioLookup(ids,{signal});for(const x of batch)x.sound=data[x.identity.mbid]||{status:'missing'};}
      catch(e){if(signal?.aborted)throw e;for(const x of batch)x.sound={status:'error',error:e.message};}
      onProgress(audit);await checkpoint(audit);
    }
    audit.state='done';audit.completedAt=Date.now();
  }catch(e){audit.state=signal?.aborted?'paused':'error';audit.error=e.message;}
  audit.summary=summarizeAudio(A,audit);await checkpoint(audit);onProgress(audit);return audit;
}
