
/* =========================================================
   Lift Log — single-file offline workout tracker
   Storage: localStorage. Backup: JSON export/import.
========================================================= */
const KEY = 'liftlog.v1';
let state = load();
let timerInt = null;

function defaults(){
  return { settings:{unit:'lb'}, sessions:[], bodyweights:[], active:null, lastBackup:null };
}
function load(){
  try{
    const raw = localStorage.getItem(KEY);
    if(!raw) return defaults();
    const d = JSON.parse(raw);
    return Object.assign(defaults(), d);
  }catch(e){ return defaults(); }
}
function save(){ localStorage.setItem(KEY, JSON.stringify(state)); }
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function unit(){ return state.settings.unit; }

/* ---------- helpers ---------- */
function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(()=>t.classList.remove('show'), 1900);
}
function fmtDate(iso){
  const d = new Date(iso);
  return d.toLocaleDateString(undefined,{weekday:'short', month:'short', day:'numeric'});
}
function fmtDateShort(iso){
  const d = new Date(iso);
  return d.toLocaleDateString(undefined,{month:'short', day:'numeric'});
}
function todayISO(){
  const d = new Date(); d.setHours(0,0,0,0);
  return d.toISOString();
}
function num(v){ const n = parseFloat(v); return isNaN(n)?0:n; }
// Epley estimated 1RM
function e1rm(w,r){ w=num(w); r=num(r); if(w<=0||r<=0) return 0; return w*(1+r/30); }

/* ---------- known exercises (autocomplete) ---------- */
function knownExercises(){
  const set = new Set();
  state.sessions.forEach(s=> s.exercises.forEach(e=> set.add(e.name)));
  if(state.active) state.active.exercises.forEach(e=> set.add(e.name));
  return [...set].sort();
}
function knownRoutines(){
  const set = new Set();
  state.sessions.forEach(s=> s.name && set.add(s.name));
  return [...set];
}
// most recent performance of an exercise (before the active session)
function lastPerformance(name){
  for(const s of [...state.sessions].sort((a,b)=> new Date(b.date)-new Date(a.date))){
    const e = s.exercises.find(x=> x.name.toLowerCase()===name.toLowerCase() && x.sets.length);
    if(e) return {date:s.date, sets:e.sets};
  }
  return null;
}

/* =========================================================
   VIEWS
========================================================= */
const TITLES = {log:'Today', history:'History', progress:'Progress', body:'Bodyweight', data:'Settings & Data'};
let current = 'log';
function switchView(v){
  current = v;
  document.querySelectorAll('main > section').forEach(s=> s.classList.add('hidden'));
  document.getElementById('view-'+v).classList.remove('hidden');
  document.querySelectorAll('nav button').forEach(b=> b.classList.toggle('active', b.dataset.view===v));
  document.getElementById('viewTitle').textContent = TITLES[v];
  document.getElementById('viewSub').textContent = '';
  if(v==='log') renderLog();
  if(v==='history') renderHistory();
  if(v==='progress') renderProgressPicker();
  if(v==='body') renderBody();
  if(v==='data') renderData();
}

