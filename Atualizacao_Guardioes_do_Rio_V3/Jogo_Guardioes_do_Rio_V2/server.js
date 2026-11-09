'use strict';
/**
 * Guardiões do Rio v3 — servidor HTTP autoritativo, sem dependências externas.
 * A sincronização é por requisições HTTPS periódicas: não requer WebRTC,
 * WebSocket, broker público ou chaves de API dos participantes.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const QUESTIONS = require('./questions');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const MAX_BODY = 12 * 1024;
const ROOM_TTL_MS = 4 * 60 * 60 * 1000;
const PRESENCE_MS = 15 * 1000;
const avatarSet = ['🧪','🌿','🐟','💧','🦋','🔬','🌻','🦦','🐢','🌳','🦜','♻️','🧬','🍃','🐬','🌊','⚗️','🦉','🐸','🌎'];
const rooms = new Map();
const questionById = new Map(QUESTIONS.map(q=>[q.id,q]));
const MODES={
  facil:[['basico',12]],
  medio:[['basico',6],['facil',6]],
  dificil:[['facil',4],['medio',4],['dificil',4]],
  hard:[['medio',4],['dificil',4],['hard',4]]
};
const POINTS={basico:10,facil:15,medio:25,dificil:35,hard:50};
function levelValue(v){if(typeof v!=='string'||!Object.hasOwn(MODES,v))throw error(400,'Escolha um nível válido: Fácil, Médio, Difícil ou Hard.');return v;}

function error(status, message){const e=new Error(message);e.status=status;return e;}
function normalizeName(value){
  if(typeof value!=='string')throw error(400,'Digite um nome para participar.');
  const name=value.replace(/[\u0000-\u001f\u007f<>]/g,' ').trim().replace(/\s{2,}/g,' ');
  if(name.length<2||name.length>24)throw error(400,'O nome deve ter entre 2 e 24 caracteres.');
  return name;
}
function normalizeCode(v){return String(v||'').trim().toUpperCase().replace(/[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g,'');}
function targetValue(value){
  if(value === null || value === 'livre' || value === '0' || value === 0)return null;
  const n=Number(value);
  if(!Number.isInteger(n) || n<2 || n>10000)throw error(400,'Escolha de 2 a 10.000 vagas ou modo sem limite.');
  return n;
}
function timeValue(v){const n=Number(v);if(![20,30,40,60,90].includes(n))throw error(400,'Tempo por questão inválido.');return n;}
function token(){return crypto.randomBytes(24).toString('hex');}
function newCode(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let code;do{code='';for(let i=0;i<6;i++)code+=chars[crypto.randomInt(chars.length)];}while(rooms.has(code));return code;}
function choose(list,n){const a=[...list];for(let i=a.length-1;i>0;i--){const j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a.slice(0,n);}
function generateDeck(room){
  const chosen=[];
  for(const [difficulty,amount] of MODES[room.level]){
    const eligible=QUESTIONS.filter(q=>q.difficulty===difficulty);
    const fresh=choose(eligible.filter(q=>!room.seen.has(q.id)),amount);
    const selection=fresh.length===amount?fresh:[...fresh,...choose(eligible.filter(q=>!fresh.includes(q)),amount-fresh.length)];
    if(selection.length!==amount)throw new Error('Banco de perguntas insuficiente para o nível escolhido.');
    selection.forEach(q=>room.seen.add(q.id));
    chosen.push(...selection);
  }
  return chosen.map(q=>q.id);
}
function player(name,ordinal){return {id:crypto.randomBytes(5).toString('hex'),token:token(),name,avatar:avatarSet[ordinal%avatarSet.length],score:0,correct:0,joined:Date.now(),lastSeen:Date.now()};}
function createRoom(name,target,seconds,level){
  const code=newCode(), p=player(name,0);
  const room={code, hostToken:p.token, players:[p], target:targetValue(target),seconds:timeValue(seconds),level:levelValue(level),phase:'lobby',round:0,deck:[],seen:new Set(),answers:new Map(),deadline:null,eco:30,reveal:null,revision:1,created:Date.now(),lastActivity:Date.now(),lastResult:null};
  rooms.set(code,room);return {code,token:p.token};
}
function getRoom(code){const room=rooms.get(normalizeCode(code));if(!room)throw error(404,'Sala não encontrada ou encerrada. Peça ao anfitrião um novo link.');room.lastActivity=Date.now();return room;}
function authentication(code,userToken){const room=getRoom(code);const user=room.players.find(p=>p.token===userToken);if(!user)throw error(403,'Seu acesso a esta sala não é mais válido. Entre novamente pelo link.');user.lastSeen=Date.now();return {room,user};}
function requireHost(room,user){if(user.token!==room.hostToken)throw error(403,'Apenas o anfitrião pode realizar essa ação.');}
function touch(room){room.revision++;room.lastActivity=Date.now();}
function online(p){return Date.now()-p.lastSeen<PRESENCE_MS;}
function maybeReveal(room){
  if(room.phase!=='question')return;
  if(Date.now()<room.deadline && room.answers.size<room.players.length)return;
  const q=questionById.get(room.deck[room.round]);
  let hits=0;const gains={};
  for(const p of room.players){
    const a=room.answers.get(p.token);
    if(a && a.choice===q.right){
      hits++; p.correct++;
      const points=POINTS[q.difficulty];
      const bonus=Math.max(0,Math.min(5,Math.floor((room.deadline-a.at)/room.seconds/1000*5)));
      gains[p.id]=points+bonus;p.score+=points+bonus;
    }else gains[p.id]=0;
  }
  const frac=hits/room.players.length;
  const delta=Math.round(8*frac-2);
  room.eco=Math.max(0,Math.min(100,room.eco+delta));
  room.reveal={correct:q.right,explanation:q.explanation,hits,total:room.players.length,delta,gains};
  room.phase='reveal';touch(room);
}
function publicState(room,user){
  maybeReveal(room);
  const p=room.players.find(p=>p.token===user.token);
  const q=room.deck.length?questionById.get(room.deck[room.round]):null;
  const ans=room.answers.get(user.token);
  return {
    code:room.code,revision:room.revision,phase:room.phase,round:room.round,totalRounds:12,
    target:room.target,seconds:room.seconds,level:room.level,eco:room.eco,deadline:room.deadline,serverNow:Date.now(),
    isHost:user.token===room.hostToken,meId:p.id,meName:p.name,
    participants:room.players.map(u=>({id:u.id,name:u.name,avatar:u.avatar,score:u.score,correct:u.correct,online:online(u),isHost:u.token===room.hostToken})),
    question:q?{id:q.id,difficulty:q.difficulty,zone:q.zone,label:q.label,question:q.question,options:q.options}:null,
    answeredCount:room.answers.size,
    myAnswer:ans?ans.choice:null,
    reveal:room.phase==='reveal'?{...room.reveal,myGain:room.reveal.gains[p.id]||0}:null,
    stats:{correct:room.players.reduce((sum,u)=>sum+u.correct,0),possible:room.players.length*12},
  };
}
function reply(res,status,obj){const b=Buffer.from(JSON.stringify(obj));res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff','Content-Length':b.length});res.end(b);}
async function body(req){let str='';for await(const chunk of req){str+=chunk;if(str.length>MAX_BODY)throw error(413,'Solicitação grande demais.');}try{return str?JSON.parse(str):{};}catch{throw error(400,'Dados inválidos.');}}
function requireLobby(room){if(room.phase!=='lobby')throw error(409,'É possível alterar participantes e configurações apenas antes do início.');}
async function route(req,res){
  const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  if(req.method==='GET' && url.pathname==='/health')return reply(res,200,{ok:true,version:3,questions:QUESTIONS.length,rooms:rooms.size});
  if(req.method==='GET' && url.pathname==='/api/state'){
    const {room,user}=authentication(url.searchParams.get('code'),url.searchParams.get('token'));
    return reply(res,200,publicState(room,user));
  }
  if(req.method==='POST' && url.pathname.startsWith('/api/')){
    const b=await body(req);
    if(url.pathname==='/api/create')return reply(res,201,createRoom(normalizeName(b.name),b.target===undefined?5:b.target,b.seconds??40,b.level??'medio'));
    if(url.pathname==='/api/join'){
      const room=getRoom(b.code);requireLobby(room);
      if(room.target!==null&&room.players.length>=room.target)throw error(409,'Esta sala já alcançou a quantidade de jogadores definida.');
      const name=normalizeName(b.name);
      if(room.players.some(p=>p.name.localeCompare(name,'pt-BR',{sensitivity:'base'})===0))throw error(409,'Já há um participante com esse nome. Escolha outro para aparecer no placar.');
      const p=player(name,room.players.length);room.players.push(p);touch(room);
      return reply(res,200,{code:room.code,token:p.token});
    }
    const {room,user}=authentication(b.code,b.token);
    if(url.pathname==='/api/settings'){
      requireHost(room,user);requireLobby(room);
      const t=targetValue(b.target),seconds=timeValue(b.seconds),level=levelValue(b.level??room.level);
      if(t!==null&&t<room.players.length)throw error(409,'O limite não pode ser menor que a quantidade de pessoas que já entraram.');
      room.target=t;room.seconds=seconds;room.level=level;touch(room);
    }else if(url.pathname==='/api/remove'){
      requireHost(room,user);requireLobby(room);
      const p=room.players.find(x=>x.id===b.playerId);
      if(!p||p.token===room.hostToken)throw error(400,'Não é possível remover esse participante.');
      room.players=room.players.filter(x=>x!==p);touch(room);
    }else if(url.pathname==='/api/start'){
      requireHost(room,user);requireLobby(room);
      const connected=room.players.filter(p=>online(p));
      if(connected.length<2)throw error(409,'São necessários pelo menos dois jogadores conectados para iniciar.');
      // Evita que alguém desconectado permaneça no placar de uma nova partida.
      room.players=connected;room.players.forEach(p=>{p.score=0;p.correct=0;});
      room.deck=generateDeck(room);room.round=0;room.eco=30;room.answers=new Map();room.reveal=null;
      room.phase='question';room.deadline=Date.now()+room.seconds*1000;touch(room);
    }else if(url.pathname==='/api/answer'){
      maybeReveal(room);
      if(room.phase!=='question')throw error(409,'O prazo dessa pergunta terminou. Veja o resultado na tela.');
      const choice=Number(b.choice);
      if(!Number.isInteger(choice)||choice<0||choice>3)throw error(400,'Alternativa inválida.');
      if(room.answers.has(user.token))throw error(409,'Sua resposta já foi registrada.');
      room.answers.set(user.token,{choice,at:Date.now()});touch(room);maybeReveal(room);
    }else if(url.pathname==='/api/next'){
      requireHost(room,user);maybeReveal(room);
      if(room.phase!=='reveal')throw error(409,'Espere o resultado da rodada atual.');
      if(room.round===11){room.phase='finished';room.deadline=null;touch(room);}
      else{room.round++;room.answers=new Map();room.reveal=null;room.phase='question';room.deadline=Date.now()+room.seconds*1000;touch(room);}
    }else if(url.pathname==='/api/restart'){
      requireHost(room,user);if(room.phase!=='finished')throw error(409,'Aguarde a conclusão da partida.');
      room.phase='lobby';room.answers=new Map();room.deck=[];room.reveal=null;room.round=0;room.deadline=null;room.eco=30;
      room.players.forEach(p=>{p.score=0;p.correct=0;});touch(room);
    }else if(url.pathname==='/api/leave'){
      if(user.token===room.hostToken){rooms.delete(room.code);return reply(res,200,{ok:true,closed:true});}
      requireLobby(room);
      room.players=room.players.filter(p=>p.token!==user.token);touch(room);
      return reply(res,200,{ok:true,left:true});
    }else throw error(404,'Endereço não encontrado.');
    return reply(res,200,publicState(room,user));
  }
  if(req.method==='GET'&&(url.pathname==='/'||url.pathname==='/index.html')){
    const file=path.join(__dirname,'public','index.html');
    return fs.createReadStream(file).on('error',()=>reply(res,500,{error:'Não foi possível abrir o jogo.'})).pipe(res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'}));
  }
  if(req.method==='GET'&&url.pathname==='/client.js'){const file=path.join(__dirname,'public','client.js');return fs.createReadStream(file).on('error',()=>reply(res,500,{error:'Não foi possível abrir o aplicativo.'})).pipe(res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'}));}
  if(url.pathname==='/favicon.ico'){res.writeHead(204);return res.end();}
  throw error(404,'Página não encontrada.');
}
const server=http.createServer((req,res)=>Promise.resolve().then(()=>route(req,res)).catch(e=>{if(!res.headersSent)reply(res,e.status||500,{error:e.status?e.message:'Erro inesperado no servidor.'}); else res.destroy();if(!e.status)console.error(e);}));
const cleanup=setInterval(()=>{const now=Date.now();for(const [code,room] of rooms)if(now-room.lastActivity>ROOM_TTL_MS)rooms.delete(code);},10*60*1000);cleanup.unref();
if(require.main===module){server.listen(PORT,HOST,()=>console.log(`Guardiões do Rio v3 — http://localhost:${PORT} — ${QUESTIONS.length} questões`));}
module.exports={server,rooms,QUESTIONS};
