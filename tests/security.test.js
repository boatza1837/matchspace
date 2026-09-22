const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { DatabaseSync } = require('node:sqlite');
const express = require('express');
const session = require('express-session');
const http = require('node:http');
const { WebSocket } = require('ws');
const { once } = require('node:events');

function load(file, mocks = {}) {
  const filename = path.resolve(__dirname, '..', file);
  const actual = createRequire(filename);
  mocks = { '../services/privacy': { getPreferences:async()=>({matching:false,analytics:false,email:false}), PRIVACY_VERSION:'2026-09-22' }, ...mocks };
  const box = { require: n => n in mocks ? mocks[n] : actual(n), module: { exports: {} }, console, Buffer, process, setInterval, clearInterval, URL };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), box, { filename });
  return box.module.exports;
}
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT, role TEXT, is_admin INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, profile_image TEXT);
    INSERT INTO users (id,name,email,role) VALUES (1,'Alice','alice@gmail.com','user'),(2,'Bob','bob@gmail.com','user'),(3,'Outsider','outsider@gmail.com','user'),(4,'Owner','owner@gmail.com','owner'),(5,'Former owner','former@gmail.com','user');
    CREATE TABLE activities (id INTEGER PRIMARY KEY, name TEXT, created_by INTEGER); INSERT INTO activities VALUES(10,'Study',1);
    CREATE TABLE activity_members (activity_id INTEGER,user_id INTEGER); INSERT INTO activity_members VALUES(10,2);
    CREATE TABLE chats (id INTEGER PRIMARY KEY,user_a INTEGER,user_b INTEGER,type TEXT,activity_id INTEGER); INSERT INTO chats VALUES(20,1,2,'direct',NULL),(21,1,0,'group',10);
    CREATE TABLE chat_messages (id INTEGER PRIMARY KEY,chat_id INTEGER,sender_id INTEGER,content TEXT,is_read INTEGER DEFAULT 0,read_at TEXT,created_at TEXT); INSERT INTO chat_messages (id,chat_id,sender_id,content,created_at) VALUES(30,20,1,'Private fixture message','2026-01-01');
    CREATE TABLE user_blocks(blocker_id INTEGER,blocked_id INTEGER);`);
  let writes = 0;
  const db = { get: async (sql,args=[]) => sqlite.prepare(sql).get(...args), all: async (sql,args=[]) => sqlite.prepare(sql).all(...args), run: async (sql,args=[]) => { writes++; return sqlite.prepare(sql).run(...args); } };
  const access = load('src/services/chat-access.js', {'../config/db':{db}});
  return { sqlite, db, access, writes:()=>writes };
}
const response = () => ({ code:200,status(n){this.code=n;return this;},json(v){this.data=v;return this;} });
function routes() {
  const handlers = {};
  const router = {};
  for (const method of ['get','post','put','patch','delete']) router[method]=(url,...args)=>handlers[method+' '+url]=args.at(-1);
  return { handlers, express:{Router:()=>router} };
}

for (const [name,user,chat,allowed] of [
  ['direct participant',1,20,true],['other direct participant',2,20,true],['unrelated user',3,20,false],['current owner',4,20,true],['demoted owner',5,20,false],['group creator',1,21,true],['group member',2,21,true],['group outsider',3,21,false],['missing chat',1,999,false],['invalid chat ID',1,-1,false]
]) test('Chat access: '+name,async()=>{const f=fixture();try{assert.equal(Boolean(await f.access.getChatAccess(user,chat)),allowed);}finally{f.sqlite.close();}});

test('Chat access immediately revokes banned users and removed members',async()=>{
 const f=fixture();try{f.sqlite.exec('UPDATE users SET is_active=0 WHERE id=1');assert.equal(await f.access.getChatAccess(1,20),null);f.sqlite.exec('DELETE FROM activity_members');assert.equal(await f.access.getChatAccess(2,21),null);}finally{f.sqlite.close();}
});

for (const method of ['get /api/chats/:id/messages','post /api/chats/:id/read','post /api/chats/:id/messages']) test(method+' rejects outsider before reads/writes',async()=>{
 const f=fixture(), r=routes();try{load('src/routes/chat.routes.js',{'express':r.express,'../config/db':{db:f.db},'../services/chat-access':f.access,'../middlewares/auth':{},'../services/websocket':{broadcastToChat:()=>{}},'../services/matchmaking.service':{}});
 const res=response();await r.handlers[method]({session:{user:{id:3,role:'owner'}},params:{id:20},body:{content:'Unauthorized'}},res);assert.equal(res.code,403);assert.equal(f.writes(),0);assert.equal(res.data.messages,undefined);
 }finally{f.sqlite.close();}
});
test('Authorized HTTP reader still gets messages and read receipt',async()=>{
 const f=fixture(),r=routes();try{load('src/routes/chat.routes.js',{'express':r.express,'../config/db':{db:f.db},'../services/chat-access':f.access,'../middlewares/auth':{},'../services/websocket':{broadcastToChat:()=>{}},'../services/matchmaking.service':{}});const res=response();await r.handlers['get /api/chats/:id/messages']({session:{user:{id:2}},params:{id:20}},res);assert.equal(res.code,200);assert.equal(res.data.messages[0].content,'Private fixture message');assert.equal(f.sqlite.prepare('SELECT is_read FROM chat_messages').get().is_read,1);}finally{f.sqlite.close();}
});

for (const body of [{email:'owner@gmail.com'},{credential:'unsigned.payload.fake'}]) test('Google login rejects unverified input: '+Object.keys(body)[0],async()=>{
 const r=routes();let lookedUp=false;load('src/routes/auth.routes.js',{'express':r.express,'../config/db':{db:{get:async()=>{lookedUp=true;}}},'../services/google-auth':{verifyGoogleCredential:async()=>{throw Error('Invalid');}},'../middlewares/auth':{},'../middlewares/upload':{},'../config/security':{},'../services/logger':{},'../services/cloudinary':{},'../services/astrology':{}});const res=response(),req={body,session:{}};await r.handlers['post /api/auth/google'](req,res);assert.equal(res.code,401);assert.equal(lookedUp,false);assert.equal(req.session.user,undefined);
});
test('Verified Google login uses verified email and regenerates session',async()=>{
 const r=routes();let regenerated=false;load('src/routes/auth.routes.js',{'express':r.express,'../config/db':{db:{get:async(sql,args)=>{assert.equal(args[0],'alice@gmail.com');return{id:1,role:'user',is_active:1};}}},'../services/google-auth':{verifyGoogleCredential:async()=>({email:'alice@gmail.com'})},'../middlewares/auth':{formatUser:u=>u},'../middlewares/upload':{},'../config/security':{},'../services/logger':{logLogin:async()=>{}},'../services/cloudinary':{},'../services/astrology':{}});const req={body:{credential:'verified',email:'owner@gmail.com'},session:{regenerate:cb=>{regenerated=true;cb();},save:cb=>cb()}};const res=response();await r.handlers['post /api/auth/google'](req,res);assert.equal(res.code,200);assert.equal(req.session.user.id,1);assert.equal(regenerated,true);
});
test('Verified new Google user gets a short-lived server-side registration handoff',async()=>{
 const r=routes();load('src/routes/auth.routes.js',{'express':r.express,'../config/db':{db:{get:async()=>null}},'../services/google-auth':{verifyGoogleCredential:async()=>({email:'NewUser@gmail.com',name:'New User',picture:'https://images.example/avatar.png'})},'../middlewares/auth':{},'../middlewares/upload':{},'../config/security':{},'../services/logger':{},'../services/cloudinary':{},'../services/astrology':{}});
 const req={body:{credential:'verified'},session:{save:cb=>cb()}},res=response();await r.handlers['post /api/auth/google'](req,res);assert.equal(res.code,200);assert.equal(res.data.redirect,'/register?google=1');assert.doesNotMatch(res.data.redirect,/gmail|avatar/);assert.equal(req.session.pendingGoogleRegistration.email,'newuser@gmail.com');assert.ok(req.session.pendingGoogleRegistration.expiresAt>Date.now());
 const pending=response();r.handlers['get /api/auth/google/pending'](req,pending);assert.equal(pending.data.name,'New User');assert.equal(pending.data.email,'newuser@gmail.com');
});
test('Google registration accepts no password and keeps removed privacy choices off',async()=>{
 const r=routes();let inserted,choices,encrypted=false;const db={get:async sql=>sql.includes('SELECT * FROM users WHERE id')?{id:9,name:'New User',email:'newuser@gmail.com',role:'user',is_active:1}:null,run:async(sql,args)=>{if(sql.includes('INSERT INTO users'))inserted=args;return{lastInsertRowid:9};}};
 load('src/routes/auth.routes.js',{'express':r.express,'../config/db':{db},'../services/google-auth':{},'../services/privacy':{PRIVACY_VERSION:'2026-09-22',parseChoices:v=>({matching:v.matching===true,analytics:v.analytics===true,email:v.email==='true'}),savePreferences:async(_,v)=>{choices=v;},getPreferences:async()=>({matching:false})},'../middlewares/auth':{formatUser:u=>u},'../middlewares/upload':{},'../config/security':{hashPassword:v=>'hash:'+v,encryptPassword:()=>{encrypted=true;}},'../services/logger':{},'../services/cloudinary':{},'../services/astrology':{calculateAge:()=>20,getZodiacSign:()=>null}});
 const req={body:{privacy_version:'2026-09-22',privacy_acknowledged:'true',name:'New User',email:'newuser@gmail.com',password:'',phone:'0812345678',matching:'true',analytics:'true'},files:{},session:{pendingGoogleRegistration:{email:'newuser@gmail.com',picture:'',expiresAt:Date.now()+60000},regenerate(cb){this.pendingGoogleRegistration=undefined;cb();},save:cb=>cb()}},res=response();await r.handlers['post /api/register'](req,res,e=>{throw e;});assert.equal(res.code,201);assert.equal(inserted[1],'newuser@gmail.com');assert.match(inserted[2],/^hash:/);assert.equal(inserted[3],null);assert.equal(encrypted,false);assert.deepEqual(choices,{matching:false,analytics:false,email:false});
});
test('Google verifier requires a credential, verified email, authoritative email, and audience',async()=>{
 let payload={sub:'subject',email:'alice@gmail.com',email_verified:true};let options;
 const verifier=load('src/services/google-auth.js',{'google-auth-library':{OAuth2Client:class{async verifyIdToken(o){options=o;return{getPayload:()=>payload};}}}});
 await assert.rejects(verifier.verifyGoogleCredential());await verifier.verifyGoogleCredential('signed-token');assert.ok(options.audience.endsWith('.apps.googleusercontent.com'));assert.equal(options.idToken,'signed-token');
 payload={...payload,email_verified:false};await assert.rejects(verifier.verifyGoogleCredential('token'));
 payload={...payload,email:'alice@example.com',email_verified:true};await assert.rejects(verifier.verifyGoogleCredential('token'));
 payload={...payload,hd:'example.com'};assert.equal((await verifier.verifyGoogleCredential('token')).hd,'example.com');
});
test('Recovery/file endpoints are removed from server routing',()=>{
 const source=fs.readFileSync(path.resolve(__dirname,'../server.js'),'utf8');assert.doesNotMatch(source,/app\.get\(['"]\/api\/system\//);assert.doesNotMatch(source,/res\.download\(/);
});

test('WebSocket rejects anonymous/cross-origin upgrades and enforces sessions and membership',async t=>{
 const f=fixture();const app=express();const server=http.createServer(app);const middleware=session({secret:'isolated-test-session-secret',resave:false,saveUninitialized:false});app.use(middleware);
 app.get('/test-login/:id',(req,res)=>{req.session.user={id:Number(req.params.id)};res.json({ok:true});});
 app.post('/test-logout',(req,res)=>req.session.destroy(()=>res.end()));
 const sockets=load('src/services/websocket.js',{'../config/db':{db:f.db},'./chat-access':f.access});const wss=sockets.initWebSocketServer(server,middleware);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port, wsUrl=base.replace('http:','ws:')+'/ws';const clients=[];
 t.after(async()=>{for(const ws of clients)ws.terminate();wss.close();await new Promise(resolve=>server.close(resolve));f.sqlite.close();});
 async function cookie(id){const r=await fetch(base+'/test-login/'+id);return r.headers.get('set-cookie').split(';')[0];}
 async function rejected(headers){await new Promise((resolve,reject)=>{const ws=new WebSocket(wsUrl,{headers});clients.push(ws);ws.on('unexpected-response',(_,res)=>{assert.equal(res.statusCode,401);res.resume();ws.terminate();resolve();});ws.on('open',()=>reject(Error('Unexpected admission')));ws.on('error',()=>{});});}
 await rejected({});const alice=await cookie(1);await rejected({Cookie:alice,Origin:'https://attacker.example'});
 const outCookie=await cookie(3);const ws=new WebSocket(wsUrl,{headers:{Cookie:outCookie}});clients.push(ws);const received=[];ws.on('message',v=>received.push(JSON.parse(v)));await once(ws,'open');
 async function exchange(payload){const p=once(ws,'message');ws.send(JSON.stringify(payload));return JSON.parse((await p)[0]);}
 const ack=await exchange({type:'auth',userId:4});assert.equal(ack.userId,3);
 const denial=await exchange({type:'join_chat',chatId:20});assert.equal(denial.code,'FORBIDDEN');
 const read=await exchange({type:'mark_read',chatId:20});assert.equal(read.code,'FORBIDDEN');assert.equal(f.writes(),0);
 const member=new WebSocket(wsUrl,{headers:{Cookie:alice}});clients.push(member);const memberMessages=[];member.on('message',v=>memberMessages.push(JSON.parse(v)));await once(member,'open');
 // A typing response is a queue barrier after join_chat, avoiding timer-based races.
 member.send(JSON.stringify({type:'join_chat',chatId:20}));const barrier=once(member,'message');member.send(JSON.stringify({type:'auth'}));await barrier;
 const delivered=once(member,'message');sockets.broadcastToChat(20,{type:'new_message',content:'synthetic'});assert.equal(JSON.parse((await delivered)[0]).type,'new_message');assert.equal(received.some(m=>m.type==='new_message'),false);
 await fetch(base+'/test-logout',{method:'POST',headers:{Cookie:alice}});const closed=once(member,'close');sockets.broadcastToChat(20,{type:'new_message',content:'must not leak'});assert.equal((await closed)[0],1008);assert.equal(memberMessages.some(m=>m.content==='must not leak'),false);
});


test('Google library verifies signatures, audience, issuer, and expiry with local keys', async()=>{
 const {generateKeyPairSync,sign}=require('node:crypto');
 const {OAuth2Client}=require('google-auth-library');
 const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 class OfflineClient extends OAuth2Client {
   async getFederatedSignonCertsAsync(){return {certs:{test:publicKey.export({type:'spki',format:'pem'})}};}
 }
 const verifier=load('src/services/google-auth.js',{'google-auth-library':{OAuth2Client:OfflineClient}});
 const now=Math.floor(Date.now()/1000);
 const payload={sub:'123',email:'alice@gmail.com',email_verified:true,iss:'https://accounts.google.com',aud:'186015897078-3qtjge4dbi3e6sjvp4e4lbulolipioug.apps.googleusercontent.com',iat:now,exp:now+3600};
 function token(p,key=privateKey){const value=Buffer.from(JSON.stringify({alg:'RS256',kid:'test'})).toString('base64url')+'.'+Buffer.from(JSON.stringify(p)).toString('base64url');return value+'.'+sign('RSA-SHA256',Buffer.from(value),key).toString('base64url');}
 assert.equal((await verifier.verifyGoogleCredential(token(payload))).sub,'123');
 await assert.rejects(verifier.verifyGoogleCredential(token({...payload,aud:'attacker-client'})));
 await assert.rejects(verifier.verifyGoogleCredential(token({...payload,iss:'https://attacker.example'})));
 await assert.rejects(verifier.verifyGoogleCredential(token({...payload,iat:now-7200,exp:now-3600})));
 const wrong=generateKeyPairSync('rsa',{modulusLength:2048});await assert.rejects(verifier.verifyGoogleCredential(token(payload,wrong.privateKey)));
});

test('Privacy choices default off, are versioned, persist, and can be withdrawn',async()=>{
 const f=fixture();f.db.exec=async sql=>f.sqlite.exec(sql);
 const privacy=load('src/services/privacy.js',{'../config/db':{db:f.db}});
 try {
  await privacy.initPrivacy();assert.equal((await privacy.getPreferences(1)).analytics,false);
  assert.equal(privacy.parseChoices({analytics:'false',matching:'1',email:false}).analytics,false);
  await privacy.savePreferences(1,{analytics:true,matching:true,email:true},'test');
  const saved=await privacy.getPreferences(1);assert.equal(saved.analytics,true);assert.equal(saved.acknowledged,true);
  await privacy.savePreferences(1,{analytics:false,matching:false,email:false},'settings');
  assert.equal((await privacy.getPreferences(1)).matching,false);
  const events=f.sqlite.prepare('SELECT * FROM privacy_events ORDER BY id').all();assert.equal(events.length,2);assert.equal(JSON.parse(events[1].choices).email,false);assert.equal(events[1].notice_version,privacy.PRIVACY_VERSION);
  assert.equal(await privacy.analyticsAllowed({session:{privacy:{analytics:true}}}),true);
  assert.equal(await privacy.analyticsAllowed({session:{user:{id:1},privacy:{analytics:true}}}),false);
 }finally{f.sqlite.close();}
});
test('Registration API rejects missing/current notice acknowledgement before account creation',async()=>{
 const r=routes();let queried=false;
 load('src/routes/auth.routes.js',{'express':r.express,'../config/db':{db:{get:async()=>{queried=true;}}},'../services/google-auth':{},'../middlewares/auth':{},'../middlewares/upload':{},'../config/security':{},'../services/logger':{},'../services/cloudinary':{},'../services/astrology':{}});
 for(const body of [{},{privacy_version:'outdated',privacy_acknowledged:'true'}]){const res=response();await r.handlers['post /api/register']({body},res,err=>{throw err});assert.equal(res.code,400);}
 assert.equal(queried,false);
});
test('Analytics does not store any visit before opt-in',async()=>{
 let writes=0;const analytics=load('src/services/analytics.service.js',{'../config/db':{db:{run:async()=>writes++}},'./privacy':{analyticsAllowed:async()=>false}});
 await analytics.recordPageVisit({headers:{},socket:{remoteAddress:'127.0.0.1'}});assert.equal(writes,0);
});
test('Matching analytics stops when either party has not opted in',async()=>{
 let queries=0;const service=load('src/services/matchmaking.service.js',{'../config/db':{db:{get:async()=>{queries++;},run:async()=>{queries++;}}},'./privacy':{getPreferences:async id=>({analytics:id===1})},'./astrology':{}});
 await service.logSwipe({swiperId:1,targetId:2,action:'like'});await service.recordMutualMatch(1,1,2);assert.equal(queries,0);
});
test('Privacy request is bound to the signed-in user and enters the admin report queue',async()=>{
 const f=fixture();f.sqlite.exec('CREATE TABLE reports(id INTEGER PRIMARY KEY,reporter_name TEXT,reporter_email TEXT,reported_user TEXT,report_type TEXT,description TEXT,status TEXT,admin_note TEXT,created_at TEXT)');
 const r=routes();load('src/routes/privacy.routes.js',{'express':r.express,'../config/db':{db:f.db},'../middlewares/auth':{}});
 try {
  const req={session:{user:{id:1,name:'Alice',email:'alice@gmail.com'}},body:{type:'delete',description:'Please delete my test account',reporter_email:'owner@gmail.com'}};
  const res=response();await r.handlers['post /api/privacy/requests'](req,res,err=>{throw err});assert.equal(res.code,201);
  const row=f.sqlite.prepare('SELECT * FROM reports').get();assert.equal(row.reporter_email,'alice@gmail.com');assert.equal(row.report_type,'privacy:delete');assert.equal(row.status,'pending');
  const repeat=response();await r.handlers['post /api/privacy/requests'](req,repeat,err=>{throw err});assert.equal(repeat.code,409);
 }finally{f.sqlite.close();}
});


test('Authentication revokes stale owner access without granting any new role', async()=>{
 const auth=load('src/middlewares/auth.js',{'../config/db':{db:{get:async()=>({role:'user',is_active:1})}}});
 const req={headers:{},session:{user:{id:1,role:'owner'}}};let next=false;await auth.requireAuth(req,response(),()=>{next=true});assert.equal(req.session.user.role,'user');assert.equal(next,true);
});
test('Email notifications do not send without opt-in', async()=>{
 const mail=load('src/services/email.js',{'./privacy':{getPreferences:async()=>({email:false})},'nodemailer':{createTransport:()=>{throw Error('must not send');}}});
 await mail.sendMatchEmailNotification({id:1,email:'test@example.test'},{name:'Fixture'});
 await mail.sendChatMessageEmailNotification({id:1,email:'test@example.test'},{name:'Fixture'},'test',20);
});