/* =========================================================
   LOG / ACTIVE SESSION
========================================================= */
function startSession(){
  const name = document.getElementById('sessionName').value.trim();
  state.active = { id:uid(), date:new Date().toISOString(), name:name||'Workout', exercises:[], startTs:Date.now() };
  save(); renderLog();
}
function discardSession(){
  confirmModal('Discard this workout?','Nothing will be saved.', ()=>{
    state.active=null; save(); renderLog(); toast('Discarded');
  });
}
function finishSession(){
  const a = state.active;
  if(!a) return;
  // drop empty sets/exercises
  a.exercises.forEach(e=> e.sets = e.sets.filter(s=> num(s.weight)>0 || num(s.reps)>0));
  a.exercises = a.exercises.filter(e=> e.sets.length>0);
  if(a.exercises.length===0){
    confirmModal('Save empty workout?','No sets were logged. Discard instead?', ()=>{
      state.active=null; save(); renderLog();
    });
    return;
  }
  a.durationMin = Math.round((Date.now()-(a.startTs||Date.now()))/60000);
  delete a.startTs;
  state.sessions.push(a);
  const prs = detectPRs(a);
  state.active = null; save(); renderLog();
  toast(prs>0 ? `Saved · ${prs} new PR${prs>1?'s':''}! 🎉` : 'Workout saved');
}
function detectPRs(session){
  let count=0;
  session.exercises.forEach(e=>{
    const best = Math.max(0,...e.sets.map(s=> e1rm(s.weight,s.reps)));
    // compare to prior best across earlier sessions
    let prior=0;
    state.sessions.forEach(s=>{
      if(s.id===session.id) return;
      s.exercises.filter(x=> x.name.toLowerCase()===e.name.toLowerCase())
        .forEach(x=> x.sets.forEach(st=> prior=Math.max(prior,e1rm(st.weight,st.reps))));
    });
    if(best>prior && best>0) count++;
  });
  return count;
}
function addExercisePrompt(){
  inputModal('Add exercise','Exercise name', '', knownExercises(), (val)=>{
    val = (val||'').trim(); if(!val) return;
    state.active.exercises.push({ name:val, sets:[{weight:'',reps:'',done:false}] });
    save(); renderLog();
    setTimeout(()=>{ const el=document.querySelector(`[data-ex="${state.active.exercises.length-1}"]`); if(el) el.scrollIntoView({behavior:'smooth',block:'center'}); },50);
  });
}
function addSet(ei){
  const ex = state.active.exercises[ei];
  const last = ex.sets[ex.sets.length-1];
  ex.sets.push({ weight:last?last.weight:'', reps:last?last.reps:'', done:false });
  save(); renderLog();
}
function delSet(ei,si){ state.active.exercises[ei].sets.splice(si,1); save(); renderLog(); }
function delExercise(ei){
  confirmModal('Remove exercise?', state.active.exercises[ei].name, ()=>{
    state.active.exercises.splice(ei,1); save(); renderLog();
  });
}
function updSet(ei,si,field,val){ state.active.exercises[ei].sets[si][field]=val; save(); }
function toggleDone(ei,si){
  const s = state.active.exercises[ei].sets[si];
  s.done = !s.done; save(); renderLog();
}

function renderLog(){
  const none = document.getElementById('noSession');
  const act = document.getElementById('activeSession');
  // routine autocomplete
  document.getElementById('routineList').innerHTML = knownRoutines().map(r=>`<option value="${esc(r)}">`).join('');

  if(!state.active){
    none.classList.remove('hidden'); act.classList.add('hidden');
    stopTimer();
    return;
  }
  none.classList.add('hidden'); act.classList.remove('hidden');
  const a = state.active;
  document.getElementById('activeName').textContent = a.name;
  const totalSets = a.exercises.reduce((n,e)=> n+e.sets.filter(s=>s.done).length,0);
  document.getElementById('activeMeta').textContent = `${a.exercises.length} exercise${a.exercises.length!==1?'s':''} · ${totalSets} set${totalSets!==1?'s':''} done`;

  const u = unit();
  const list = document.getElementById('exerciseList');
  list.innerHTML = a.exercises.map((e,ei)=>{
    const prev = lastPerformance(e.name);
    const prevTxt = prev
      ? `Last (${fmtDateShort(prev.date)}): ` + prev.sets.map(s=>`${s.weight}×${s.reps}`).join(', ')
      : 'No history yet';
    const rows = e.sets.map((s,si)=>`
      <div class="setgrid" data-ex="${ei}">
        <div class="sn">${si+1}</div>
        <input type="number" inputmode="decimal" placeholder="${u}" value="${esc(s.weight)}"
          oninput="updSet(${ei},${si},'weight',this.value)">
        <input type="number" inputmode="numeric" placeholder="reps" value="${esc(s.reps)}"
          oninput="updSet(${ei},${si},'reps',this.value)">
        <div class="done">
          <div class="chk ${s.done?'on':''}" onclick="toggleDone(${ei},${si})">${s.done?'✓':''}</div>
        </div>
      </div>`).join('');
    return `
      <div class="exercise">
        <div class="ehead">
          <div class="name">${esc(e.name)}</div>
          <div class="row" style="gap:4px">
            <button class="icon-btn" onclick="delExercise(${ei})">✕</button>
          </div>
        </div>
        <div class="prev">${prevTxt}</div>
        <div class="setgrid" style="margin-bottom:2px">
          <div class="set-hint">#</div><div class="set-hint">${u}</div><div class="set-hint">reps</div><div class="set-hint">✓</div>
        </div>
        ${rows}
        <div class="row" style="gap:8px; margin-top:4px">
          <button class="btn-sec btn-sm btn-block" onclick="addSet(${ei})">+ Set</button>
          ${e.sets.length>1?`<button class="btn-ghost btn-sm" onclick="delSet(${ei},${e.sets.length-1})">− Set</button>`:''}
        </div>
      </div>`;
  }).join('');
  startTimer();
}
function startTimer(){
  if(timerInt || !state.active || !state.active.startTs) return;
  const tick = ()=>{
    const s = Math.floor((Date.now()-state.active.startTs)/1000);
    const m = Math.floor(s/60), ss = String(s%60).padStart(2,'0');
    const el = document.getElementById('timer'); if(el) el.textContent = `${m}:${ss}`;
  };
  tick(); timerInt = setInterval(tick,1000);
}
function stopTimer(){ if(timerInt){ clearInterval(timerInt); timerInt=null; } }

