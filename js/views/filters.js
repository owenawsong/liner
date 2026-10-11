import { $, esc, num, toast } from '../ui.js';
import { mergedRows, rerender, go, hrefFor } from '../core.js';
import { getExclusions, setExclusion, exclusionKey, filterHistory } from '../filters.js';

export function exclusionPanelHTML(ctx){
  const items=getExclusions(ctx.pid),excluded=ctx.A?.exclusions?.excluded??filterHistory(mergedRows(ctx.archive),items).excluded;
  return `<section class="panel c-12 exclusion-panel" id="exclusions"><div class="panel__head"><div><h2>Keep your stats about your listening</h2><p class="muted">Exclude sleep music, background albums or a song you want to leave out. Your original history stays saved.</p></div><span class="label">${num(excluded)} plays excluded</span></div><details${items.length?' open':''}><summary>${items.length?`${items.length} counting ${items.length===1?'rule':'rules'}`:'Choose artists, albums or songs to exclude'}</summary><div class="exclusion-controls"><label>Look for<select class="input" id="exclusion-kind"><option value="artist">Artists</option><option value="album">Albums</option><option value="track">Songs</option></select></label><label>Search your full history<input class="input" id="exclusion-query" type="search" placeholder="Search a name…" autocomplete="off"></label></div><div id="exclusion-options"></div><div class="exclusion-saved">${items.map((item,i)=>`<div><span><b>${esc(item.name)}</b><small>${esc(item.artist||'Artist')} · excluded</small></span><button type="button" class="link" data-exclusion-restore="${i}">Count again</button></div>`).join('')}</div></details></section>`;
}
export function bindExclusions(ctx){
  const root=$('#exclusions');if(!root)return;
  const rows=mergedRows(ctx.archive),excluded=new Set(getExclusions(ctx.pid).map(exclusionKey));let choices=[];
  const paint=()=>{
    const kind=$('#exclusion-kind',root).value,q=$('#exclusion-query',root).value.toLocaleLowerCase('en').trim(),all=new Map();
    for(const row of rows){const name=kind==='artist'?row.artist:kind==='album'?row.album:row.track;if(!name)continue;const item={kind,name,artist:kind==='artist'?'':row.artist},key=exclusionKey(item);if(excluded.has(key))continue;const old=all.get(key);if(old)old.n++;else all.set(key,{...item,n:1});}
    choices=[...all.values()].filter(x=>!q||`${x.name} ${x.artist}`.toLocaleLowerCase('en').includes(q)).sort((a,b)=>b.n-a.n).slice(0,8);
    $('#exclusion-options',root).innerHTML=choices.length?choices.map((item,i)=>`<div class="exclusion-choice"><span><b>${esc(item.name)}</b><small>${esc(item.artist||'Artist')} · ${num(item.n)} plays in the archive</small></span><button type="button" class="link" data-exclusion-add="${i}">Exclude</button></div>`).join(''):'<p class="empty">No matching entries in the original history.</p>';
  };
  $('#exclusion-kind',root).addEventListener('change',paint);$('#exclusion-query',root).addEventListener('input',paint);
  root.addEventListener('click',async event=>{
    const add=event.target.closest('[data-exclusion-add]'),restore=event.target.closest('[data-exclusion-restore]');if(!add&&!restore)return;
    const item=add?choices[Number(add.dataset.exclusionAdd)]:getExclusions(ctx.pid)[Number(restore.dataset.exclusionRestore)];if(!item)return;
    try{setExclusion(ctx.pid,item,!!add);toast(add?'Excluded from this profile’s statistics.':'Counting those plays again.');rerender();}catch(error){toast(error.message,'bad');}
  });paint();
}
export function exclusionButton(kind,name,artist=''){
  return `<button type="button" class="link link--quiet detail-exclusion" data-exclude-kind="${kind}" data-exclude-name="${esc(name)}" data-exclude-artist="${esc(artist)}">Exclude from stats</button>`;
}
export function bindDetailExclusions(ctx){
  document.querySelectorAll('[data-exclude-kind]').forEach(button=>button.addEventListener('click',()=>{
    try{setExclusion(ctx.pid,{kind:button.dataset.excludeKind,name:button.dataset.excludeName,artist:button.dataset.excludeArtist});toast('Excluded from stats. Restore it in Data whenever you want.');go(hrefFor(ctx.pid,'data'));}catch(error){toast(error.message,'bad');}
  }));
}
