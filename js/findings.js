// Findings describe observed listening, never an inferred emotion or audio feature.
import { lowerBound } from './analysis.js';
import { hash, num } from './ui.js';

const DAY=864e5, WEEK=7*DAY, WINDOW=90*DAY;
const percent=n=>(n*100).toFixed(1);
const month=t=>new Date(t).toLocaleDateString('en',{month:'short',year:'numeric'});
const bump=(map,key)=>map.set(key,(map.get(key)||0)+1);
const timeIndex=(times,t)=>{let lo=0,hi=times.length;while(lo<hi){const mid=(lo+hi)>>1;if(times[mid]<t)lo=mid+1;else hi=mid;}return lo;};
const canon=s=>String(s||'').normalize('NFKC').toLocaleLowerCase('en');
const row=(id,family,score,label,title,detail,basis,artists=[],extra={})=>({id,family,score,label,title,detail,basis,artists,...extra,facts:[title,detail,basis,...(extra.stats||[]).map(x=>x.join(': '))].join('\n')});

// A greedy report selection keeps different observations and different artists
// together. If a record supports only one artist, it returns fewer findings.
export function selectFindings(evidence,{limit=6,excludeArtists=[],excludeFamilies=[]}={}) {
  const artists=new Set([...excludeArtists].map(canon)),families=new Set(excludeFamilies),ids=new Set(),chosen=[];
  const candidates=[...evidence].filter(x=>x?.title&&Number.isFinite(x.score??0)).sort((a,b)=>(b.score||0)-(a.score||0)||String(a.id).localeCompare(String(b.id)));
  for(const entry of candidates){
    const names=entry.artists||[entry.target?.kind==='artist'?entry.target.name:entry.target?.artist].filter(Boolean);
    if(ids.has(entry.id)||families.has(entry.family||entry.id)||names.some(name=>artists.has(canon(name))))continue;
    chosen.push(entry);ids.add(entry.id);families.add(entry.family||entry.id);names.forEach(name=>artists.add(canon(name)));
    if(chosen.length>=Math.max(0,limit))break;
  }
  return limit>0?chosen:[];
}

