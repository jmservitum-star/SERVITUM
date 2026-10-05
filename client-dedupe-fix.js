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
