import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import {createWorker,videoEmbed,validateTrip} from '../worker/server.mjs';
import defaultTrip from '../web/trip.mjs';

async function fixture(){
  const sqlite=new DatabaseSync(':memory:');
  for(const file of (await readdir(new URL('../drizzle/',import.meta.url))).filter(f=>/^\d+.*\.sql$/.test(f)).sort())sqlite.exec(await readFile(new URL('../drizzle/'+file,import.meta.url),'utf8'));
  const objects=new Map();
  const env={DB:{prepare(sql){let args=[];return {bind(...v){args=v;return this;},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async run(){return sqlite.prepare(sql).run(...args);}};}},BUCKET:{async put(key,stream){objects.set(key,new Uint8Array(await new Response(stream).arrayBuffer()));},async delete(key){objects.delete(key);},async get(key,options){const b=objects.get(key);if(!b)return null;const range=options?.range?.get('range');let start=0,end=b.length-1;if(range){const m=range.match(/bytes=(\d+)-(\d*)/);if(m){start=Number(m[1]);if(m[2])end=Math.min(end,Number(m[2]));}}return {body:b.slice(start,end+1),size:b.length,httpEtag:'"test"',...(range?{range:{offset:start,length:end-start+1}}:{})};},async head(key){const b=objects.get(key);return b?{size:b.length,httpEtag:'"test"'}:null;}}};
  env.DB.batch=async statements=>{sqlite.exec('BEGIN');try{const out=[];for(const statement of statements)out.push(await statement.run());sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}};
  const worker=createWorker({assets:{'/':{body:'<h1>Unser Vietnam</h1>',type:'text/html'}},defaultTrip});
  const call=(path,options={},identity='leo')=>{const headers=new Headers(options.headers);if(identity){headers.set('oai-authenticated-user-id',identity);headers.set('oai-authenticated-user-full-name',identity==='leo'?'Leo':'Mama');}return worker.fetch(new Request('https://family.example'+path,{...options,headers}),env);};
  return {call,env,objects,sqlite,worker};
}
const json=(method,body)=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});

