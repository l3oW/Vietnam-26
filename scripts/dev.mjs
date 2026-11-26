import {createServer} from 'node:http';
import {readFile,mkdir,writeFile,unlink,stat} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {createWorker} from '../worker/server.mjs';
import defaultTrip from '../web/trip.mjs';
await mkdir('.local-data/files',{recursive:true});
const db=new DatabaseSync('.local-data/preview.sqlite');
db.exec('CREATE TABLE IF NOT EXISTS preview_migrations (name TEXT PRIMARY KEY)');
if(!db.prepare('SELECT name FROM preview_migrations WHERE name=?').get('0000_family')){db.exec(await readFile('drizzle/0000_family.sql','utf8'));db.prepare('INSERT INTO preview_migrations(name) VALUES (?)').run('0000_family');}
const DB={prepare(sql){let args=[];return {bind(...values){args=values;return this},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(r.changes)}}}}}};
const BUCKET={async put(key,stream,options){const bytes=Buffer.from(await new Response(stream).arrayBuffer());const path='.local-data/files/'+key.replaceAll('/','_');await writeFile(path,bytes);await writeFile(path+'.json',JSON.stringify(options));},async get(key,options){const path='.local-data/files/'+key.replaceAll('/','_');try{const data=await readFile(path);let offset=0,length=data.length,range;const header=options?.range?.get('range');if(header){const m=header.match(/^bytes=(\d*)-(\d*)$/);if(m){offset=m[1]?Number(m[1]):Math.max(0,data.length-Number(m[2]));const end=m[1]&&m[2]?Math.min(Number(m[2]),data.length-1):data.length-1;length=end-offset+1;range={offset,length};}}return {size:data.length,body:data.subarray(offset,offset+length),httpEtag:'"local-'+data.length+'"',range};}catch{return null;}},async head(key){const o=await this.get(key);return o?{...o,body:undefined}:null;},async delete(key){const p='.local-data/files/'+key.replaceAll('/','_');await unlink(p).catch(()=>{});await unlink(p+'.json').catch(()=>{});}};
const types={'index.html':'text/html; charset=utf-8','app.js':'text/javascript; charset=utf-8','style.css':'text/css; charset=utf-8','favicon.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{try{
  const origin='http://'+req.headers.host;const url=new URL(req.url,origin);
  if(url.pathname==='/signin-with-chatgpt'){res.writeHead(302,{'Location':'/','Set-Cookie':'vietnam-preview=1; Path=/; HttpOnly; SameSite=Lax'});return res.end();}
  const headers=new Headers();for(const [k,v]of Object.entries(req.headers))if(v&&!k.startsWith('oai-'))headers.set(k,Array.isArray(v)?v.join(','):v);
  if((req.headers.cookie||'').split(';').some(x=>x.trim()==='vietnam-preview=1')){headers.set('oai-authenticated-user-id','local-preview-user');headers.set('oai-authenticated-user-full-name','Leo');}
  const assets={};for(const[name,type]of Object.entries(types))assets[name==='index.html'?'/':'/'+name]={body:await readFile('web/'+name,'utf8'),type};
  const request=new Request(url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:req,duplex:'half'}:{})});
  const response=await createWorker({assets,defaultTrip}).fetch(request,{DB,BUCKET});
  res.writeHead(response.status,Object.fromEntries(response.headers));if(response.body)for await(const chunk of response.body)res.write(chunk);res.end();
}catch(e){console.error(e);res.writeHead(500);res.end('Preview error');}});
server.listen(5173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:5173'));
