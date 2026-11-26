import {FRUIT_CATALOG,matchingFruit,normalizeFruitName,fruitSelection} from '../lib/fruits.mjs';

const json = (value, status = 200) => Response.json(value, {status, headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const error = (message, status = 400) => json({error:message},status);
const clean = (value, max=1000) => typeof value==='string' ? value.trim().slice(0,max) : '';
const dateValid = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;

export function videoEmbed(value) {
  try {
    const u=new URL(value);
    if(u.protocol!=='https:'||u.username||u.password) return null;
    const h=u.hostname.toLowerCase();
    let id=null;
    if(['youtube.com','www.youtube.com','m.youtube.com'].includes(h)) id=u.pathname==='/watch'?u.searchParams.get('v'):u.pathname.match(/^\/(?:shorts|embed)\/([\w-]{11})\/?$/)?.[1];
    if(h==='youtu.be') id=u.pathname.slice(1);
    if(id&&/^[\w-]{11}$/.test(id)) return {url:'https://www.youtube.com/watch?v='+id,embed:'https://www.youtube-nocookie.com/embed/'+id};
    if(['vimeo.com','www.vimeo.com'].includes(h)&&/^\/\d+\/?$/.test(u.pathname)) return {url:'https://vimeo.com/'+u.pathname.replaceAll('/',''),embed:'https://player.vimeo.com/video/'+u.pathname.replaceAll('/','')};
  } catch {}
  return null;
}

export function validateTrip(input, fallback) {
  if(!input||typeof input!=='object'||!Array.isArray(input.days)||input.days.length!==14||!dateValid(input.startDate)) throw new Error('Bitte einen gültigen Starttermin und genau 14 Reisetage angeben.');
  const title=clean(input.title,70);
  if(!title) throw new Error('Der Reisetitel darf nicht leer sein.');
  const days=input.days.map((d,i)=>{
    if(d.id!==i+1||!clean(d.place,70)||!clean(d.title,120)||!Array.isArray(d.quests)||d.quests.length>8) throw new Error('Ein Reisetag ist unvollständig.');
    return {id:i+1,place:clean(d.place,70),title:clean(d.title,120),region:clean(d.region,20),theme:['reise','kultur','natur','fashion','fruechte','affen'].includes(d.theme)?d.theme:'kultur',morning:clean(d.morning,1800),afternoon:clean(d.afternoon,1800),evening:clean(d.evening,1800),transfer:clean(d.transfer,250),quests:d.quests.map(q=>clean(q,200)).filter(Boolean),note:clean(d.note,1500)};
  });
  let hotelUrl;
  try {hotelUrl=new URL(input.hotel?.url);if(hotelUrl.protocol!=='https:') throw new Error();} catch {throw new Error('Bitte einen gültigen HTTPS-Link zum Hotel eintragen.');}
  const end=new Date(input.startDate+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+13);
  return {...fallback,title,subtitle:clean(input.subtitle,180),startDate:input.startDate,endDate:end.toISOString().slice(0,10),days,hotel:{name:clean(input.hotel.name,120),city:clean(input.hotel.city,80),stars:Math.min(5,Math.max(1,Number(input.hotel.stars)||5)),nights:Math.min(13,Math.max(1,Number(input.hotel.nights)||4)),url:hotelUrl.href,status:clean(input.hotel.status,120),notes:clean(input.hotel.notes,1800),source:fallback.hotel.source}};
}

async function readJson(request) {
  if(Number(request.headers.get('content-length'))>100000) throw new Error('Die Eingabe ist zu groß.');
  const text=await request.text();
  if(text.length>100000) throw new Error('Die Eingabe ist zu groß.');
  try { return JSON.parse(text); } catch {throw new Error('Ungültige Eingabe.');}
}
function userFrom(request) {
  const id=request.headers.get('oai-authenticated-user-id');
  if(!id) return null;
  let name=request.headers.get('oai-authenticated-user-full-name')||'';
  if(request.headers.get('oai-authenticated-user-full-name-encoding')==='percent-encoded-utf-8') {try{name=decodeURIComponent(name);}catch{name='';}}
  return {id,name:clean(name,80)||'Familienmitglied'};
}
function safeMedia(row,user) {const {object_key,author_id,...rest}=row;return {...rest,canDelete:author_id===user.id,src:row.object_key?'/api/media/'+row.id:null,embed:row.url?videoEmbed(row.url)?.embed:null};}
async function getPlan(env,defaultTrip) {
  const stored=await env.DB.prepare('SELECT data, revision FROM trip_documents WHERE id = ?').bind('trip').first();
  return stored?{trip:JSON.parse(stored.data),revision:stored.revision}:{trip:structuredClone(defaultTrip),revision:0};
}
function signatureMatches(mime,b) {
  const s=(offset,n)=>String.fromCharCode(...b.slice(offset,offset+n));
  if(mime==='image/jpeg') return b[0]===255&&b[1]===216&&b[2]===255;
  if(mime==='image/png') return b[0]===137&&s(1,3)==='PNG';
  if(mime==='image/gif') return s(0,3)==='GIF';
  if(mime==='image/webp') return s(0,4)==='RIFF'&&s(8,4)==='WEBP';
  if(mime==='image/avif') return s(4,4)==='ftyp'&&['avif','avis'].includes(s(8,4));
  if(mime==='video/mp4') return s(4,4)==='ftyp';
  if(mime==='video/webm') return b[0]===26&&b[1]===69&&b[2]===223&&b[3]===163;
  return false;
}

export function createWorker({assets,defaultTrip}) {
  return {async fetch(request,env) {
    const u=new URL(request.url);
    try {
      if(!u.pathname.startsWith('/api/')) {
        const asset=assets[u.pathname];
        if(!asset) return new Response('Seite nicht gefunden',{status:404});
        if(!['GET','HEAD'].includes(request.method))return new Response('Methode nicht erlaubt',{status:405});
        return new Response(request.method==='HEAD'?null:asset.body,{headers:{'Content-Type':asset.type,'Cache-Control':u.pathname==='/'?'private, no-store':'public, max-age=300','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Permissions-Policy':'camera=(self), microphone=(self), geolocation=()'}});
      }
      const user=userFrom(request);
      if(!user) return error('Bitte anmelden, um die Familienreise zu öffnen.',401);
      if(!['GET','HEAD'].includes(request.method)) {
        const origin=request.headers.get('origin');
        if((origin&&origin!==u.origin)||request.headers.get('sec-fetch-site')==='cross-site') return error('Diese Anfrage ist nicht erlaubt.',403);
      }
      if(!env.DB||!env.BUCKET) return error('Der gemeinsame Speicher ist noch nicht eingerichtet. Bitte später erneut versuchen.',503);
      if(u.pathname==='/api/state'&&request.method==='GET') {
        const [plan,checks,media,custom]=await Promise.all([getPlan(env,defaultTrip),env.DB.prepare('SELECT id FROM quest_checks WHERE done = 1').all(),env.DB.prepare('SELECT * FROM media ORDER BY created_at DESC').all(),env.DB.prepare('SELECT * FROM custom_fruits ORDER BY created_at, id').all()]);
        const done=checks.results.map(x=>x.id);
        return json({...plan,user,checks:done,media:media.results.map(row=>safeMedia(row,user)),...fruitSelection(plan.trip.startDate,custom.results,done,user.id)});
      }
      if(u.pathname==='/api/plan'&&request.method==='PUT') {
        const input=await readJson(request);
        if(!Number.isSafeInteger(input.revision)||input.revision<0) return error('Ungültiger Speicherstand.');
        const trip=validateTrip(input.trip,defaultTrip);
        const row=await env.DB.prepare('INSERT INTO trip_documents (id, data, revision, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, revision=trip_documents.revision+1, updated_at=excluded.updated_at WHERE trip_documents.revision=? RETURNING revision').bind('trip',JSON.stringify(trip),new Date().toISOString(),input.revision).first();
        if(!row) return error('Jemand hat den Reiseplan inzwischen geändert. Bitte Deine Eingabe sichern, die App neu laden und erneut eintragen.',409);
        const [custom,checks]=await Promise.all([env.DB.prepare('SELECT * FROM custom_fruits ORDER BY created_at, id').all(),env.DB.prepare('SELECT id FROM quest_checks WHERE done = 1').all()]);
        return json({trip,revision:row.revision,...fruitSelection(trip.startDate,custom.results,checks.results.map(x=>x.id),user.id)});
      }
      if(u.pathname==='/api/quests'&&request.method==='POST') {
        const input=await readJson(request);
        const {trip}=await getPlan(env,defaultTrip);
        const custom=await env.DB.prepare('SELECT id FROM custom_fruits').all();
        const allowed=new Set([...trip.days.flatMap(d=>d.quests.map((_,i)=>'day-'+d.id+'-'+i)),...FRUIT_CATALOG.map(f=>'fruit-'+f.id),...custom.results.map(f=>'fruit-'+f.id)]);
        if(!allowed.has(input.id)||typeof input.done!=='boolean') return error('Diese Quest gibt es nicht.');
        await env.DB.prepare('INSERT INTO quest_checks (id,done,updated_by,updated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET done=excluded.done,updated_by=excluded.updated_by,updated_at=excluded.updated_at').bind(input.id,input.done?1:0,user.id,new Date().toISOString()).run();
        return json({id:input.id,done:input.done});
      }
      if(u.pathname==='/api/fruits'&&request.method==='POST') {
        const input=await readJson(request);
        const name=clean(input.name,80),normalized=normalizeFruitName(name);
        if(normalized.length<2)return error('Bitte einen Fruchtnamen mit mindestens zwei Zeichen eintragen.');
        if(matchingFruit(name))return error('Diese Frucht gehört bereits zur Liste. Sie wird passend zur Reisezeit eingeblendet. Suche auch nach ihrem anderen Namen.',409);
        const count=await env.DB.prepare('SELECT COUNT(*) AS total FROM custom_fruits').first();
        if(count.total>=100)return error('Ihr habt bereits 100 eigene Sorten ergänzt. Bitte zuerst einen eigenen Eintrag entfernen.',409);
        const id='custom-'+crypto.randomUUID();
        const row=await env.DB.prepare('INSERT INTO custom_fruits (id,name,normalized_name,local_name,notes,author_id,author_name,created_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(normalized_name) DO NOTHING RETURNING id').bind(id,name,normalized,clean(input.local,80),clean(input.notes,600),user.id,user.name,new Date().toISOString()).first();
        if(!row)return error('Diese Frucht wurde bereits von Eurer Reisecrew ergänzt.',409);
        return json({id},201);
      }
      const fruitMatch=u.pathname.match(/^\/api\/fruits\/(custom-[\w-]{36})$/);
      if(fruitMatch&&request.method==='DELETE') {
        const row=await env.DB.prepare('SELECT id,author_id FROM custom_fruits WHERE id=?').bind(fruitMatch[1]).first();
        if(!row)return error('Dieser eigene Fund wurde nicht gefunden.',404);
        if(row.author_id!==user.id)return error('Du kannst nur die Früchte entfernen, die Du selbst ergänzt hast.',403);
        await env.DB.batch([env.DB.prepare('DELETE FROM quest_checks WHERE id=?').bind('fruit-'+row.id),env.DB.prepare('DELETE FROM custom_fruits WHERE id=?').bind(row.id)]);
        return json({deleted:true});
      }
      if(u.pathname==='/api/media'&&request.method==='POST') {
        if(Number(request.headers.get('content-length'))>51*1024*1024) return error('Bitte Videos bis 50 MB und Bilder bis 12 MB auswählen.',413);
        let values,file=null,kind,mime='',size=0,filename='',objectKey=null,url=null;
        if((request.headers.get('content-type')||'').includes('application/json')) {
          values=await readJson(request);
          const parsed=videoEmbed(values.url);
          if(!parsed) return error('Bitte einen gültigen YouTube- oder Vimeo-Link eintragen.');
          url=parsed.url;kind='link';
        } else {
          const form=await request.formData();values=Object.fromEntries(form);file=form.get('file');
          if(!file||typeof file==='string'||!file.size) return error('Bitte eine Datei auswählen.');
          mime=file.type.split(';')[0];size=file.size;filename=clean(file.name,180);
          kind=mime.startsWith('image/')?'image':'video';
          if(size>(kind==='image'?12:50)*1024*1024) return error(kind==='image'?'Bilder dürfen höchstens 12 MB groß sein.':'Videos dürfen höchstens 50 MB groß sein.',413);
          if(!signatureMatches(mime,new Uint8Array(await file.slice(0,32).arrayBuffer()))) return error('Dieses Dateiformat wird nicht unterstützt. Bitte JPG, PNG, WebP, GIF, AVIF, MP4 oder WebM verwenden.',415);
        }
        const day=Number(values.day);
        if(!Number.isInteger(day)||day<1||day>14)return error('Bitte einen Reisetag zwischen 1 und 14 auswählen.');
        const title=clean(values.title,120)||filename||'Unser Reise-Vlog';
        const caption=clean(values.caption,3000);
        const author=clean(values.author,80)||user.name;
        const id=crypto.randomUUID();
        if(file) {objectKey='family/'+id;await env.BUCKET.put(objectKey,file.stream(),{httpMetadata:{contentType:mime}});}
        try {
          await env.DB.prepare('INSERT INTO media (id,object_key,kind,mime,size,filename,title,caption,day,author_id,author_name,url,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,objectKey,kind,mime,size,filename,title,caption,day,user.id,author,url,new Date().toISOString()).run();
        } catch(e) {if(objectKey)await env.BUCKET.delete(objectKey);throw e;}
        return json({id},201);
      }
      const mediaMatch=u.pathname.match(/^\/api\/media\/([\w-]{36})$/);
      if(mediaMatch) {
        const row=await env.DB.prepare('SELECT * FROM media WHERE id=?').bind(mediaMatch[1]).first();
        if(!row)return error('Dieser Moment wurde nicht gefunden.',404);
        if(request.method==='DELETE') {
          if(row.author_id!==user.id)return error('Du kannst nur Deine eigenen Uploads löschen.',403);
          if(row.object_key)await env.BUCKET.delete(row.object_key);
          await env.DB.prepare('DELETE FROM media WHERE id=?').bind(row.id).run();
          return json({deleted:true});
        }
        if(['GET','HEAD'].includes(request.method)&&row.object_key) {
          const range=request.headers.get('range');
          const object=request.method==='HEAD'?await env.BUCKET.head(row.object_key):await env.BUCKET.get(row.object_key,range?{range:request.headers}:undefined);
          if(!object)return error('Die Datei ist nicht mehr verfügbar.',404);
          const headers=new Headers({'Content-Type':row.mime,'Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes','ETag':object.httpEtag,'Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(row.filename)}`});
          let status=200;
          if(range&&object.range&&'length' in object.range){const start=object.range.offset??Math.max(0,object.size-object.range.length);headers.set('Content-Range',`bytes ${start}-${start+object.range.length-1}/${object.size}`);headers.set('Content-Length',String(object.range.length));status=206;}else headers.set('Content-Length',String(object.size));
          return new Response(request.method==='HEAD'?null:object.body,{status,headers});
        }
      }
      return error('Diese Funktion wurde nicht gefunden.',404);
    } catch(e) {
      if(e instanceof Error&&/Eingabe|Reisetag|Starttermin|Reisetitel|Hotel|Reiseplan/.test(e.message)) return error(e.message);
      console.error('Request failed:',e instanceof Error?e.message:'unknown');
      return error('Das hat gerade nicht geklappt. Bitte noch einmal versuchen. Deine Eingabe bleibt erhalten.',500);
    }
  }};
}
