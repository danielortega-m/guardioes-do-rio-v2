'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {server,rooms,QUESTIONS}=require('../server');
let base;
async function request(endpoint,body){
 const r=await fetch(base+endpoint,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
 const d=r.headers.get('content-type').includes('application/json')?await r.json():await r.text();
 return {status:r.status,data:d};
}
async function post(ep,body,expected=200){const res=await request('/api/'+ep,body);assert.equal(res.status,expected,JSON.stringify(res.data));return res.data;}
async function state(auth){return (await request(`/api/state?code=${auth.code}&token=${auth.token}`)).data;}
const counts={facil:0,medio:0,dificil:0};for(const q of QUESTIONS)counts[q.difficulty]++;
test.before(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;});
test.after(async()=>{await new Promise(resolve=>server.close(resolve));});
test('o banco contém 72 questões válidas, 24 por nível',()=>{
 assert.equal(QUESTIONS.length,72);assert.deepEqual(counts,{facil:24,medio:24,dificil:24});
 assert.equal(new Set(QUESTIONS.map(q=>q.id)).size,72);
 for(const q of QUESTIONS){assert.equal(q.options.length,4);assert.ok(q.right>=0&&q.right<=3);assert.ok(q.explanation.length>30);}
});
test('cria sala, permite 8 jogadores, ajusta limite e sincroniza 12 perguntas',async()=>{
 const host=await post('create',{name:'Anfitriã',target:8,seconds:20},201);
 const other=[];for(let i=2;i<=8;i++)other.push(await post('join',{code:host.code,name:`Aluno ${i}`}));
 assert.equal((await state(host)).participants.length,8);
 assert.equal((await post('join',{code:host.code,name:'Extra'},409)).error,'Esta sala já alcançou a quantidade de jogadores definida.');
 await post('settings',{...host,target:11,seconds:30});
 const newPlayer=await post('join',{code:host.code,name:'Aluno extra'});
 assert.equal((await state(newPlayer)).participants.length,9);
 assert.equal((await post('start',{...other[0]},403)).error,'Apenas o anfitrião pode realizar essa ação.');
 let s=await post('start',host);
 assert.equal(s.phase,'question');assert.equal(s.participants.length,9);
 assert.equal(s.question.options.length,4);assert.equal('correct' in s.question,false);assert.equal('right' in s.question,false);
 const ids=[],levels={facil:0,medio:0,dificil:0};
 const all=[host,...other,newPlayer];
 for(let i=0;i<12;i++){
  const q=QUESTIONS.find(q=>q.id===s.question.id);ids.push(q.id);levels[q.difficulty]++;
  assert.equal(s.question.difficulty,i<4?'facil':i<8?'medio':'dificil');
  for(const p of all)s=await post('answer',{...p,choice:q.right});
  assert.equal(s.phase,'reveal');assert.equal(s.reveal.hits,9);assert.equal(s.reveal.correct,q.right);
  if(i===0)assert.equal((await post('answer',{...host,choice:q.right},409)).error,'O prazo dessa pergunta terminou. Veja o resultado na tela.');
  s=await post('next',host);
  if(i<11)assert.equal(s.phase,'question');
 }
 assert.deepEqual(levels,{facil:4,medio:4,dificil:4});
 assert.equal(new Set(ids).size,12);assert.equal(s.phase,'finished');
 assert.ok(s.eco>=70);assert.equal(s.stats.correct,108);assert.equal(s.stats.possible,108);
 const restart=await post('restart',host);assert.equal(restart.phase,'lobby');
 s=await post('start',host);assert.ok(!ids.includes(s.question.id),'O novo jogo não deve repetir perguntas até esgotar o banco');
});
test('sem limite permite 2, 5, 6 ou mais e o anfitrião pode alterar a quantidade',async()=>{
 const host=await post('create',{name:'Criador',target:null,seconds:40},201);
 assert.equal((await state(host)).target,null);
 await post('settings',{...host,target:6,seconds:60});
 assert.equal((await state(host)).target,6);
 await post('settings',{...host,target:null,seconds:40});
 assert.equal((await state(host)).target,null);
 const two=await post('join',{code:host.code,name:'Convidado'});
 const ready=await post('start',host);assert.equal(ready.participants.length,2);
 assert.equal((await post('join',{code:host.code,name:'Tardio'},409)).error,'É possível alterar participantes e configurações apenas antes do início.');
 assert.equal((await state(two)).code,host.code);
});
test('evita respostas duplicadas, token inválido e expiração de tempo',async()=>{
 const host=await post('create',{name:'Educador',target:2,seconds:20},201);
 const guest=await post('join',{code:host.code,name:'Estudante'});
 await post('start',host);
 let s=await post('answer',{...guest,choice:2});
 assert.equal(s.phase,'question');assert.equal(s.myAnswer,2);
 await post('answer',{...guest,choice:2},409);
 rooms.get(host.code).deadline=Date.now()-1;
 s=await state(host);assert.equal(s.phase,'reveal');assert.equal(s.answeredCount,1);
 const invalid=await request(`/api/state?code=${host.code}&token=tokenerrado`);assert.equal(invalid.status,403);
});
test('entrega HTML e JS do mesmo servidor',async()=>{
 const r=await fetch(base+'/');assert.equal(r.status,200);const html=await r.text();assert.ok(html.includes('GUARDIÕES DO RIO'));assert.ok(html.includes('/client.js'));
 const client=await fetch(base+'/client.js');assert.equal(client.status,200);assert.ok((await client.text()).includes('renderLobby'));
 const health=await request('/health');assert.equal(health.data.questions,72);
});