/* =========================================================
   HISTORY
========================================================= */
function renderHistory(){
  const el = document.getElementById('historyList');
  const sessions = [...state.sessions].sort((a,b)=> new Date(b.date)-new Date(a.date));
  if(!sessions.length){ el.innerHTML = `<div class="empty">No workouts yet.<br>Log one on the <b>Log</b> tab.</div>`; return; }

  // quick stats
  const now = new Date(); const wk = new Date(now); wk.setDate(now.getDate()-7);
  const thisWeek = sessions.filter(s=> new Date(s.date)>=wk).length;
  const totalVol = sessions.reduce((t,s)=> t + s.exercises.reduce((v,e)=> v+e.sets.reduce((x,st)=> x+num(st.weight)*num(st.reps),0),0),0);

  const stats = `
    <div class="card"><div class="stat">
      <div class="kpi"><div class="l">Workouts</div><div class="v">${sessions.length}</div></div>
      <div class="kpi"><div class="l">This week</div><div class="v">${thisWeek}</div></div>
      <div class="kpi"><div class="l">Total volume</div><div class="v">${Math.round(totalVol).toLocaleString()}</div></div>
    </div></div>`;

  const items = sessions.map(s=>{
    const vol = s.exercises.reduce((v,e)=> v+e.sets.reduce((x,st)=> x+num(st.weight)*num(st.reps),0),0);
    const summary = s.exercises.map(e=>{
      const top = e.sets.reduce((b,st)=> e1rm(st.weight,st.reps)>e1rm(b.weight,b.reps)?st:b, {weight:0,reps:0});
      return `${esc(e.name)} <span class="muted">${top.weight}×${top.reps}</span>`;
    }).join(' · ');
    return `
      <div class="card">
        <div class="row between">
          <div><h3>${esc(s.name)}</h3><div class="tiny muted">${fmtDate(s.date)}${s.durationMin?` · ${s.durationMin} min`:''}</div></div>
          <button class="icon-btn" onclick="deleteSession('${s.id}')">🗑</button>
        </div>
        <div class="small" style="margin-top:8px">${summary||'<span class="muted">no sets</span>'}</div>
        <div class="tiny muted" style="margin-top:8px">Volume ${Math.round(vol).toLocaleString()} ${unit()}·reps</div>
      </div>`;
  }).join('');
  el.innerHTML = stats + items;
}
function deleteSession(id){
  confirmModal('Delete this workout?','This cannot be undone.', ()=>{
    state.sessions = state.sessions.filter(s=> s.id!==id); save(); renderHistory(); toast('Deleted');
  });
}

