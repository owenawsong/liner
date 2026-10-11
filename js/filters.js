import { store, hash } from './ui.js';

const norm = value => String(value || '').normalize('NFKC').toLocaleLowerCase('en').trim().replace(/\s+/g, ' ');
export const exclusionKey = item => JSON.stringify([item.kind, norm(item.artist), norm(item.name)]);
const valid = item => item && ['artist', 'album', 'track'].includes(item.kind) && typeof item.name === 'string' && item.name.trim() && (item.kind === 'artist' || typeof item.artist === 'string' && item.artist.trim());
export function getExclusions(pid) {
  const saved=store.json(`liner.exclusions:${pid}`,[]);
  return (Array.isArray(saved)?saved:[]).filter(valid).slice(0,200);
}
export function exclusionsSignature(items) { return String(hash(items.map(exclusionKey).sort().join('\n'))); }
export function setExclusion(pid,item,excluded=true) {
  if(!valid(item))throw new Error('Choose a named artist, album or song.');
  const key=exclusionKey(item),items=getExclusions(pid).filter(x=>exclusionKey(x)!==key);
  if(excluded){if(items.length>=200)throw new Error('Restore an exclusion before adding another.');items.push({kind:item.kind,name:item.name.trim(),artist:item.kind==='artist'?'':item.artist.trim()});}
  store.setJson(`liner.exclusions:${pid}`,items);
  if(exclusionsSignature(getExclusions(pid))!==exclusionsSignature(items))throw new Error('This browser could not save the counting rule.');
  return items;
}
export function filterHistory(rows,items) {
  if(!items.length)return {rows,excluded:0};
  const artists=new Set(),tracks=new Set(),albums=new Set();
  for(const item of items){if(item.kind==='artist')artists.add(norm(item.name));else (item.kind==='track'?tracks:albums).add(JSON.stringify([norm(item.artist),norm(item.name)]));}
  const kept=rows.filter(row=>!artists.has(norm(row.artist))&&!tracks.has(JSON.stringify([norm(row.artist),norm(row.track)]))&&!albums.has(JSON.stringify([norm(row.artist),norm(row.album)])));
  return {rows:kept,excluded:rows.length-kept.length};
}
