(()=>{
'use strict';
const $=s=>document.querySelector(s);
const main=$('#mainContent');
const labels=['A','B','C','D'];
const difficulties={facil:{name:'FÁCIL',points:10,emoji:'🌱'},medio:{name:'MÉDIA',points:20,emoji:'⚗️'},dificil:{name:'DIFÍCIL',points:30,emoji:'🔥'}};
const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const roomPattern=/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
const qs=new URLSearchParams(location.search);
let pendingRoom=(qs.get('sala')||'').toUpperCase().replace(/[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g,'').slice(0,6);
let credentials=null, state=null, renderedRevision=-1, renderedKey='', pollHandle=null, clockOffset=0, requestPending=false, helpOpen=false, mute=true;
let liveMessage='', connected=true, connectionFailures=0;
let soundCtx=null;
function sound(f=490,d=.095){if(mute)return;try{soundCtx=soundCtx||new(window.AudioContext||window.webkitAudioContext)();const o=soundCtx.createOscillator(),g=soundCtx.createGain();o.type='sine';o.frequency.value=f;o.connect(g);g.connect(soundCtx.destination);g.gain.setValueAtTime(.03,soundCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,soundCtx.currentTime+d);o.start();o.stop(soundCtx.currentTime+d);}catch{}}
function notify(msg,kind='info'){
 const e=$('#toast');e.textContent=msg;e.classList.add('show');e.setAttribute('data-kind',kind);
 clearTimeout(notify.t);notify.t=setTimeout(()=>e.classList.remove('show'),4100);
}
function setBanner(message='',isBad=false){const b=$('#connectionAlert');if(!b)return;b.hidden=!message;b.classList.toggle('error',!!isBad);b.textContent=message;}
function showError(err){notify(err.message||'Não foi possível completar a operação.','error');}
function rememberName(name){try{localStorage.setItem('gdr-nome',name);}catch{}}
function lastName(){try{return localStorage.getItem('gdr-nome')||'';}catch{return '';}}
function credentialKey(code){return 'gdr-v2-'+code;}
function rememberSession(obj){try{localStorage.setItem(credentialKey(obj.code),obj.token);}catch{}}
function forgetSession(code){try{localStorage.removeItem(credentialKey(code));}catch{}}
function linkToRoom(code){const u=new URL(location.href);u.searchParams.set('sala',code);u.hash='';return u.toString();}
function setUrl(code){const u=new URL(location.href);if(code)u.searchParams.set('sala',code);else u.searchParams.delete('sala');history.replaceState({},'',u.pathname+u.search+u.hash);}
async function api(endpoint,data=null){
 const controller=new AbortController();const t=setTimeout(()=>controller.abort(),9500);
 try{
  const opts={method:data?'POST':'GET',cache:'no-store',signal:controller.signal};
  if(data){opts.headers={'Content-Type':'application/json'};opts.body=JSON.stringify(data);}
  const resp=await fetch(`/api/${endpoint}`,opts);
  const contentType=resp.headers.get('content-type')||'';
  if(!contentType.includes('application/json'))throw new Error('Este link está hospedado como site estático. Para que as salas funcionem, publique a nova versão como Serviço Web (Render). Veja o guia do pacote.');
  const result=await resp.json();
  if(!resp.ok)throw Object.assign(new Error(result.error||'Não foi possível conectar.'),{code:resp.status});
  return result;
 }catch(err){
   if(err.name==='AbortError')throw new Error('Servidor demorou a responder. Verifique a internet e tente novamente.');
   if(err instanceof TypeError)throw new Error('Não foi possível alcançar o servidor da sala. Verifique a conexão ou a publicação do jogo.');
   throw err;
 }finally{clearTimeout(t);}
}
function clearPoll(){clearTimeout(pollHandle);pollHandle=null;}
function startPoll(){clearPoll();pollHandle=setTimeout(poll,1250);}
async function poll(){
 if(!credentials)return;
 try{
  const next=await api(`state?code=${encodeURIComponent(credentials.code)}&token=${encodeURIComponent(credentials.token)}`);
  connectionFailures=0;connected=true;setBanner('');accept(next);
 }catch(err){
  connectionFailures++;connected=false;
  if(err.code===403||err.code===404){const old=credentials?.code;credentials=null;state=null;renderedRevision=-1;clearPoll();if(old)forgetSession(old);setUrl(null);renderWelcome();setBanner(err.message,true);return;}
  if(connectionFailures>=2)setBanner('⚠️ Conexão com o servidor temporariamente interrompida. Tentando novamente automaticamente…',true);
 }finally{if(credentials)pollHandle=setTimeout(poll,connectionFailures?Math.min(7000,1500*connectionFailures):1300);}
}
function accept(snapshot){
 if(state&&state.code===snapshot.code&&snapshot.revision<state.revision)return;
 const old=state;state=snapshot;clockOffset=snapshot.serverNow-Date.now();
 const presenceKey=snapshot.participants.map(p=>p.id+(p.online?'1':'0')).join(',');
 if(renderedRevision!==snapshot.revision || renderedKey!==presenceKey || !old || old.phase!==snapshot.phase){
  renderedRevision=snapshot.revision;renderedKey=presenceKey;render();
 }
 updateTimer();
}
async function connectSession(code,token){
 credentials={code,token};helpOpen=false;setBanner('Conectando à sala compartilhada…');
 try{
  const s=await api(`state?code=${encodeURIComponent(code)}&token=${encodeURIComponent(token)}`);
  rememberSession(credentials);setUrl(code);accept(s);setBanner('');startPoll();sound(700);
 }catch(err){credentials=null;forgetSession(code);setUrl(null);renderWelcome();setBanner(err.message,true);throw err;}
}
async function submit(endpoint,data){
 if(requestPending||!credentials)return;
 requestPending=true;
 try{const next=await api(endpoint,{code:credentials.code,token:credentials.token,...data});if(next?.phase)accept(next);return next;}
 catch(err){showError(err);if(credentials){try{const s=await api(`state?code=${credentials.code}&token=${credentials.token}`);accept(s);}catch{}}}
 finally{requestPending=false;}
}
function renderWelcome(){
 $('#headerStatus').textContent='🌎 Jogue com sua turma';
 $('#connectionInfo').textContent='💚 Um link • participantes livres • 12 desafios';
 $('#playerCount').textContent='Ninguém na sala';
 $('#ranking').innerHTML='<div class="muted-note">Crie ou entre em uma sala para ver os guardiões.</div>';
 $('#stepper').innerHTML='';$('#stepText').textContent='72 perguntas no banco • 12 sorteadas por partida';
 updateScene(30);
 const pre=!!pendingRoom;
 main.innerHTML=`<div class="eyebrow">🌱 UMA MISSÃO INTERATIVA</div><h1>O futuro do rio está nas suas mãos.</h1><p>Entre com seu nome, resolva desafios de Química com sua turma e ajude a transformar a água poluída em um ecossistema vivo.</p><div class="tagrow"><span class="tag">👥 Quantos jogadores quiser</span><span class="tag">🎲 72 questões diferentes</span><span class="tag">⚗️ Fácil, média e difícil</span><span class="tag">🏁 12 por partida</span></div><div class="form-grid"><div><label class="form-label" for="nameInput">SEU NOME NO JOGO</label><input id="nameInput" type="text" maxlength="24" autocomplete="nickname" placeholder="Digite seu nome" value="${escapeHtml(lastName())}"></div><div><label class="form-label" for="roomInput">CÓDIGO DA SALA ${pre?'(RECEBIDO PELO LINK)':'(PARA ENTRAR)'}</label><input id="roomInput" type="text" maxlength="6" autocomplete="off" placeholder="Ex.: G7MT9K" value="${escapeHtml(pendingRoom)}" style="text-transform:uppercase;letter-spacing:3px;font-weight:900"></div><div class="button-row"><button class="primary" data-action="join">🔗 Entrar na sala</button><button class="secondary" data-action="create-view">✨ ${pre?'Ou criar outra sala':'Criar uma sala'}</button></div><div class="box-muted intro-tip">Não precisa cadastrar e-mail nem criar senha. Cada participante entra com o próprio nome pelo link da sala. <strong>O anfitrião organiza a partida.</strong></div></div>`;
}
function renderCreate(){
 const initialName=$('#nameInput')?.value||lastName();
 main.innerHTML=`<div class="eyebrow">✨ CRIAR SALA COMPARTILHADA</div><h2>Prepare sua equipe</h2><p>Você escolhe a quantidade de participantes antes de iniciar. Se preferir, deixe a sala aberta sem limite definido.</p><div class="form-grid"><div><label class="form-label" for="nameInput">SEU NOME (ANFITRIÃO)</label><input id="nameInput" maxlength="24" type="text" value="${escapeHtml(initialName)}" placeholder="Seu nome"></div><div class="settings-grid"><div><label class="form-label" for="modeInput">QUANTIDADE DE JOGADORES</label><select id="modeInput"><option value="fixed">Definir número</option><option value="free">Sem limite definido</option></select></div><div id="targetContainer"><label class="form-label" for="targetInput">QUANTOS JOGADORES?</label><input id="targetInput" type="number" min="2" max="10000" step="1" value="5" inputmode="numeric"></div><div><label class="form-label" for="secondsInput">TEMPO POR PERGUNTA</label><select id="secondsInput">${[20,30,40,60,90].map(v=>`<option value="${v}" ${v===40?'selected':''}>${v} segundos</option>`).join('')}</select></div></div><div class="button-row"><button class="primary" data-action="create">🌍 Criar sala e pegar o link</button><button class="secondary" data-action="welcome">← Voltar</button></div><p class="muted-note">Em cada partida, são 12 desafios sorteados: 4 fáceis, 4 médios e 4 difíceis. Você também pode mudar as configurações na sala de espera.</p></div>`;
}
function presenceCount(s){return s.participants.filter(p=>p.online).length;}
function renderLobby(s){
 const online=presenceCount(s),target=s.target===null?'livres':s.target;
 const invite=linkToRoom(s.code),mode=s.target===null?'free':'fixed';
 const freeSlots=s.target!==null?Math.max(0,s.target-s.participants.length):null;
 const placeholders=freeSlots===null?0:Math.min(freeSlots,Math.max(0,12-s.participants.length));
 const occupants=s.participants.map(p=>`<div class="slot ${p.online?'':'offline'}"><span class="avatar">${p.avatar}</span><strong title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</strong><small>${p.online?'🟢 Online':'⚪ Desconectado'}</small>${s.isHost&&!p.isHost?`<button class="kick" data-action="remove" data-player-id="${p.id}" aria-label="Retirar ${escapeHtml(p.name)}">✕</button>`:''}${p.isHost?'<small>👑 Anfitrião</small>':''}</div>`).join('');
 const empty=Array.from({length:placeholders},()=>'<div class="slot empty"><span class="avatar">➕</span><strong>Vaga livre</strong><small>Aguardando</small></div>').join('');
 main.innerHTML=`<div class="eyebrow">🧭 PONTO DE ENCONTRO</div><h2>${online===1?'Chame sua equipe!':'A equipe está chegando!'}</h2><p>Todos entram pelo mesmo link, com seus próprios nomes. O anfitrião começa quando houver pelo menos dois participantes conectados.</p><div class="invite-layout"><div class="invitation"><div><div class="invite-meta">CÓDIGO DA SALA</div><div class="room-code">${s.code}</div><div class="url-line">${escapeHtml(invite)}</div></div><button class="secondary" data-action="copy">📋 Copiar link</button></div></div><div class="mini-heading" style="margin-top:17px"><strong>👥 Guardiões na sala (${online} online)</strong><span class="tag">${s.target===null?'Sem limite':`${s.participants.length} / ${s.target}`}</span></div><div class="lobby-slot-list">${occupants}${empty}</div>${freeSlots>placeholders?`<p class="muted-note">+ ${freeSlots-placeholders} vagas disponíveis.</p>`:''}${s.isHost?`<div class="box-muted" style="margin-top:14px"><strong style="font-size:12px;color:#dafa92">⚙️ Configurações da sala</strong><div class="settings-grid" style="margin-top:13px"><div><label class="form-label" for="modeInput">QUANTIDADE</label><select id="modeInput"><option value="fixed" ${mode==='fixed'?'selected':''}>Definir número</option><option value="free" ${mode==='free'?'selected':''}>Sem limite</option></select></div><div id="targetContainer" ${mode==='free'?'hidden':''}><label class="form-label" for="targetInput">JOGADORES</label><input id="targetInput" type="number" min="2" max="10000" step="1" value="${s.target??Math.max(5,s.participants.length)}"></div><div><label class="form-label" for="secondsInput">TEMPO / PERGUNTA</label><select id="secondsInput">${[20,30,40,60,90].map(v=>`<option value="${v}" ${s.seconds===v?'selected':''}>${v} s</option>`).join('')}</select></div></div><button class="text-btn" data-action="settings" style="margin-top:13px">💾 Salvar configurações</button></div><div class="button-row" style="margin-top:17px"><button class="primary" data-action="start" ${online<2?'disabled':''}>▶️ Começar os 12 desafios</button><span class="muted-note">${online<2?'Aguarde pelo menos mais 1 participante.':`Pronto para começar com ${online} pessoas.`}</span></div>`:`<div class="box-muted" style="margin-top:16px"><b style="color:#dafa92">✅ Você entrou na sala!</b><p style="margin:7px 0 0">Aguarde o anfitrião iniciar a missão. Se a tela não atualizar, confira sua internet.</p></div>`}<p class="muted-note" style="margin-top:18px">Os participantes desconectados podem voltar pelo mesmo link. O anfitrião pode retirá-los antes de iniciar.</p>`;
}
function renderQuestion(s){
 const q=s.question,level=difficulties[q.difficulty];const responded=s.myAnswer!==null;
 main.innerHTML=`<div class="question-top"><div class="eyebrow" style="margin:0">${level.emoji} ${level.name} • ${escapeHtml(q.zone)} • ${escapeHtml(q.label)}</div><div class="timer" id="timeLeft">⏱️ ${s.seconds}s</div></div><div class="round-hint">DESAFIO ${s.round+1} DE 12 <span>• Vale ${level.points} pontos + até 5 de bônus</span></div><h2 style="margin-top:12px">${escapeHtml(q.question)}</h2><div class="options">${q.options.map((text,i)=>`<button class="option ${s.myAnswer===i?'chosen':''}" data-choice="${i}" ${responded?'disabled':''}><span class="letter">${labels[i]}</span><span>${escapeHtml(text)}</span>${s.myAnswer===i?'<span style="margin-left:auto">✓</span>':''}</button>`).join('')}</div><div class="answer-badge">${responded?'✅ Resposta registrada! Aguarde o grupo.':'🔐 Escolha uma alternativa. O acerto só será mostrado após todos responderem ou acabar o tempo.'}<p style="margin:8px 0 0" id="answerCount">${s.answeredCount} de ${s.participants.length} responderam.</p></div>`;
}
function renderReveal(s){
 const q=s.question,r=s.reveal,correct=r.correct,chosen=s.myAnswer;
 const verdict=chosen===correct?'🌟 Resposta correta!':chosen===null?'⏱️ O tempo acabou!':'💡 Aprender também faz parte!';
 main.innerHTML=`<div class="eyebrow">🧬 CONCLUSÃO DO DESAFIO ${s.round+1}/12</div><h2>${verdict}</h2><p>${escapeHtml(q.question)}</p><div class="options compact">${q.options.map((x,i)=>`<div class="option ${i===correct?'correct':chosen===i?'wrong':''}"><span class="letter">${labels[i]}</span><span>${escapeHtml(x)}</span>${i===correct?'<strong style="margin-left:auto">✅</strong>':chosen===i?'<strong style="margin-left:auto">✕</strong>':''}</div>`).join('')}</div><div class="feedback"><b>🌍 A Química explica o impacto ambiental</b><p>${escapeHtml(r.explanation)}</p></div><div class="outcome-cards"><div class="outcome"><small>💧 Saúde do rio</small><strong style="color:${r.delta>=0?'#dafa92':'#ffa895'}">${r.delta>=0?'+':''}${r.delta}%</strong></div><div class="outcome"><small>🏅 Sua pontuação nesta questão</small><strong>+${r.myGain}</strong></div></div><p class="muted-note">🎯 ${r.hits} de ${r.total} jogadores acertaram.</p>${s.isHost?`<button class="primary" data-action="next">${s.round===11?'🏁 Revelar o resultado final':'▶️ Próximo desafio'}</button>`:'<div class="box-muted">⏳ Aguardando o anfitrião avançar para o próximo desafio.</div>'}`;
}
function renderFinish(s){
 const ranking=[...s.participants].sort((a,b)=>b.score-a.score),won=s.eco>=70;
 const champion=ranking[0];
 main.innerHTML=`<div class="eyebrow">🏁 FIM DA MISSÃO</div><div class="finish-hero">${won?'🏞️':'🌱'}</div><h1 style="font-size:clamp(30px,4vw,46px)">${won?'Vocês salvaram o rio!':'A missão continua!'}</h1><p>${won?'A equipe conseguiu recuperar o ecossistema usando conhecimentos de Química e Educação Ambiental.':'A equipe conquistou novos conhecimentos! Uma nova tentativa pode ajudar a restaurar totalmente o rio.'}</p><p class="finish-line">🏆 Destaque: ${escapeHtml(champion.name)} — ${champion.score} pontos</p><div class="outcome-cards"><div class="outcome"><small>💧 Saúde final do rio</small><strong>${s.eco}%</strong></div><div class="outcome"><small>✅ Respostas corretas da equipe</small><strong>${s.stats.correct} / ${s.stats.possible}</strong></div></div><div class="feedback"><b>📚 E o aprendizado?</b><p>O pH, os equilíbrios ácido-base, os nutrientes e os contaminantes influenciam a qualidade da água. A prevenção da poluição exige monitoramento, tratamento e atitudes responsáveis.</p></div>${s.isHost?'<button class="primary" data-action="restart">🔁 Outra partida com 12 perguntas diferentes</button>':'<div class="box-muted">Aguarde o anfitrião preparar uma nova partida para a turma.</div>'}`;
 if(won && s.isHost)celebrate();
}
function renderHelp(){
 main.innerHTML=`<div class="eyebrow">📗 MANUAL DO JOGO</div><h2>Como jogar Guardiões do Rio</h2><div class="help-steps"><div class="help-step"><span class="help-num">1</span><span>Uma pessoa cria a sala e escolhe quantos jogadores deseja. Também existe a opção <b>Sem limite</b>.</span></div><div class="help-step"><span class="help-num">2</span><span>Copie o link da sala e envie no WhatsApp. Cada colega abre o link e digita o próprio nome, sem cadastro.</span></div><div class="help-step"><span class="help-num">3</span><span>Com pelo menos duas pessoas presentes, o anfitrião inicia. Todos respondem simultaneamente 12 desafios, sendo 4 fáceis, 4 médios e 4 difíceis.</span></div><div class="help-step"><span class="help-num">4</span><span>Os acertos geram pontos individuais e recuperam a saúde do rio. O resultado só aparece após todos responderem ou acabar o tempo.</span></div><div class="help-step"><span class="help-num">5</span><span>Ao final, existe um vencedor individual e uma missão coletiva: atingir 70% de saúde ambiental. A próxima partida sorteia novas questões.</span></div></div><div class="button-row" style="margin-top:22px"><button class="primary" data-action="resume">← Voltar ao jogo</button></div><p class="muted-note" style="margin-top:18px">Esta versão usa comunicação com um servidor central via HTTPS, sem WebRTC. Não funciona corretamente se publicada apenas como site estático.</p>`;
}
function updateScene(value,place){
 const health=Math.max(0,Math.min(100,value));
 const scaled=Math.max(0,(health-20)/80);
 $('#riverBlue').style.opacity=String(.13+.87*scaled);
 $('#trash').style.opacity=String(Math.max(0,.95-scaled*.94));
 $('#smog').style.opacity=String(Math.max(0,.84-scaled*.77));
 $('#fishSchool').style.opacity=String(.12+.88*scaled);
 $('#flowers').style.opacity=String(.15+.85*scaled);
 $('#scene').dataset.quality=health>=65?'high':health>=43?'medium':'low';
 $('#ecoBubble').textContent=health+'%';$('#ecoPercent').textContent=health+'%';$('#ecoFill').style.width=health+'%';
 $('#zoneBadge').textContent=place||'Vale das águas';
 const level=health>=70?['🌳 Ecossistema recuperado','A água está cada vez mais saudável!']:health>=45?['💧 Recuperação em andamento','A equipe já está fazendo a diferença!']:['🚨 Rio em perigo','Sua equipe precisa agir para recuperar a vida aquática.'];
 $('#worldTitle').textContent=level[0];$('#worldSubtitle').textContent=level[1];
}
function renderSide(s){
 $('#headerStatus').textContent=`🌐 ${presenceCount(s)} guardiões online`;
 $('#playerCount').textContent=s.target===null?`${s.participants.length} jogadores • livres`:`${s.participants.length} / ${s.target}`;
 $('#connectionInfo').textContent=`🌎 Sala ${s.code} • perguntas aleatórias • 12 desafios`;
 const sorted=[...s.participants].sort((a,b)=>b.score-a.score || a.name.localeCompare(b.name));
 $('#ranking').innerHTML=sorted.map((p,i)=>`<div class="rank-item ${p.id===s.meId?'self':''}"><span class="rank-order">${i+1}º</span><span class="rank-face">${p.avatar}</span><div class="rank-person"><b title="${escapeHtml(p.name)}">${escapeHtml(p.name)} ${p.isHost?'👑':''}</b><small>${p.correct} acertos • ${p.online?'🟢 online':'⚪ offline'}</small></div><span class="rank-score">${p.score}</span></div>`).join('');
 $('#stepper').innerHTML=Array.from({length:12},(_,i)=>`<span class="step ${s.phase==='finished'||(s.phase!=='lobby'&&i<s.round)?'done':(s.phase==='question'||s.phase==='reveal')&&i===s.round?'current':''}"></span>`).join('');
 $('#stepText').textContent=s.phase==='lobby'?'72 questões • sorteio de 12 a cada partida':s.phase==='finished'?'Missão encerrada!':`Questão ${s.round+1} de 12 • ${s.question?.zone||'Rio'}`;
 updateScene(s.eco,s.question?.zone||'Vale das águas');
}
function render(){
 if(!state){renderWelcome();return;}
 renderSide(state);
 if(helpOpen){renderHelp();return;}
 switch(state.phase){case'lobby':renderLobby(state);break;case'question':renderQuestion(state);break;case'reveal':renderReveal(state);break;case'finished':renderFinish(state);break;default:renderLobby(state);}
 updateTimer();
}
function updateTimer(){
 if(!state||state.phase!=='question')return;
 const timer=$('#timeLeft');if(!timer)return;
 const secs=Math.max(0,Math.ceil((state.deadline-Date.now()-clockOffset)/1000));
 timer.textContent=`⏱️ ${secs}s`;timer.classList.toggle('urgent',secs<=8);
 const count=$('#answerCount');if(count)count.textContent=`${state.answeredCount} de ${state.participants.length} responderam.`;
}
function celebrate(){const wrap=$('#confetti');wrap.innerHTML='';const colors=['#dafa92','#8ef1c4','#77d8eb','#ffd28b','#ffb8a8'];for(let i=0;i<45;i++){const e=document.createElement('i');e.className='confetti';e.style.left=(Math.random()*100)+'%';e.style.background=colors[i%colors.length];e.style.animationDelay=Math.random()*1.5+'s';e.style.transform=`rotate(${Math.random()*360}deg)`;wrap.appendChild(e);}setTimeout(()=>wrap.innerHTML='',4000);}
function settingsData(){const mode=$('#modeInput')?.value||'fixed';const target=mode==='free'?null:Number($('#targetInput')?.value);const seconds=Number($('#secondsInput')?.value||40);if(mode!=='free' && (!Number.isInteger(target)||target<2||target>10000)){notify('Escolha pelo menos dois jogadores ou selecione Sem limite.','error');return null;}return {target,seconds};}
async function create(){if(requestPending)return;const name=$('#nameInput')?.value.trim();if(!name||name.length<2){notify('Digite um nome com pelo menos duas letras.','error');return;}const settings=settingsData();if(!settings)return;rememberName(name);requestPending=true;setBanner('Criando uma sala no servidor…');try{const created=await api('create',{name,...settings});pendingRoom=created.code;requestPending=false;await connectSession(created.code,created.token);notify('Sua sala foi criada! Copie o link e convide a turma.','success');}catch(err){requestPending=false;setBanner(err.message,true);showError(err);}}
async function join(){if(requestPending)return;const name=$('#nameInput')?.value.trim(),code=($('#roomInput')?.value||pendingRoom).toUpperCase().replace(/[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g,'');if(!name||name.length<2){notify('Digite seu nome para participar.','error');return;}if(!roomPattern.test(code)){notify('O código da sala deve ter 6 caracteres.','error');return;}rememberName(name);requestPending=true;setBanner('Entrando na sala compartilhada…');try{const entry=await api('join',{name,code});pendingRoom=entry.code;requestPending=false;await connectSession(entry.code,entry.token);notify('Você entrou na equipe!','success');}catch(err){requestPending=false;setBanner(err.message,true);showError(err);}}
async function copyLink(){if(!state)return;const text=linkToRoom(state.code);try{if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text);}else{const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();document.execCommand('copy');area.remove();}notify('Link copiado! Envie no grupo do WhatsApp.','success');}catch{notify('Copie o endereço mostrado abaixo do código da sala.','error');}}
function navigateHome(){state=null;credentials=null;helpOpen=false;clearPoll();renderedRevision=-1;pendingRoom='';setUrl(null);setBanner('');renderWelcome();}
async function leave(){if(!state)return navigateHome();if(!confirm(state.isHost?'Encerrar a sala? Todos os participantes serão desconectados.':'Sair desta sala?'))return; if(state.isHost||state.phase==='lobby')await submit('leave',{});forgetSession(state.code);navigateHome();}
async function handleAction(action,button){
 if(action==='welcome'){renderWelcome();return;}
 if(action==='create-view'){renderCreate();return;}
 if(action==='create')return create();
 if(action==='join')return join();
 if(action==='copy')return copyLink();
 if(action==='resume'){helpOpen=false;render();return;}
 if(action==='remove'){const p=state?.participants.find(x=>x.id===button.dataset.playerId);if(!p)return;if(confirm(`Retirar ${p.name} da sala?`))await submit('remove',{playerId:p.id});return;}
 if(action==='settings'){const settings=settingsData();if(settings){const r=await submit('settings',settings);if(r)notify('Configurações atualizadas.','success');}return;}
 if(action==='start')return submit('start',{});
 if(action==='next')return submit('next',{});
 if(action==='restart')return submit('restart',{});
 if(action==='leave')return leave();
}
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-action],[data-choice]');if(!b)return;
 if(b.hasAttribute('data-choice')){
  const choice=Number(b.dataset.choice);
  if(state?.phase!=='question'||state.myAnswer!==null||requestPending)return;
  sound(450);submit('answer',{choice});return;
 }
 handleAction(b.dataset.action,b);
});
document.addEventListener('change',e=>{if(e.target.id==='modeInput'){const box=$('#targetContainer');if(box)box.hidden=e.target.value==='free';}});
document.addEventListener('keydown',e=>{
 if(e.target.matches('input,select')){if(e.key==='Enter'&&!state){e.preventDefault();if($('#roomInput')&&$('#roomInput').value)join();else if($('#targetInput')||$('#modeInput'))create();else if($('#roomInput'))join();}return;}
 if(['1','2','3','4'].includes(e.key)&&state?.phase==='question'&&state.myAnswer===null&&!requestPending)submit('answer',{choice:Number(e.key)-1});
});
$('#helpBtn').addEventListener('click',()=>{if(state){helpOpen=true;renderHelp();}else{renderHelp();}});
$('#soundBtn').addEventListener('click',()=>{mute=!mute;$('#soundBtn').textContent=mute?'🔇':'🔊';sound(610);});
$('#leaveBtn').addEventListener('click',()=>state?leave():renderWelcome());
setInterval(updateTimer,250);
(async()=>{
 renderWelcome();
 if(pendingRoom){
  let stored=null;try{stored=localStorage.getItem(credentialKey(pendingRoom));}catch{}
  if(stored){try{await connectSession(pendingRoom,stored);}catch{}}
 }
})();
})();