/* =========================================================
   PROGRESS (progressive overload)
========================================================= */
function renderProgressPicker(){
  const sel = document.getElementById('progExercise');
  const ex = knownExercises();
  if(!ex.length){
    sel.innerHTML=''; document.getElementById('progressBody').innerHTML = `<div class="empty">Log some workouts to see progress.</div>`;
    return;
  }
  const cur = sel.value;
  sel.innerHTML = ex.map(e=>`<option ${e===cur?'selected':''}>${esc(e)}</option>`).join('');
  renderProgress();
}
function exerciseSeries(name){
  // one point per session: best est 1RM and top-set weight
  const pts = [];
  [...state.sessions].sort((a,b)=> new Date(a.date)-new Date(b.date)).forEach(s=>{
    const es = s.exercises.filter(e=> e.name.toLowerCase()===name.toLowerCase());
    if(!es.length) return;
    let best1=0, topW=0, vol=0;
    es.forEach(e=> e.sets.forEach(st=>{
      best1=Math.max(best1,e1rm(st.weight,st.reps));
      topW=Math.max(topW,num(st.weight));
      vol+=num(st.weight)*num(st.reps);
    }));
    if(best1>0) pts.push({date:s.date, e1rm:best1, topW, vol});
  });
  return pts;
}
function renderProgress(){
  const name = document.getElementById('progExercise').value;
  const el = document.getElementById('progressBody');
  const pts = exerciseSeries(name);
  if(pts.length===0){ el.innerHTML = `<div class="empty">No data for ${esc(name)} yet.</div>`; return; }

  const u = unit();
  const last = pts[pts.length-1];
  const first = pts[0];
  const bestTop = Math.max(...pts.map(p=>p.topW));
  const best1 = Math.max(...pts.map(p=>p.e1rm));
  const gain = last.e1rm - first.e1rm;
  const gainPct = first.e1rm>0 ? (gain/first.e1rm*100) : 0;

  // suggestion: based on last top set
  const lastPerf = lastPerformance(name);
  let suggestion = '';
  if(lastPerf){
    const top = lastPerf.sets.reduce((b,st)=> e1rm(st.weight,st.reps)>e1rm(b.weight,b.reps)?st:b, {weight:0,reps:0});
    const w = num(top.weight), r = num(top.reps);
    const inc = u==='kg' ? 2.5 : 5;
    if(r>=10){
      suggestion = `Last top set ${w}×${r}. You're at 10+ reps — bump the weight to <b>${w+inc}${u}</b> and aim for ${Math.max(6,r-2)}–8 reps.`;
    }else{
      suggestion = `Last top set ${w}×${r}. Try <b>${w}${u} × ${r+1}</b> next, then add ${inc}${u} once you clear ${Math.min(r+2,10)} clean reps.`;
    }
  }

  const kpis = `
    <div class="card"><div class="stat">
      <div class="kpi"><div class="l">Est. 1RM</div><div class="v">${Math.round(last.e1rm)}<span class="tiny muted"> ${u}</span></div></div>
      <div class="kpi"><div class="l">Best top set</div><div class="v">${bestTop}<span class="tiny muted"> ${u}</span></div></div>
      <div class="kpi"><div class="l">Progress</div><div class="v ${gain>=0?'badge-good':''}">${gain>=0?'+':''}${Math.round(gain)}<span class="tiny muted"> ${u}</span></div></div>
    </div></div>`;

  const chart = `
    <div class="card">
      <div class="row between" style="margin-bottom:8px">
        <h3>Estimated 1RM over time</h3>
        <span class="tiny muted">${pts.length} session${pts.length!==1?'s':''}</span>
      </div>
      ${lineChart(pts.map(p=>({x:p.date, y:p.e1rm})), u)}
      <div class="tiny muted" style="margin-top:6px">Est. 1RM = weight × (1 + reps/30). Trending up = progressive overload working.</div>
    </div>`;

  const sug = suggestion ? `<div class="card"><h3>Next session target</h3><div class="small" style="margin-top:6px">${suggestion}</div></div>` : '';

  el.innerHTML = kpis + chart + sug;
}

