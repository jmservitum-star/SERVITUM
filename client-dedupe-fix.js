// Corrección central de clientes duplicados - Servitum
// Cargado después del script principal de index.html.

normalizeClientName = function(name){
  return String(name||'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,' ')
    .trim().replace(/\s+/g,' ');
};

clientKey = function(v){ return normalizeClientName(v && v.company); };

taskWasCompleted = function(task){
  return visits.some(v =>
    v.user_id===task.user_id &&
    clientKey(v)===clientKey(task) &&
    v.id!==task.id &&
    v.visit_date>=task.followup_date
  );
};

const _servitumRenderOriginal = render;
render = function(){
  _servitumRenderOriginal();
  const el=document.getElementById('kClientes');
  if(el) el.textContent=new Set(visits.map(v=>clientKey(v)).filter(Boolean)).size;
};

renderFunnel = function(){
  const stages=['Prospecto','Contactado','Cotización','Seguimiento','Negociación','Venta cerrada','Cliente activo'],latest={};
  visits.forEach(v=>{
    const k=clientKey(v),t=v.updated_at?new Date(v.updated_at):localDate(v.visit_date);
    if(k&&(!latest[k]||t>latest[k].t))latest[k]={v,t};
  });
  funnelLatest=latest;
  const clients=Object.values(latest),counts={};
  stages.forEach(s=>counts[s]=0);
  clients.forEach(x=>counts[x.v.commercial_stage||'Prospecto']=(counts[x.v.commercial_stage||'Prospecto']||0)+1);
  $('gFunnel').innerHTML=stages.map(s=>'<div class="funnel-step" onclick="openFunnelStage(\''+s.replace(/'/g,"\\'")+'\')"><b>'+counts[s]+'</b><span>'+esc(s)+'</span></div>').join('');
  const cut=new Date();cut.setDate(cut.getDate()-7);
  const open=new Set(['Prospecto','Contactado','Cotización','Seguimiento','Negociación']);
  const stalled=clients.filter(x=>open.has(x.v.commercial_stage||'Prospecto')&&x.t<cut).sort((a,b)=>a.t-b.t);
  $('stalledOpportunities').innerHTML=stalled.slice(0,20).map(x=>'<div class="follow-item"><b>'+esc(x.v.company)+'</b><span>'+esc(x.v.profiles?.full_name||profile?.full_name||'')+' · '+esc(x.v.commercial_stage||'Prospecto')+' · Sin avance desde '+esc(x.v.visit_date)+'</span></div>').join('')||'<p class="muted">No hay oportunidades estancadas por más de 7 días.</p>';
};

renderClientTracking = function(){
  const now=new Date(),cut7=new Date(now);cut7.setDate(cut7.getDate()-7);
  const cut30=new Date(now);cut30.setDate(cut30.getDate()-30);
  const clients={};
  visits.forEach(v=>{
    const k=clientKey(v); if(!k)return;
    const visitD=localDate(v.visit_date),upd=v.updated_at?new Date(v.updated_at):visitD;
    if(!clients[k])clients[k]={name:v.company,seller:v.profiles?.full_name||profile?.full_name||'Vendedor',first:visitD,last:visitD,lastUpdate:upd,count:0};
    const x=clients[k];x.count++;
    if(visitD<x.first)x.first=visitD;
    if(visitD>x.last)x.last=visitD;
    if(upd>x.lastUpdate){x.lastUpdate=upd;x.seller=v.profiles?.full_name||x.seller;}
  });
  renderFollowCenter(clients);
};

renderWorkAgenda = function(){
  const today=dateKey(new Date()),todayD=localDate(today),nextEnd=new Date(todayD);nextEnd.setDate(nextEnd.getDate()+7);
  const nextEndKey=dateKey(nextEnd),base=(profile?.role==='admin'&&agendaSeller!=='all')?visits.filter(v=>v.user_id===agendaSeller):visits;
  renderDailyCompliance(base,today);
  if(profile?.role==='admin'){
    const sellers=[...new Map(visits.map(v=>[v.user_id,v.profiles?.full_name||'Vendedor'])).entries()].sort((a,b)=>a[1].localeCompare(b[1]));
    $('agendaSellerFilterWrap').style.display='block';
    $('agendaSellerFilter').innerHTML='<option value="all">Todos los vendedores</option>'+sellers.map(([id,n])=>'<option value="'+id+'">'+esc(n)+'</option>').join('');
    $('agendaSellerFilter').value=agendaSeller;
  } else $('agendaSellerFilterWrap').style.display='none';
  const latest={};
  base.forEach(v=>{const k=clientKey(v),t=v.updated_at?new Date(v.updated_at):localDate(v.visit_date);if(k&&(!latest[k]||t>latest[k].t))latest[k]={v,t}});
  const rows=Object.values(latest),closed=x=>['cerrado','no interesado'].includes(String(x.v.result||'').toLowerCase())||['Venta cerrada','Cliente activo'].includes(x.v.commercial_stage||'Prospecto');
  const sortPriority=(type)=>(a,b)=>{const pa=agendaPriority(a.v,type,a.t).rank,pb=agendaPriority(b.v,type,b.t).rank;if(pa!==pb)return pa-pb;return String(a.v.followup_date||a.v.visit_date).localeCompare(String(b.v.followup_date||b.v.visit_date))};
  const todayTasks=rows.filter(x=>x.v.followup_date===today&&!closed(x)&&!taskWasCompleted(x.v)).sort(sortPriority('today'));
  const late=rows.filter(x=>x.v.followup_date&&x.v.followup_date<today&&!closed(x)).sort(sortPriority('late'));
  const next=rows.filter(x=>x.v.followup_date&&x.v.followup_date>today&&x.v.followup_date<=nextEndKey&&!closed(x)).sort(sortPriority('next'));
  const cut=new Date();cut.setDate(cut.getDate()-14);
  const recover=rows.filter(x=>x.t<cut&&!closed(x)&&!x.v.followup_date).sort((a,b)=>agendaPriority(a.v,'recover',a.t).rank-agendaPriority(b.v,'recover',b.t).rank||a.t-b.t);
  $('aToday').textContent=todayTasks.length;$('aLate').textContent=late.length;$('aNext').textContent=next.length;$('aRecover').textContent=recover.length;
  $('agendaTodayFull').innerHTML=todayTasks.map(x=>agendaTask(x,'today')).join('')||'<p class="muted">No hay tareas para hoy.</p>';
  $('agendaLateFull').innerHTML=late.map(x=>agendaTask(x,'late')).join('')||'<p class="muted">No hay seguimientos vencidos.</p>';
  $('agendaNextFull').innerHTML=next.map(x=>agendaTask(x,'next')).join('')||'<p class="muted">No hay seguimientos en los próximos 7 días.</p>';
  $('agendaRecoverFull').innerHTML=recover.map(x=>agendaTask(x,'recover')).join('')||'<p class="muted">No hay clientes para recuperar.</p>';
};


// Asistente de clientes existentes: evita crear el mismo cliente por diferencias de escritura.
(function(){
  function latestClients(){
    const map={};
    (visits||[]).forEach(v=>{
      const k=clientKey(v); if(!k)return;
      const t=v.updated_at?new Date(v.updated_at):localDate(v.visit_date);
      if(!map[k]||t>map[k].t)map[k]={v,t};
    });
    return map;
  }
  function refreshClientSuggestions(){
    const input=document.getElementById('empresa'); if(!input)return;
    let list=document.getElementById('clientesExistentes');
    if(!list){list=document.createElement('datalist');list.id='clientesExistentes';document.body.appendChild(list);input.setAttribute('list','clientesExistentes');input.setAttribute('autocomplete','off');}
    const clients=Object.values(latestClients()).sort((a,b)=>String(a.v.company||'').localeCompare(String(b.v.company||''),'es'));
    list.innerHTML=clients.map(x=>'<option value="'+esc(x.v.company)+'"></option>').join('');
  }
  function matchExistingClient(){
    const input=document.getElementById('empresa'); if(!input||!input.value.trim())return;
    const k=normalizeClientName(input.value),hit=latestClients()[k]; if(!hit)return;
    const v=hit.v;
    input.value=v.company||input.value;
    const setBlank=(id,val)=>{const el=document.getElementById(id);if(el&&!el.value&&val)el.value=val};
    setBlank('direccion',v.address);setBlank('telefono',v.phone);setBlank('whatsapp',v.whatsapp);setBlank('correoCliente',v.customer_email);setBlank('encargado',v.buyer);
    const zona=document.getElementById('zona');
    if(zona&&!zona.value&&v.zone){
      const exists=[...zona.options].some(o=>o.value===v.zone);
      zona.value=exists?v.zone:'Otra zona';
      if(!exists){const zo=document.getElementById('zonaOtra');if(zo)zo.value=v.zone}
      if(typeof toggleZona==='function')toggleZona();
    }
  }
  const oldLoad=load;
  load=async function(){const result=await oldLoad.apply(this,arguments);refreshClientSuggestions();return result};
  document.addEventListener('DOMContentLoaded',()=>{
    const input=document.getElementById('empresa');if(!input)return;
    refreshClientSuggestions();
    input.addEventListener('change',matchExistingClient);
    input.addEventListener('blur',matchExistingClient);
  });
  document.addEventListener('submit',e=>{if(e.target&&e.target.id==='visitForm')matchExistingClient()},true);
})();


// Ficha única del cliente: resumen comercial + historial completo de visitas.
(function(){
  function ensureClientModal(){
    if(document.getElementById('clientProfileModal'))return;
    const modal=document.createElement('div');
    modal.id='clientProfileModal';modal.className='modal';modal.style.display='none';
    modal.innerHTML='<div class="modal-card perf-card"><div class="modal-head"><div><h2 id="clientProfileTitle">Ficha del cliente</h2><p id="clientProfileSubtitle" class="muted"></p></div><button type="button" onclick="closeClientProfile()">Cerrar</button></div><div id="clientProfileBody"></div></div>';
    document.body.appendChild(modal);
  }
  function clientRows(key){
    return (visits||[]).filter(v=>clientKey(v)===key).sort((a,b)=>{
      const ta=a.updated_at?new Date(a.updated_at):localDate(a.visit_date),tb=b.updated_at?new Date(b.updated_at):localDate(b.visit_date);
      return tb-ta;
    });
  }
  window.closeClientProfile=()=>{const m=document.getElementById('clientProfileModal');if(m)m.style.display='none'};
  window.openClientProfile=function(id){
    ensureClientModal();
    const seed=(visits||[]).find(v=>v.id===id);if(!seed)return;
    const rows=clientRows(clientKey(seed));if(!rows.length)return;
    const latest=rows[0],first=[...rows].sort((a,b)=>String(a.visit_date).localeCompare(String(b.visit_date)))[0];
    const seller=latest.profiles?.full_name||profile?.full_name||'Vendedor';
    const contact=[latest.buyer,latest.phone,latest.whatsapp,latest.customer_email].filter(Boolean).map(esc).join(' · ')||'Sin datos de contacto';
    document.getElementById('clientProfileTitle').textContent=latest.company||'Cliente';
    document.getElementById('clientProfileSubtitle').textContent=(latest.zone||'Sin zona')+' · '+seller;
    const history=rows.map(v=>'<tr><td>'+esc(v.visit_date)+'</td><td>'+esc(v.profiles?.full_name||seller)+'</td><td>'+esc(v.reason||'')+'</td><td>'+esc(v.result||'')+'</td><td>'+esc(v.commercial_stage||'Prospecto')+'</td><td>'+esc(v.followup_date||'—')+'</td><td><button class="secondary" onclick="closeClientProfile();editVisit(\''+v.id+'\')">Abrir</button></td></tr>').join('');
    document.getElementById('clientProfileBody').innerHTML=
      '<div class="perf-kpis">'+
      '<div class="perf-kpi"><b>'+rows.length+'</b><span>Visitas registradas</span></div>'+
      '<div class="perf-kpi"><b>'+esc(latest.visit_date||'—')+'</b><span>Última visita</span></div>'+
      '<div class="perf-kpi"><b>'+esc(latest.followup_date||'—')+'</b><span>Próximo seguimiento</span></div>'+
      '<div class="perf-kpi"><b>'+esc(latest.commercial_stage||'Prospecto')+'</b><span>Etapa comercial</span></div>'+
      '</div>'+
      '<div class="perf-section"><h3>Información del cliente</h3><p><b>Dirección:</b> '+esc(latest.address||'No registrada')+'<br><b>Contacto:</b> '+contact+'<br><b>Primera visita:</b> '+esc(first.visit_date||'—')+'<br><b>Último próximo paso:</b> '+esc(latest.next_step||'No registrado')+'</p></div>'+
      '<div class="perf-section"><h3>Historial de visitas</h3><div class="tablewrap"><table><thead><tr><th>Fecha</th><th>Vendedor</th><th>Motivo</th><th>Resultado</th><th>Etapa</th><th>Seguimiento</th><th>Acción</th></tr></thead><tbody>'+history+'</tbody></table></div></div>'+
      '<div class="perf-section"><button class="primary" onclick="closeClientProfile();repeatVisit(\''+latest.id+'\')">Registrar nueva visita</button></div>';
    document.getElementById('clientProfileModal').style.display='block';
  };
  ensureClientModal();

  // Añade acceso a la ficha desde las tarjetas de agenda sin eliminar acciones existentes.
  const oldAgendaTask=agendaTask;
  agendaTask=function(x,type){
    const html=oldAgendaTask(x,type),v=x.v||x;
    return html.replace('<div class="task-actions">','<div class="task-actions"><button class="secondary" onclick="openClientProfile(\''+v.id+'\')">Ficha cliente</button>');
  };

  // Añade acceso a la ficha desde cada cliente del embudo.
  const oldOpenFunnelStage=window.openFunnelStage;
  window.openFunnelStage=function(stage){
    oldOpenFunnelStage(stage);
    const body=document.getElementById('funnelModalBody');if(!body)return;
    const clients=Object.values(funnelLatest).filter(x=>(x.v.commercial_stage||'Prospecto')===stage).sort((a,b)=>String(a.v.company).localeCompare(String(b.v.company)));
    const buttons=body.querySelectorAll('.client-stage-row');
    buttons.forEach((row,i)=>{if(clients[i]&&!row.querySelector('.client-profile-btn')){const box=row.lastElementChild;if(box){const b=document.createElement('button');b.className='secondary client-profile-btn';b.style.marginLeft='6px';b.textContent='Ficha';b.onclick=()=>{closeFunnelModal();openClientProfile(clients[i].v.id)};box.appendChild(b)}}});
  };
})();


// Auditoría permanente de visitas respaldada por Supabase.
(function(){
  function fmtAuditDate(value){
    if(!value)return '—';
    const d=new Date(value);if(Number.isNaN(d.getTime()))return '—';
    return new Intl.DateTimeFormat('es-DO',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true}).format(d);
  }
  function auditUser(v,kind){
    const rel=kind==='created'?v.creator:v.updater;
    return rel?.full_name||v.profiles?.full_name||'No disponible';
  }
  window.formatVisitAuditDate=fmtAuditDate;

  const oldOpenClientProfile=window.openClientProfile;
  window.openClientProfile=function(id){
    oldOpenClientProfile(id);
    const seed=(visits||[]).find(v=>v.id===id);if(!seed)return;
    const rows=(visits||[]).filter(v=>clientKey(v)===clientKey(seed)).sort((a,b)=>{
      const ta=a.updated_at?new Date(a.updated_at):localDate(a.visit_date),tb=b.updated_at?new Date(b.updated_at):localDate(b.visit_date);return tb-ta;
    });
    const table=document.querySelector('#clientProfileBody table');if(!table)return;
    const head=table.querySelector('thead tr');
    if(head&&!head.querySelector('.audit-col')){const th=document.createElement('th');th.className='audit-col';th.textContent='Auditoría';head.insertBefore(th,head.lastElementChild)}
    table.querySelectorAll('tbody tr').forEach((tr,i)=>{
      if(!rows[i]||tr.querySelector('.audit-col'))return;
      const v=rows[i],td=document.createElement('td');td.className='audit-col';
      td.innerHTML='<small><b>Creado:</b> '+esc(fmtAuditDate(v.created_at))+'<br><b>Por:</b> '+esc(auditUser(v,'created'))+
        (v.modified?'<br><b>Modificado:</b> '+esc(fmtAuditDate(v.updated_at))+'<br><b>Por:</b> '+esc(auditUser(v,'updated')):'')+'</small>';
      tr.insertBefore(td,tr.lastElementChild);
    });
  };

  const oldToggleDetail=window.toggleDetail;
  window.toggleDetail=function(id){
    oldToggleDetail(id);
    const v=(visits||[]).find(x=>x.id===id),row=document.getElementById('detail_'+id);
    if(!v||!row)return;
    const cell=row.querySelector('td');if(!cell||cell.querySelector('.visit-audit'))return;
    const box=document.createElement('div');box.className='visit-audit';
    box.style.cssText='margin-top:12px;padding-top:10px;border-top:1px solid #dbe3ea;font-size:13px';
    box.innerHTML='<b>Auditoría del registro</b><br>Creado: '+esc(fmtAuditDate(v.created_at))+' · '+esc(auditUser(v,'created'))+
      (v.modified?'<br>Última modificación: '+esc(fmtAuditDate(v.updated_at))+' · '+esc(auditUser(v,'updated')):'');
    cell.appendChild(box);
  };
})();


// Propietario único del cliente: lectura segura desde public.clients + reasignación solo para administrador.
(function(){
  let clientOwners={}, sellerDirectory=[];

  async function loadClientOwners(){
    const {data,error}=await sb.from('clients').select('id,normalized_name,display_name,owner_id,profiles!clients_owner_id_fkey(full_name)');
    if(error){console.error('No se pudo cargar propietarios de clientes:',error.message);return}
    clientOwners={};
    (data||[]).forEach(x=>clientOwners[x.normalized_name]=x);
    if(profile?.role==='admin'){
      const pr=await sb.from('profiles').select('id,full_name,role').eq('role','seller').order('full_name');
      sellerDirectory=pr.data||[];
    }
  }
  window.getClientOwner=function(v){return clientOwners[clientKey(v)]||null};

  const oldLoadOwners=load;
  load=async function(){
    const result=await oldLoadOwners.apply(this,arguments);
    await loadClientOwners();
    return result;
  };

  window.changeClientOwner=async function(clientId,newOwnerId){
    if(profile?.role!=='admin'||!clientId||!newOwnerId)return;
    const {error}=await sb.from('clients').update({owner_id:newOwnerId,updated_at:new Date().toISOString()}).eq('id',clientId);
    if(error){alert('No se pudo reasignar el cliente: '+error.message);return}
    await loadClientOwners();
    alert('Vendedor responsable actualizado.');
    const seed=(visits||[]).find(v=>getClientOwner(v)?.id===clientId);
    if(seed)openClientProfile(seed.id);
  };

  const oldOpenClientProfileOwner=window.openClientProfile;
  window.openClientProfile=function(id){
    oldOpenClientProfileOwner(id);
    const v=(visits||[]).find(x=>x.id===id),body=document.getElementById('clientProfileBody');
    if(!v||!body)return;
    const owner=getClientOwner(v),ownerName=owner?.profiles?.full_name||v.profiles?.full_name||'Sin asignar';
    const info=body.querySelector('.perf-section');
    if(info&&!info.querySelector('.client-owner-box')){
      const box=document.createElement('div');box.className='client-owner-box';
      box.style.cssText='margin-top:12px;padding:12px;border:1px solid #dbe9f2;border-radius:9px;background:#f8fbfd';
      if(profile?.role==='admin'&&owner){
        const options=sellerDirectory.map(s=>'<option value="'+s.id+'" '+(s.id===owner.owner_id?'selected':'')+'>'+esc(s.full_name)+'</option>').join('');
        box.innerHTML='<b>Vendedor responsable</b><div style="display:flex;gap:8px;align-items:center;margin-top:7px;flex-wrap:wrap"><select id="clientOwnerSelect" style="max-width:320px">'+options+'</select><button class="secondary" onclick="changeClientOwner(\''+owner.id+'\',document.getElementById(\'clientOwnerSelect\').value)">Reasignar</button></div>';
      }else{
        box.innerHTML='<b>Vendedor responsable:</b> '+esc(ownerName);
      }
      info.appendChild(box);
    }
  };
})();

// Alertas clientes sin visitar 15/30/60/90 días.
(function(){function panel(){if(document.getElementById('inactiveClientsPanel'))return;const d=document.getElementById('dashboard');if(!d)return;const b=document.createElement('div');b.id='inactiveClientsPanel';b.className='box';b.style.marginTop='18px';b.innerHTML='<h2>Clientes sin visitar</h2><p class="muted">Alerta automática desde la última visita.</p><div class="kpis"><div class="kpi"><b id="inactive15">0</b>15–29 días</div><div class="kpi"><b id="inactive30">0</b>30–59 días</div><div class="kpi"><b id="inactive60">0</b>60–89 días</div><div class="kpi"><b id="inactive90">0</b>90+ días</div></div><div id="inactiveClientsList" class="follow-list" style="margin-top:14px"></div>';d.appendChild(b)}function draw(){panel();const latest={};(visits||[]).filter(v=>profile?.role==='admin'||v.user_id===me?.id).forEach(v=>{const k=clientKey(v);if(k&&(!latest[k]||v.visit_date>latest[k].visit_date))latest[k]=v});const now=new Date();now.setHours(12,0,0,0);const a=Object.values(latest).map(v=>({v,days:Math.max(0,Math.floor((now-localDate(v.visit_date))/86400000))})).filter(x=>x.days>=15).sort((a,b)=>b.days-a.days),n=[0,0,0,0];a.forEach(x=>x.days>=90?n[3]++:x.days>=60?n[2]++:x.days>=30?n[1]++:n[0]++);['inactive15','inactive30','inactive60','inactive90'].forEach((id,i)=>{const e=document.getElementById(id);if(e)e.textContent=n[i]});const e=document.getElementById('inactiveClientsList');if(e)e.innerHTML=a.map(x=>'<div class="follow-item"><b>'+esc(x.v.company)+'</b><span>'+x.days+' días sin visita · Última: '+esc(x.v.visit_date)+' · '+esc(x.v.profiles?.full_name||'Vendedor')+'</span><button class="secondary" onclick="openClientProfile(\''+x.v.id+'\')">Ficha cliente</button> <button class="primary" onclick="repeatVisit(\''+x.v.id+'\')">Registrar visita</button></div>').join('')||'<p class="muted">No hay clientes con 15 días o más sin visitar.</p>'}const old=render;render=function(){old();draw()};panel()})();

// Resumen de oportunidad comercial en la ficha única del cliente.
(function(){const prev=window.openClientProfile;window.openClientProfile=function(id){prev(id);const v=(visits||[]).find(x=>x.id===id),body=document.getElementById('clientProfileBody');if(!v||!body)return;const rows=(visits||[]).filter(x=>clientKey(x)===clientKey(v)).sort((a,b)=>{const ta=a.updated_at?new Date(a.updated_at):localDate(a.visit_date),tb=b.updated_at?new Date(b.updated_at):localDate(b.visit_date);return tb-ta}),opp=rows.find(x=>x.opportunity_amount!=null||x.close_probability!=null||x.expected_close_date)||rows[0],amount=Number(opp.opportunity_amount||0),prob=Number(opp.close_probability||0),weighted=amount*(prob/100),fmt=n=>new Intl.NumberFormat('es-DO',{style:'currency',currency:'DOP',minimumFractionDigits:2}).format(n),sec=document.createElement('div');sec.className='perf-section opportunity-summary';sec.innerHTML='<h3>Oportunidad comercial</h3><div class="perf-kpis"><div class="perf-kpi"><b>'+esc(fmt(amount))+'</b><span>Monto estimado</span></div><div class="perf-kpi"><b>'+esc(prob+'%')+'</b><span>Probabilidad de cierre</span></div><div class="perf-kpi"><b>'+esc(fmt(weighted))+'</b><span>Valor ponderado</span></div><div class="perf-kpi"><b>'+esc(opp.expected_close_date||'—')+'</b><span>Cierre esperado</span></div></div>';const sections=body.querySelectorAll('.perf-section');if(sections.length)body.insertBefore(sec,sections[sections.length-1]);else body.appendChild(sec)}})();

// duplicate-warning-v2: alerta inteligente sin fusionar ni borrar registros.
(function(){
 function words(s){return normalizeClientName(s).split(' ').filter(Boolean)}
 const generic=new Set(['hotel','hoteles','restaurante','restaurant','clinica','hospital','colegio','universidad','grupo','group','empresa','compania','cia','srl','sa','rd']);
 function core(s){const a=words(s),b=a.filter(x=>!generic.has(x));return b.length?b:a}
 function score(a,b){const A=core(a),B=core(b);if(!A.length||!B.length)return 0;const sa=new Set(A),sb=new Set(B);let inter=0;sa.forEach(x=>{if(sb.has(x))inter++});const union=new Set([...A,...B]).size,j=inter/union,contain=(inter===Math.min(sa.size,sb.size))?0.12:0;return Math.min(1,j+contain)}
 function candidates(name){const seen=new Map();(visits||[]).forEach(v=>{const k=clientKey(v);if(k&&!seen.has(k))seen.set(k,v)});return [...seen.values()].map(v=>({v,s:score(name,v.company)})).filter(x=>x.s>=0.72&&normalizeClientName(x.v.company)!==normalizeClientName(name)).sort((a,b)=>b.s-a.s)}
 function ensure(){let e=document.getElementById('duplicateClientWarning');if(e)return e;const input=document.getElementById('empresa');if(!input)return null;e=document.createElement('div');e.id='duplicateClientWarning';e.style.cssText='display:none;margin-top:8px;padding:10px;border:1px solid #e0b64f;border-radius:8px;background:#fff8e1;font-size:13px';input.parentElement.appendChild(e);return e}
 function check(){const input=document.getElementById('empresa'),e=ensure();if(!input||!e)return[];const hits=candidates(input.value.trim()).slice(0,3);if(!input.value.trim()||!hits.length){e.style.display='none';e.innerHTML='';return[]}e.style.display='block';e.innerHTML='<b>Posible cliente duplicado</b><br>Ya existe un nombre parecido: '+hits.map(x=>'<button type="button" class="secondary" style="margin:5px 5px 0 0" onclick="document.getElementById(\'empresa\').value='+JSON.stringify(x.v.company).replace(/"/g,'&quot;')+';document.getElementById(\'duplicateClientWarning\').style.display=\'none\'">'+esc(x.v.company)+'</button>').join('')+'<br><small>Revísalo antes de guardar. No se fusionará ni borrará ningún registro automáticamente.</small>';return hits}
 document.addEventListener('DOMContentLoaded',()=>{const i=document.getElementById('empresa');if(!i)return;ensure();i.addEventListener('input',check);i.addEventListener('blur',check)});
 document.addEventListener('submit',e=>{if(e.target?.id!=='visitForm')return;const i=document.getElementById('empresa');if(!i)return;const hits=candidates(i.value.trim());if(hits.length&&!i.dataset.duplicateConfirmed){e.preventDefault();e.stopImmediatePropagation();const names=hits.slice(0,3).map(x=>x.v.company).join(', ');if(confirm('Posible cliente duplicado: '+names+'\n\n¿Deseas guardar de todos modos como está escrito?')){i.dataset.duplicateConfirmed='1';e.target.requestSubmit()}else{i.focus()}return}delete i.dataset.duplicateConfirmed},true);
})();

// management-dashboard-v1: resumen gerencial sin alterar registros.
(function(){
 function money(n){return new Intl.NumberFormat('es-DO',{style:'currency',currency:'DOP',maximumFractionDigits:0}).format(Number(n||0))}
 function latestClients(){const m={};(visits||[]).forEach(v=>{const k=clientKey(v),t=v.updated_at?new Date(v.updated_at):localDate(v.visit_date);if(k&&(!m[k]||t>m[k].t))m[k]={v,t}});return Object.values(m)}
 function ensure(){if(document.getElementById('managementDashboard'))return;const dash=document.getElementById('dashboard');if(!dash)return;const box=document.createElement('div');box.id='managementDashboard';box.className='box';box.style.marginTop='18px';box.innerHTML='<h2>Dashboard Gerencial</h2><p class="muted">Vista consolidada de cartera, oportunidades y desempeño comercial.</p><div class="kpis"><div class="kpi"><b id="mgClients">0</b>Clientes únicos</div><div class="kpi"><b id="mgPipeline">RD$0</b>Pipeline estimado</div><div class="kpi"><b id="mgWeighted">RD$0</b>Proyección ponderada</div><div class="kpi"><b id="mgInactive">0</b>Clientes 30+ días</div></div><div class="charts" style="margin-top:16px"><div class="chart"><h3>Cartera por vendedor</h3><div id="mgSellerPortfolio" class="bars"></div></div><div class="chart"><h3>Pipeline por etapa</h3><div id="mgStagePipeline" class="bars"></div></div><div class="chart full"><h3>Oportunidades con cierre esperado</h3><div id="mgClosings" class="follow-list"></div></div></div>';dash.insertBefore(box,document.getElementById('inactiveClientsPanel')||null)}
 function draw(){ensure();if(!document.getElementById('managementDashboard'))return;const clients=latestClients(),now=new Date();now.setHours(12,0,0,0);let pipe=0,weighted=0,inactive=0;const seller={},stage={};clients.forEach(x=>{const v=x.v,a=Number(v.opportunity_amount||0),p=Number(v.close_probability||0);pipe+=a;weighted+=a*p/100;const days=Math.max(0,Math.floor((now-localDate(v.visit_date))/86400000));if(days>=30)inactive++;const owner=typeof getClientOwner==='function'?getClientOwner(v):null,name=owner?.profiles?.full_name||v.profiles?.full_name||'Sin asignar';seller[name]=(seller[name]||0)+1;const st=v.commercial_stage||'Prospecto';stage[st]=(stage[st]||0)+a});document.getElementById('mgClients').textContent=clients.length;document.getElementById('mgPipeline').textContent=money(pipe);document.getElementById('mgWeighted').textContent=money(weighted);document.getElementById('mgInactive').textContent=inactive;const bars=(obj,valfmt)=>Object.entries(obj).sort((a,b)=>b[1]-a[1]).map(([k,v])=>'<div class="barrow"><span>'+esc(k)+'</span><div class="bar"><i style="width:'+Math.max(4,Math.round(v/Math.max(...Object.values(obj),1)*100))+'%"></i></div><b>'+esc(valfmt(v))+'</b></div>').join('')||'<p class="muted">Sin datos.</p>';document.getElementById('mgSellerPortfolio').innerHTML=bars(seller,v=>String(v));document.getElementById('mgStagePipeline').innerHTML=bars(stage,money);const closings=clients.filter(x=>x.v.expected_close_date).sort((a,b)=>String(a.v.expected_close_date).localeCompare(String(b.v.expected_close_date))).slice(0,20);document.getElementById('mgClosings').innerHTML=closings.map(x=>'<div class="follow-item"><b>'+esc(x.v.company)+'</b><span>'+esc(x.v.commercial_stage||'Prospecto')+' · '+money(x.v.opportunity_amount)+' · '+esc(String(x.v.close_probability??0))+'% · Cierre: '+esc(x.v.expected_close_date)+'</span><button class="secondary" onclick="openClientProfile(\''+x.v.id+'\')">Ficha cliente</button></div>').join('')||'<p class="muted">Aún no hay oportunidades con fecha esperada de cierre.</p>'}
 const old=render;render=function(){old();draw()};ensure();
})();