test('Private API rejects anonymous access and cross-origin writes',async()=>{
  const {call}=await fixture();assert.equal((await call('/api/state',{},null)).status,401);
  const cross=json('POST',{id:'day-1-0',done:true});cross.headers.Origin='https://untrusted.example';assert.equal((await call('/api/quests',cross)).status,403);
  assert.equal((await call('/')).status,200);
});
test('Plan updates survive another visitor and reject conflicting edits',async()=>{
  const {call}=await fixture();const first=await(await call('/api/state')).json();assert.equal(first.trip.days.length,14);assert.equal(first.revision,0);
  const trip=structuredClone(first.trip);trip.title='Unsere Familienreise';trip.startDate='2027-03-20';
  const save=await call('/api/plan',json('PUT',{trip,revision:0}));assert.equal(save.status,200);const saved=await save.json();assert.equal(saved.trip.endDate,'2027-04-02');assert.equal(saved.revision,1);
  const another=await(await call('/api/state',{},'mama')).json();assert.equal(another.trip.title,'Unsere Familienreise');
  assert.equal((await call('/api/plan',json('PUT',{trip,revision:0}))).status,409);
  trip.startDate='2027-02-31';assert.equal((await call('/api/plan',json('PUT',{trip,revision:1}))).status,400);
});
test('Quest completion is shared and unknown quest IDs cannot be injected',async()=>{
  const {call}=await fixture();assert.equal((await call('/api/quests',json('POST',{id:'day-8-0',done:true}))).status,200);
  assert.ok((await(await call('/api/state',{},'mama')).json()).checks.includes('day-8-0'));
  assert.equal((await call('/api/quests',json('POST',{id:'invented',done:true}))).status,400);
  await call('/api/quests',json('POST',{id:'day-8-0',done:false}));assert.equal((await(await call('/api/state')).json()).checks.length,0);
});
test('Photo uploads persist, stream to another member, and only the author can delete',async()=>{
  const {call,objects}=await fixture();
  const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhE0AAAAASUVORK5CYII=','base64');
  const form=new FormData();form.set('file',new File([bytes],'familie.png',{type:'image/png'}));form.set('day','8');form.set('title','Sơn Trà');form.set('caption','Unser erster Tiermoment');form.set('author','Leo');
  const upload=await call('/api/media',{method:'POST',body:form});assert.equal(upload.status,201);const {id}=await upload.json();assert.equal(objects.size,1);
  const state=await(await call('/api/state',{},'mama')).json();assert.equal(state.media[0].title,'Sơn Trà');assert.equal(state.media[0].canDelete,false);assert.equal(state.media[0].object_key,undefined);
  const image=await call('/api/media/'+id,{},'mama');assert.equal(image.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await image.arrayBuffer()),bytes);
  const partial=await call('/api/media/'+id,{headers:{Range:'bytes=0-7'}});assert.equal(partial.status,206);assert.equal(partial.headers.get('content-range'),'bytes 0-7/'+bytes.length);assert.equal((await partial.arrayBuffer()).byteLength,8);
  assert.equal((await call('/api/media/'+id,{method:'DELETE'},'mama')).status,403);
  assert.equal((await call('/api/media/'+id,{method:'DELETE'})).status,200);assert.equal(objects.size,0);assert.equal((await call('/api/media/'+id)).status,404);
});
test('Vlogs support validated MP4 and privacy-preserving external video links',async()=>{
  const {call}=await fixture();const mp4=new Uint8Array([0,0,0,24,102,116,121,112,105,115,111,109,0,0,0,0]);
  const form=new FormData();form.set('file',new File([mp4],'vlog.mp4',{type:'video/mp4'}));form.set('day','12');form.set('title','Früchte-Vlog');
  assert.equal((await call('/api/media',{method:'POST',body:form})).status,201);
  const link=await call('/api/media',json('POST',{url:'https://youtu.be/dQw4w9WgXcQ',day:12,title:'Langer Vlog'}));assert.equal(link.status,201);
  const state=await(await call('/api/state')).json();assert.equal(state.media.length,2);assert.ok(state.media.some(m=>m.kind==='link'&&m.embed==='https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'));
  assert.equal((await call('/api/media',json('POST',{url:'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',day:12}))).status,400);
});
test('Unsupported or disguised file types and invalid day values are rejected',async()=>{
  const {call,objects}=await fixture();
  for(const type of ['image/svg+xml','image/jpeg']){const form=new FormData();form.set('file',new File(['<svg onload="alert(1)"></svg>'],'evil.jpg',{type}));form.set('day','8');assert.equal((await call('/api/media',{method:'POST',body:form})).status,415);}
  assert.equal((await call('/api/media',json('POST',{url:'https://vimeo.com/12345',day:99}))).status,400);assert.equal(objects.size,0);
});
test('Safe defaults and hotel validation remain consistent',()=>{
  assert.equal(videoEmbed('javascript:alert(1)'),null);assert.equal(videoEmbed('https://user:pass@youtu.be/dQw4w9WgXcQ'),null);
  assert.equal(validateTrip(defaultTrip,defaultTrip).hotel.stars,5);
  const trip=structuredClone(defaultTrip);trip.hotel.url='javascript:alert(1)';assert.throws(()=>validateTrip(trip,defaultTrip));
});