/* =========================================================
   BODYWEIGHT
========================================================= */
function logBodyweight(){
  const w = num(document.getElementById('bwInput').value);
  let dateVal = document.getElementById('bwDate').value;
  if(w<=0){ toast('Enter a weight'); return; }
  const iso = dateVal ? new Date(dateVal+'T12:00:00').toISOString() : new Date().toISOString();
  // replace same-day entry
  const day = iso.slice(0,10);
  state.bodyweights = state.bodyweights.filter(b=> b.date.slice(0,10)!==day);
  state.bodyweights.push({ id:uid(), date:iso, weight:w });
  save();
  document.getElementById('bwInput').value='';
  renderBody(); toast('Logged');
}
function delBodyweight(id){ state.bodyweights = state.bodyweights.filter(b=> b.id!==id); save(); renderBody(); }
function renderBody(){
  document.getElementById('bwDate').value = new Date().toISOString().slice(0,10);
  document.querySelectorAll('.unitLabel').forEach(e=> e.textContent = unit());
  const el = document.getElementById('bodyBody');
  const bws = [...state.bodyweights].sort((a,b)=> new Date(a.date)-new Date(b.date));
  if(!bws.length){ el.innerHTML = `<div class="empty">No bodyweight entries yet.</div>`; return; }
  const u = unit();
  const cur = bws[bws.length-1];
  const first = bws[0];
  const change = cur.weight - first.weight;
  // last 30 days change
  const mo = new Date(); mo.setDate(mo.getDate()-30);
  const recent = bws.filter(b=> new Date(b.date)>=mo);
  const moChange = recent.length>1 ? recent[recent.length-1].weight-recent[0].weight : 0;

  const kpis = `
    <div class="card"><div class="stat">
      <div class="kpi"><div class="l">Current</div><div class="v">${cur.weight}<span class="tiny muted"> ${u}</span></div></div>
      <div class="kpi"><div class="l">30-day</div><div class="v ${moChange<=0?'badge-good':''}">${moChange>0?'+':''}${moChange.toFixed(1)}</div></div>
      <div class="kpi"><div class="l">All-time</div><div class="v">${change>0?'+':''}${change.toFixed(1)}</div></div>
    </div></div>`;
  const chart = `<div class="card"><h3 style="margin-bottom:8px">Bodyweight trend</h3>${lineChart(bws.map(b=>({x:b.date,y:b.weight})), u)}</div>`;
  const list = `<div class="card"><h3 style="margin-bottom:6px">Entries</h3>${
    [...bws].reverse().map(b=>`<div class="list-item row between"><div>${b.weight} <span class="muted small">${u}</span></div><div class="row" style="gap:10px"><span class="tiny muted">${fmtDate(b.date)}</span><button class="icon-btn" onclick="delBodyweight('${b.id}')">🗑</button></div></div>`).join('')
  }</div>`;
  el.innerHTML = kpis + chart + list;
}

