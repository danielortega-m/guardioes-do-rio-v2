'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {server,rooms,QUESTIONS}=require('../server');
let base;
const qById=new Map(QUESTIONS.map(q=>[q.id,q]));
const patterns={
  facil:{basico:12},
  medio:{basico:4,facil:8},
  dificil:{facil:4,medio:4,dificil:4},
  hard:{dificil:4,hard:8},
};
async function request(ep,body){
  const r=await fetch(base+ep,{
    method:body?'POST':'GET',
    headers:body?{'content-type':'application/json'}:{},
    body:body?JSON.stringify(body):undefined,
  });
  const contentType=r.headers.get('content-type')||'';
  return {status:r.status,data:contentType.includes('json')?await r.json():await r.text()};
}
async function post(ep,body,expected=200){const r=await request('/api/'+ep,body);assert.equal(r.status,expected,JSON.stringify(r.data));return r.data;}
async function state(auth){const r=await request(`/api/state?code=${auth.code}&token=${auth.token}`);assert.equal(r.status,200);return r.data;}
const tally=arr=>arr.reduce((a,v)=>(a[v]=(a[v]||0)+1,a),{});
async function runRound(host,guest){
  let s=await post('start',host),ids=[],groups=[];
  assert.equal(s.phase,'question');
  for(let i=0;i<12;i++){
    assert.equal(s.totalRounds,12);
    assert.equal(s.round,i);
    assert.equal(s.question.options.length,4);
    assert.equal('right' in s.question,false,'alternativa correta não deve ser exposta antes da resposta');
    assert.equal('explanation' in s.question,false,'explicação não deve ser exposta antes do resultado');
    const q=qById.get(s.question.id);assert.ok(q);
    ids.push(q.id);groups.push(q.difficulty);
    s=await post('answer',{...guest,choice:q.right});
    assert.equal(s.myAnswer,q.right);
    s=await post('answer',{...host,choice:q.right});
    assert.equal(s.phase,'reveal');
    assert.equal(s.reveal.hits,2);
    assert.equal(s.reveal.correct,q.right);
    assert.equal(s.reveal.explanation,q.explanation);
    s=await post('next',host);
  }
  assert.equal(s.phase,'finished');
  assert.equal(new Set(ids).size,12);
  assert.equal(s.stats.possible,24);
  assert.equal(s.stats.correct,24);
  return {ids,groups};
}

test.before(async()=>{await new Promise(ok=>server.listen(0,'127.0.0.1',ok));base=`http://127.0.0.1:${server.address().port}`;});
test.after(async()=>{await new Promise(ok=>server.close(ok));});

test('banco validado: 200 perguntas, 40 em cada faixa interna, sem enunciados duplicados',()=>{
  assert.equal(QUESTIONS.length,200);
  assert.deepEqual(tally(QUESTIONS.map(q=>q.difficulty)),{facil:40,medio:40,dificil:40,basico:40,hard:40});
  assert.equal(new Set(QUESTIONS.map(q=>q.id)).size,200);
  const normalized=QUESTIONS.map(q=>q.question.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase());
  assert.equal(new Set(normalized).size,200,'enunciados idênticos');
  for(const q of QUESTIONS){
    assert.equal(q.options.length,4,q.id);
    assert.equal(new Set(q.options).size,4,q.id);
    assert.ok(Number.isInteger(q.right)&&q.right>=0&&q.right<4,q.id);
    assert.ok(q.question.length>12,q.id);
    assert.ok(q.explanation.length>25,q.id);
    assert.ok(q.zone&&q.label,q.id);
  }
});

test('os 4 modos têm exatamente 12 perguntas coerentes com a dificuldade escolhida',async()=>{
  for(const [mode,expected] of Object.entries(patterns)){
    const host=await post('create',{name:`Anfitrião ${mode}`,target:2,seconds:20,level:mode},201);
    const guest=await post('join',{code:host.code,name:'Aluno 2'});
    assert.equal((await state(guest)).level,mode);
    const result=await runRound(host,guest);
    assert.deepEqual(tally(result.groups),expected,`modo ${mode}`);
    rooms.delete(host.code);
  }
});

test('o nível Fácil é o padrão e não introduz categorias avançadas',async()=>{
  const host=await post('create',{name:'Educadora',target:2,seconds:40},201);
  const guest=await post('join',{code:host.code,name:'Estudante'});
  let s=await state(guest);assert.equal(s.level,'facil');
  const result=await runRound(host,guest);assert.deepEqual(tally(result.groups),{basico:12});
  rooms.delete(host.code);
});

test('anfitrião altera dificuldade na espera, sem alterar quantidade de questões',async()=>{
  const host=await post('create',{name:'Anfitrião',target:3,seconds:40,level:'hard'},201);
  const guest=await post('join',{code:host.code,name:'Aluna'});
  const r=await post('settings',{...host,target:null,seconds:60,level:'medio'});
  assert.equal(r.target,null);assert.equal(r.level,'medio');assert.equal(r.seconds,60);
  assert.equal((await state(guest)).level,'medio');
  const result=await runRound(host,guest);
  assert.deepEqual(tally(result.groups),patterns.medio);
  rooms.delete(host.code);
});

test('mesma sala prioriza questões inéditas nas partidas seguintes',async()=>{
  const host=await post('create',{name:'Turma',target:null,seconds:20,level:'facil'},201);
  const guest=await post('join',{code:host.code,name:'Colega'});
  const overall=[];
  for(let i=0;i<3;i++){
    const round=await runRound(host,guest);overall.push(...round.ids);
    if(i<2){const lobby=await post('restart',host);assert.equal(lobby.phase,'lobby');}
  }
  assert.equal(overall.length,36);
  assert.equal(new Set(overall).size,36,'deve evitar repetir perguntas com banco disponível');
  rooms.delete(host.code);
});

test('entrada, limites, permissões e respostas duplicadas seguem protegidos',async()=>{
  const host=await post('create',{name:'Responsável',target:3,seconds:20,level:'dificil'},201);
  const guest=await post('join',{code:host.code,name:'Colega 1'});
  const guest2=await post('join',{code:host.code,name:'Colega 2'});
  assert.equal((await post('join',{code:host.code,name:'Colega 3'},409)).error,'Esta sala já alcançou a quantidade de jogadores definida.');
  assert.equal((await post('settings',{...guest,target:9,seconds:20,level:'hard'},403)).error,'Apenas o anfitrião pode realizar essa ação.');
  await post('settings',{...host,target:null,seconds:40,level:'facil'});
  assert.equal((await state(guest2)).target,null);
  await post('start',host);
  const s=await post('answer',{...guest,choice:0});assert.equal(s.myAnswer,0);
  await post('answer',{...guest,choice:1},409);
  const invalid=await request('/api/state?code='+host.code+'&token=INVALID');assert.equal(invalid.status,403);
  rooms.delete(host.code);
});

test('servidor entrega interface V4 e confirma versão 4 no monitoramento',async()=>{
  const home=await request('/');assert.equal(home.status,200);assert.ok(home.data.includes('V4'));assert.ok(home.data.includes('/client.js'));
  const client=await request('/client.js');assert.equal(client.status,200);assert.ok(client.data.includes('200 questões'));assert.ok(client.data.includes('levelOptions'));
  const h=await request('/health');assert.equal(h.status,200);assert.deepEqual({ok:h.data.ok,version:h.data.version,questions:h.data.questions},{ok:true,version:4,questions:200});
});