test('Fruit counter is shared and counts each variety once',async()=>{
 const {call}=await fixture();
 let state=await(await call('/api/state')).json();const total=state.fruitSummary.total;assert.ok(total>8);assert.equal(state.fruitSummary.tasted,0);
 await call('/api/quests',json('POST',{id:'fruit-papaya',done:true}));
 await call('/api/quests',json('POST',{id:'fruit-papaya',done:true}),'mama');
 state=await(await call('/api/state',{},'mama')).json();assert.equal(state.fruitSummary.tasted,1);assert.equal(state.fruitSummary.total,total);
});
test('Own fruits are visible to the family and can be checked off',async()=>{
 const {call}=await fixture();
 const added=await call('/api/fruits',json('POST',{name:'Unser Marktfund',local:'Lokaler Name',notes:'Süß und weich'}));assert.equal(added.status,201);const {id}=await added.json();
 let state=await(await call('/api/state',{},'mama')).json();const own=state.fruits.find(f=>f.id===id);assert.equal(own.custom,true);assert.equal(own.canDelete,false);assert.equal(state.fruitSummary.custom,1);
 assert.equal((await call('/api/quests',json('POST',{id:'fruit-'+id,done:true}),'mama')).status,200);
 state=await(await call('/api/state')).json();assert.equal(state.fruitSummary.tasted,1);assert.equal(state.fruits.find(f=>f.id===id).canDelete,true);
});
test('Duplicate built-in aliases and own normalized names are rejected',async()=>{
 const {call}=await fixture();
 for(const name of ['Papaya','MÁNGO','Pitaya','Măng cụt'])assert.equal((await call('/api/fruits',json('POST',{name}))).status,409);
 assert.equal((await call('/api/fruits',json('POST',{name:'  Überfrucht  '}))).status,201);
 assert.equal((await call('/api/fruits',json('POST',{name:'uberfrucht'}),'mama')).status,409);
 assert.equal((await call('/api/fruits',json('POST',{name:'  '}))).status,400);
});
test('Only the creator removes own fruit and its checked state is deleted atomically',async()=>{
 const {call}=await fixture();const {id}=await(await call('/api/fruits',json('POST',{name:'Noch ein Fund'}))).json();
 await call('/api/quests',json('POST',{id:'fruit-'+id,done:true}));
 assert.equal((await call('/api/fruits/'+id,{method:'DELETE'},'mama')).status,403);
 assert.equal((await call('/api/fruits/'+id,{method:'DELETE'})).status,200);
 const state=await(await call('/api/state')).json();assert.equal(state.fruits.some(f=>f.id===id),false);assert.equal(state.checks.includes('fruit-'+id),false);
 assert.equal((await call('/api/quests',json('POST',{id:'fruit-'+id,done:true}))).status,400);
});
test('Switching Easter and Pentecost keeps discoveries and existing checks',async()=>{
 const {call}=await fixture();const {id}=await(await call('/api/fruits',json('POST',{name:'Familienfund'}))).json();
 await call('/api/quests',json('POST',{id:'fruit-mangostan',done:true}));await call('/api/quests',json('POST',{id:'fruit-'+id,done:true}));
 let state=await(await call('/api/state')).json();const trip=structuredClone(state.trip);trip.startDate='2027-03-20';
 const save=await call('/api/plan',json('PUT',{trip,revision:state.revision}));assert.equal(save.status,200);const saved=await save.json();assert.equal(saved.fruits.some(f=>f.id==='mangostan'),false);assert.equal(saved.fruitSummary.tasted,1);
 state=await(await call('/api/state')).json();assert.ok(state.checks.includes('fruit-mangostan'));assert.ok(state.fruits.some(f=>f.id===id));
 trip.startDate='2027-05-15';const again=await(await call('/api/plan',json('PUT',{trip,revision:state.revision}))).json();assert.equal(again.fruitSummary.tasted,2);
});
test('Own-fruit mutations require authentication and reject cross-origin requests',async()=>{
 const {call}=await fixture();assert.equal((await call('/api/fruits',json('POST',{name:'Nicht erlaubt'}),null)).status,401);
 const foreign=json('POST',{name:'Nicht erlaubt'});foreign.headers.Origin='https://untrusted.example';assert.equal((await call('/api/fruits',foreign)).status,403);
});