/* =========================================================
   SIMPLE SVG LINE CHART (no libraries → works offline)
========================================================= */
function lineChart(data, unitLabel){
  if(!data || data.length===0) return '<div class="empty">No data</div>';
  const W=620,H=180,P=30,PB=22;
  const xs = data.map(d=> new Date(d.x).getTime());
  const ys = data.map(d=> d.y);
  const minX=Math.min(...xs), maxX=Math.max(...xs);
  let minY=Math.min(...ys), maxY=Math.max(...ys);
  if(minY===maxY){ minY-=1; maxY+=1; }
  const pad=(maxY-minY)*0.12; minY-=pad; maxY+=pad;
  const sx = x => data.length===1 ? W/2 : P + (x-minX)/(maxX-minX)*(W-P-10);
  const sy = y => (H-PB) - (y-minY)/(maxY-minY)*(H-PB-10);

  // gridlines (3)
  let grid='';
  for(let i=0;i<=3;i++){
    const gy = 10 + i*(H-PB-10)/3;
    const val = maxY - i*(maxY-minY)/3;
    grid += `<line class="grid" x1="${P}" y1="${gy.toFixed(1)}" x2="${W}" y2="${gy.toFixed(1)}"/>`;
    grid += `<text class="axis" x="2" y="${(gy+3).toFixed(1)}">${Math.round(val)}</text>`;
  }
  const pathPts = data.map((d,i)=> `${sx(xs[i]).toFixed(1)},${sy(ys[i]).toFixed(1)}`);
  const line = `<polyline class="lineA" points="${pathPts.join(' ')}"/>`;
  const dots = data.map((d,i)=> `<circle class="dot" cx="${sx(xs[i]).toFixed(1)}" cy="${sy(ys[i]).toFixed(1)}" r="${data.length>25?2:3.2}"/>`).join('');
  // x labels: first, mid, last
  const lbls = [0, Math.floor((data.length-1)/2), data.length-1].filter((v,i,a)=> a.indexOf(v)===i);
  const xlabels = lbls.map(i=> `<text class="axis" text-anchor="middle" x="${sx(xs[i]).toFixed(1)}" y="${H-6}">${fmtDateShort(data[i].x)}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet">${grid}${line}${dots}${xlabels}</svg>`;
}

/* =========================================================
   DATA / SETTINGS
========================================================= */
function setUnit(u){
  state.settings.unit = u; save();
  document.getElementById('unitPill').textContent = u;
  document.querySelectorAll('.unitLabel').forEach(e=> e.textContent=u);
  renderData();
  if(current==='log') renderLog();
}
function renderData(){
  document.getElementById('unitLb').className = 'btn-block' + (unit()==='lb'?'':' btn-sec');
  document.getElementById('unitKg').className = 'btn-block' + (unit()==='kg'?'':' btn-sec');
  const lb = document.getElementById('lastBackup');
  lb.textContent = state.lastBackup ? `Last export: ${new Date(state.lastBackup).toLocaleString()}` : 'No backup exported yet.';
  // backup reminder banner
  const banner = document.getElementById('backupBanner');
  const daysSince = state.lastBackup ? (Date.now()-new Date(state.lastBackup))/86400000 : Infinity;
  if(state.sessions.length>0 && daysSince>14){
    banner.innerHTML = `<div class="backup-warn">⚠︎ It's been a while since your last backup. Tap <b>Export backup</b> below to protect your history.</div>`;
  }else banner.innerHTML='';
}
function exportData(){
  const blob = new Blob([JSON.stringify(state,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `liftlog-backup-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  state.lastBackup = new Date().toISOString(); save(); renderData();
  toast('Backup downloaded');
}
function importData(ev){
  const file = ev.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const d = JSON.parse(reader.result);
      if(!d || !Array.isArray(d.sessions)) throw new Error('bad file');
      confirmModal('Import this backup?', `${d.sessions.length} workouts, ${(d.bodyweights||[]).length} bodyweight entries. This replaces current data.`, ()=>{
        state = Object.assign(defaults(), d); save();
        document.getElementById('unitPill').textContent = unit();
        switchView('history'); toast('Imported');
      });
    }catch(e){ toast('Could not read that file'); }
    ev.target.value='';
  };
  reader.readAsText(file);
}
function clearAll(){
  confirmModal('Delete ALL data?','Every workout and bodyweight entry will be erased. Export a backup first if unsure.', ()=>{
    state = defaults(); save(); switchView('log'); toast('All data cleared');
  });
}

/* =========================================================
   MODALS
========================================================= */
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function closeModal(){ document.getElementById('modalRoot').innerHTML=''; }
function confirmModal(title, body, onYes){
  const root = document.getElementById('modalRoot');
  root.innerHTML = `<div class="modal-bg" onclick="if(event.target===this)closeModal()">
    <div class="modal">
      <h2>${esc(title)}</h2>
      <div class="muted small" style="margin-bottom:16px">${esc(body)}</div>
      <div class="row" style="gap:8px">
        <button class="btn-sec btn-block" onclick="closeModal()">Cancel</button>
        <button class="btn-block" id="mYes">Confirm</button>
      </div>
    </div></div>`;
  document.getElementById('mYes').onclick = ()=>{ closeModal(); onYes(); };
}
function inputModal(title, label, val, options, onOk){
  const root = document.getElementById('modalRoot');
  const dl = options && options.length ? `<datalist id="mlist">${options.map(o=>`<option value="${esc(o)}">`).join('')}</datalist>` : '';
  root.innerHTML = `<div class="modal-bg" onclick="if(event.target===this)closeModal()">
    <div class="modal">
      <h2>${esc(title)}</h2>
      <label>${esc(label)}</label>
      <input id="mInput" list="mlist" value="${esc(val)}" autocomplete="off" autocapitalize="words">
      ${dl}
      <div class="spacer"></div>
      <div class="row" style="gap:8px">
        <button class="btn-sec btn-block" onclick="closeModal()">Cancel</button>
        <button class="btn-block" id="mOk">Add</button>
      </div>
    </div></div>`;
  const inp = document.getElementById('mInput');
  setTimeout(()=> inp.focus(), 50);
  const go = ()=>{ const v=inp.value; closeModal(); onOk(v); };
  document.getElementById('mOk').onclick = go;
  inp.addEventListener('keydown', e=>{ if(e.key==='Enter') go(); });
}

/* =========================================================
   BOOT
========================================================= */
document.getElementById('unitPill').textContent = unit();
switchView('log');

// register service worker for offline use
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=> navigator.serviceWorker.register('sw.js').catch(()=>{}));
}
