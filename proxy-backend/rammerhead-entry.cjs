// Backend-only adapter for binary-person/rammerhead (MIT), pinned at deployment.
// No browser interface or client-visible credentials are served here.
const {timingSafeEqual}=require('node:crypto');
const dns=require('node:dns').promises;
const net=require('node:net');
const {RammerheadProxy,RammerheadSessionMemoryStore,RammerheadJSMemCache,generateId}=require('./src');
const {parseProxyUrl}=require('testcafe-hammerhead/lib/utils/url');
const token=process.env.PROXY_BACKEND_TOKEN;
if(!token||token.length<32)throw Error('PROXY_BACKEND_TOKEN is required');
const site=new URL(process.env.SITE_ORIGIN);
if(site.protocol!=='https:')throw Error('SITE_ORIGIN must use HTTPS');
const proxy=new RammerheadProxy({bindingAddress:'0.0.0.0',port:Number(process.env.PORT||8080),crossDomainPort:0,
 getServerInfo:()=>({hostname:site.hostname,port:443,crossDomainPort:443,protocol:'https:'}),
 jsCache:new RammerheadJSMemCache(24*1024*1024),disableHttp2:false,requestTimeoutPage:45000,requestTimeoutAjax:60000,stuckRequestTimeout:90000});
// Preserve Hammerhead's control WebSocket server when rewriting the public origin.
const rewriteInfo=proxy._rewriteServerInfo.bind(proxy);
proxy._rewriteServerInfo=req=>({...rewriteInfo(req),wss:proxy.wss1});
const sessions=new RammerheadSessionMemoryStore({staleTimeout:30*60*1000,maxToLive:8*60*60*1000});sessions.attachToProxy(proxy);
function authorized(req){const actual=Buffer.from(req.headers['x-mathsite-backend-token']||'');const expected=Buffer.from(token);return actual.length===expected.length&&timingSafeEqual(actual,expected)}
function forbidden(res,msg){if(res.writeHead)res.writeHead(403,{'Content-Type':'text/plain','Cache-Control':'no-store'});res.end(msg);return true}
function isPrivate(address){if(net.isIP(address)===4){const [a,b]=address.split('.').map(Number);return a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===100&&b>=64&&b<=127)}const ip=address.toLowerCase();return ip==='::'||ip==='::1'||ip.startsWith('fc')||ip.startsWith('fd')||ip.startsWith('fe80:')||ip.startsWith('ff')||ip.startsWith('::ffff:')}
proxy.addToOnRequestPipeline(async(req,res,_info,isRoute)=>{
 if(req.url==='/healthz')return;
 if(!authorized(req))return forbidden(res,'This engine is available only through the Mathsite ChatGPT Site.');
 delete req.headers['x-mathsite-backend-token'];
 for(const key of Object.keys(req.headers))if(key.startsWith('oai-')||key==='x-forwarded-for'||key==='x-real-ip')delete req.headers[key];
 if(!isRoute){const destination=parseProxyUrl(req.url);if(destination){try{const url=new URL(destination.destUrl);if(!['http:','https:','ws:','wss:'].includes(url.protocol)||!['','80','443'].includes(url.port))return forbidden(res,'Unsupported destination.');const addresses=await dns.lookup(url.hostname,{all:true});if(!addresses.length||addresses.some(x=>isPrivate(x.address)))return forbidden(res,'Private network destinations are unavailable.');}catch{return forbidden(res,'Destination could not be resolved.')}}}
},true);
proxy.GET('/healthz',(_req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({status:'ok',engine:'rammerhead',upstream:'binary-person/rammerhead',ui:false}))});
proxy.POST('/api/session',(_req,res)=>{if(sessions.keys().length>=100){res.writeHead(429);return res.end('Session limit reached. Close older sessions and retry later.')}const id=generateId();const session=sessions.add(id);session.shuffleDict=null;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({id,engine:'rammerhead'}))});
proxy.GET('/',(_req,res)=>{res.writeHead(404,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Backend only. Open the Mathsite ChatGPT Site.'}))});
process.on('SIGTERM',()=>{proxy.close();process.exit(0)});
console.log('Rammerhead backend listening; browser interface is hosted on ChatGPT Sites.');
