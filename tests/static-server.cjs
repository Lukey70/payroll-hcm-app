'use strict';
const http=require('http'),fs=require('fs/promises'),path=require('path');
async function startStaticServer(root){
 const base=path.resolve(root),types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};
 const server=http.createServer(async(req,res)=>{
  try{
   const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(base,'.'+(pathname==='/'?'/index.html':pathname));
   if(!file.startsWith(base+path.sep)){res.writeHead(403);res.end();return;}
   const content=await fs.readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(content);
  }catch{res.writeHead(404);res.end();}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});server.unref();
 return {url:'http://127.0.0.1:'+server.address().port+'/',close:()=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))};
}
module.exports={startStaticServer};
