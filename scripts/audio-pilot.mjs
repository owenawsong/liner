import {readFile,writeFile} from 'node:fs/promises';
import {sampleArchive} from '../js/sources/demo.js';
import {analyze} from '../js/analysis.js';
import {newAudioAudit,runAudioAudit,recordingSearchURL,selectRecording,audioJSON} from '../js/audio-coverage.js';
const path=new URL('../docs/audio-pilot.json',import.meta.url),A=analyze(sampleArchive());
let audit;try{audit=JSON.parse(await readFile(path,'utf8'));if(audit.version!=='audio-v1')audit=null;}catch{}
audit||=newAudioAudit(A);
const controller=new AbortController();process.on('SIGINT',()=>controller.abort());
let previous=0;
const lookup=async(track,signal)=>{const wait=Math.max(0,previous+1100-Date.now());if(wait)await new Promise(r=>setTimeout(r,wait));previous=Date.now();const data=await audioJSON(recordingSearchURL(track),{signal,headers:{'User-Agent':'SleeveCoveragePilot/1.0 (local research; https://musicbrainz.org/doc/About)'},timeout:12000});return selectRecording(track,data);};
let shown=0;
await runAudioAudit(A,audit,{signal:controller.signal,lookup,checkpoint:async value=>writeFile(path,JSON.stringify({...value,pilot:{date:'2026-09-30',persona:'Sleeve generated demonstration history',requestedTracks:100,availableTracks:audit.tracks.length,plays:A.plays,from:A.from,to:A.to,identityPolicy:'unique exact title, complete credited artist, exact source album, alternate-version rejection'}},null,2)+'\n'),onProgress:value=>{const n=Object.keys(value.items).length;if(n!==shown&&(n%10===0||n===value.tracks.length)){shown=n;console.log(`${n}/${value.tracks.length} recording identities checked`);}}});
const {estimates,years,keys,...counts}=audit.summary;console.log(JSON.stringify(counts,null,2));