export function deeperFindings(A) {
  if(!A?.rows?.length||A.plays<12)return [];
  const end=A.to+1,span=A.to-A.from,entries=[];
  const byArtist=new Map(),albums=new Map();
  const windowCount=Math.ceil(span/WINDOW)+1,totals=new Array(windowCount).fill(0);
  for(const r of A.rows){
    let a=byArtist.get(r.artist);if(!a){a={months:new Map(),weeks:new Map(),days:new Set(),windows:new Array(windowCount).fill(0)};byArtist.set(r.artist,a);}
    const d=new Date(r.t),mi=d.getFullYear()*12+d.getMonth(),wi=Math.floor((r.t-A.from)/WEEK),di=d.toDateString();
    bump(a.months,mi);a.days.add(di);
    const week=a.weeks.get(wi)||{n:0,days:new Set(),first:r.t,last:r.t};week.n++;week.days.add(di);week.last=r.t;a.weeks.set(wi,week);
    const period=Math.floor((end-1-r.t)/WINDOW);a.windows[period]++;totals[period]++;
    if(r.album){const key=`${r.artist}\u0000${r.album}`;let album=albums.get(key);if(!album){album={artist:r.artist,album:r.album,n:0,tracks:new Map(),days:new Set()};albums.set(key,album);}album.n++;bump(album.tracks,r.track);album.days.add(di);}
  }

  // Returns require multiple new plays and continued recording during the gap.
  const returns=[];
  for(const a of A.artists){if(a.n<15)continue;const episodes=[];
    for(let i=1;i<a.times.length;i++){
      const gap=a.times[i]-a.times[i-1];if(gap<90*DAY)continue;
      const resumed=a.times[i],to=resumed+30*DAY,count=timeIndex(a.times,to)-i;
      const days=new Set(a.times.slice(i,i+count).map(t=>new Date(t).toDateString())).size;
      const recordedGap=lowerBound(A.rows,resumed)-lowerBound(A.rows,a.times[i-1]+1);
      if(count>=3&&days>=2&&recordedGap>=30)episodes.push({gap:Math.floor(gap/DAY),resumed,count,days,recordedGap,previous:a.times[i-1]});
    }
    if(episodes.length)returns.push({a,episodes,lead:episodes.at(-1)});
  }
  returns.sort((a,b)=>b.episodes.length-a.episodes.length||b.lead.resumed-a.lead.resumed);
  for(const {a,episodes,lead} of returns.slice(0,5))entries.push(row(`return_${hash(a.name)}`,'returns',87+Math.min(8,episodes.length*2),'Back in rotation',`${a.name} returned after ${lead.gap} days`,
    `${num(lead.count)} plays on ${lead.days} days followed the return in ${month(lead.resumed)}. ${num(lead.recordedGap)} other plays were recorded during the gap${episodes.length>1?`; this artist has ${episodes.length} supported returns after gaps of at least 90 days`:''}.`,
    'A gap between recorded plays, followed by repeated listening within 30 days. It does not establish that you stopped listening elsewhere.',[a.name],{target:{kind:'artist',name:a.name},visual:{kind:'return',from:lead.previous,to:lead.resumed,gapDays:lead.gap,plays:lead.count,episodes:episodes.map(e=>({at:e.resumed,gapDays:e.gap,plays:e.count}))}}));

  // First-recorded cohorts are given a full 90 days to mature; fresh discoveries
  // and artists at the archive boundary cannot dilute the denominator.
  if(span>=180*DAY){
    const mature=A.artists.filter(a=>a.first>=Math.max(A.from+7*DAY,end-365*DAY)&&a.first<=end-90*DAY);
    const held=mature.filter(a=>{const m=byArtist.get(a.name).months;return [...m.values()].filter(n=>n>=3).length>=3&&a.last>=end-90*DAY;});
    if(mature.length>=3){const lead=held[0],rate=held.length/mature.length;
      entries.push(row('retention','retention',83+Math.min(6,mature.length/10),'Discoveries that lasted',`${held.length} of ${mature.length} discoveries stayed in rotation`,
        `${percent(rate)}% of eligible artists first recorded in the last year were played at least three times in three different calendar months and heard in the latest 90 days${lead?`. ${lead.name} is the most-played of these, with ${num(lead.n)} recorded plays`:''}.`,
        'Only discoveries with 90 days of follow-up qualify. The first seven archive days are excluded; earlier listening outside this record is unknown.',lead?[lead.name]:[],{target:lead?{kind:'artist',name:lead.name}:null,stats:[['Lasting discoveries',String(held.length)],['Eligible discoveries',String(mature.length)]],visual:{kind:'cohort',kept:held.length,total:mature.length,artists:held.slice(0,5).map(a=>({name:a.name,plays:a.n,months:[...byArtist.get(a.name).months.values()].filter(n=>n>=3).length}))}}));
    }
  }

  // A concentrated run is measured by calendar weeks and active days, not a
  // claim about attachment, mood, or uninterrupted daily listening.
  for(const a of A.artists.filter(a=>a.n>=20).slice(0,150)){
    const bins=byArtist.get(a.name).weeks,peak=[...bins].sort((x,y)=>y[1].n-x[1].n)[0];if(!peak)continue;
    const [key,best]=peak,share=best.n/a.n;if(best.n<15||best.days.size<3||share<.35)continue;
    let left=key,right=key;while((bins.get(left-1)?.n||0)>=3)left--;while((bins.get(right+1)?.n||0)>=3)right++;
    const active=[...bins].filter(([k])=>k>=left&&k<=right),runN=active.reduce((n,[,b])=>n+b.n,0),days=new Set();
    for(const [,bucket] of active)for(const day of bucket.days)days.add(day);
    const runWeeks=right-left+1;
    entries.push(row(`run_${hash(a.name)}`,'concentration',81+Math.min(9,share*10),'A concentrated run',`${a.name}: ${runN} plays across ${runWeeks} ${runWeeks===1?'week':'weeks'}`,
      `${percent(share)}% of all their recorded plays fell in the busiest seven-day bucket, starting ${month(A.from+key*WEEK)}. The surrounding run contains ${days.size} active listening days.`,
      'Weeks are equal seven-day buckets anchored at your first saved play. A run consists of adjacent buckets with at least three artist plays.',[a.name],{target:{kind:'artist',name:a.name},visual:{kind:'series',unit:'plays',points:active.map(([k,b])=>({at:A.from+k*WEEK,value:b.n})),peakShare:share,durationDays:runWeeks*7}}));
  }

  // Enduring favorites require real support across years, not one play on
  // either side of New Year's Eve.
  if(span>=700*DAY)for(const a of A.artists.slice(0,100)){
    const years=new Map();for(const [mi,n] of byArtist.get(a.name).months)years.set(Math.floor(mi/12),(years.get(Math.floor(mi/12))||0)+n);
    const supported=[...years].filter(([,n])=>n>=10);if(supported.length<3||a.last<end-180*DAY)continue;
    entries.push(row(`enduring_${hash(a.name)}`,'enduring',86+Math.min(7,supported.length),'Still part of your listening',`${a.name}, across ${supported.length} recorded years`,
      `${num(a.n)} recorded plays overall, with at least ten plays in each of those years. Their latest recorded play was in ${month(a.last)}.`,
      'Measured years may be incomplete. This describes recorded persistence, not an opinion rating.',[a.name],{target:{kind:'artist',name:a.name},visual:{kind:'series',unit:'plays',points:supported.map(([year,value])=>({label:String(year),value,at:new Date(year,0,1).getTime()}))}}));
  }

  // Compare recent share changes with that artist's own earlier changes, using
  // only non-overlapping periods with sufficient recorded support.
  if(span>=450*DAY&&totals[0]>=30&&totals[1]>=30){
    for(const a of A.artists.slice(0,150)){
      const counts=byArtist.get(a.name).windows,now=counts[0]/totals[0],before=counts[1]/totals[1],delta=now-before;
      if(counts[0]<20||delta<.08)continue;
      const past=[];for(let i=2;i<windowCount-1;i++)if(totals[i]>=30&&totals[i+1]>=30&&end-(i+2)*WINDOW>=A.from)past.push(counts[i]/totals[i]-counts[i+1]/totals[i+1]);
      if(past.length<3)continue;const max=Math.max(0,...past);if(delta<max+.03)continue;
      entries.push(row(`unusual_${hash(a.name)}`,'personal-change',95,'A change outside your usual pattern',`The rise of ${a.name} exceeds their earlier shifts`,
        `Their share rose from ${percent(before)}% to ${percent(now)}% across the latest two recorded 90-day periods: ${percent(delta)} percentage points. The largest earlier increase among ${past.length} supported comparisons was ${percent(max)} points.`,
        'Compared with this artist in your own earlier non-overlapping 90-day periods, each containing at least 30 recorded plays. Missing history can affect the baseline.',[a.name],{target:{kind:'artist',name:a.name},comparison:{before:counts[1],now:counts[0]},visual:{kind:'baseline',recent:delta*100,previousMax:max*100,comparisons:past.length}}));
    }
  }

  // Album breadth says how much of the observed album was explored. There is
  // no track catalogue or completion percentage in a scrobble archive.
  const explored=[...albums.values()].filter(a=>a.n>=15&&a.tracks.size>=4&&a.days.size>=3).sort((a,b)=>b.tracks.size-a.tracks.size||b.n-a.n);
  for(const a of explored.slice(0,8)){
    const tracks=[...a.tracks].sort((x,y)=>y[1]-x[1]),lead=tracks[0],share=lead[1]/a.n;
    entries.push(row(`album_${hash(`${a.artist}:${a.album}`)}`,'album-breadth',85+Math.min(7,a.tracks.size/2),'Beyond the single',`${a.tracks.size} different songs from ${a.album}`,
      `${num(a.n)} plays across ${a.days.size} days. ${lead[0]} accounts for ${percent(share)}% of the album's recorded plays${share<.4?'; listening is spread beyond its leading song':''}.`,
      'Distinct track titles attached to this album in the imported record. Editions and inconsistent album labels may split counts; album completion is unknown.',[a.artist],{target:{kind:'album',name:a.album,artist:a.artist},visual:{kind:'tracks',tracks:tracks.slice(0,8).map(([name,value])=>({name,value})),distinct:a.tracks.size,days:a.days.size}}));
  }
  return entries;
}
