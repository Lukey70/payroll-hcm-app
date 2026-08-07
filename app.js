(function(){
  'use strict';
  const APP_VERSION = DataStore.APP_VERSION;
  const PASSWORD = '1234';
  let state = DataStore.load();
  let showTerminated = false;
  const showTerminatedByTab = { jobData:false, jobSummary:false, taxDetails:false, bankDetails:false, superDetails:false, additionalEarnings:false, deductions:false, leave:false, absenceBalance:false, payslip:false };
  let leaveMonthOffset = 0;
  let leaveFilterEmp = '';
  let selectedPayslipKey = '';
  let selectedCalendarEmp = '';
  let selectedCalendarYear = null;
  let additionalPeriodOffset = 0;
  let additionalDraftRows = [];
  let additionalDirty = false;
  let selectedDeductionEmp = '';
  let selectedCertCycleId = '';
  let selectedReportEmp = '';
  let statementPreviewHtml = '';
  let deductionDraftRows = [];
  let deductionDirty = false;
  let deductionDraftLoadedFor = '';
  let taxDirty = false;
  let selectedTaxRecordId = '';
  let absenceEditing = false;
  let absenceDraft = null;
  let selectedJobDataEmp = '';
  let selectedJobDataRowIndex = 0;
  let selectedJobDataDraft = null;
  let settingsView = 'general';
  let pendingTab = null;
  let timeoutWarning = null;
  let timeoutLogout = null;

  const $ = id => document.getElementById(id);
  const h = (id,html) => { const el=$(id); if(el) el.innerHTML=html; };
  const v = id => ($(id) ? $(id).value : '');
  const setv = (id,val) => { if($(id)) $(id).value = val == null ? '' : val; };
  const esc = value => String(value == null ? '' : value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const uid = prefix => DataStore.uid(prefix);
  const E = PayrollEngine;

  document.addEventListener('DOMContentLoaded', init);

  function init(){
    state = DataStore.migrate(state);
    DataStore.save(state);
    attachGlobalEvents();
    hydrateLogin();
    calculateAllForCurrent();
    renderAll();
  }

  function attachGlobalEvents(){
    $('loginButton').addEventListener('click', login);
    $('loginPassword').addEventListener('keydown', e=>{ if(e.key==='Enter') login(); });
    $('logoutButton').addEventListener('click', logout);
    $('calculatePayButton').addEventListener('click', openCalculateModal);
    $('importDataButton').addEventListener('click', ()=>$('importFile').click());
    $('exportDataButton').addEventListener('click', exportData);
    $('importFile').addEventListener('change', importData);
    document.querySelectorAll('.nav-btn').forEach(btn=>btn.addEventListener('click', ()=>attemptShowTab(btn.dataset.tab, btn)));
    const employeeDataToggle = $('employeeDataToggle');
    if(employeeDataToggle) employeeDataToggle.addEventListener('click', toggleEmployeeDataNav);
    const alertsBell = $('alertsBell');
    if(alertsBell) alertsBell.addEventListener('click', toggleAlertsDropdown);
    document.addEventListener('click', closeAlertsWhenClickingAway);
    window.addEventListener('afterprint', ()=>h('printArea',''));
    ['mousemove','mousedown','keydown','touchstart','click'].forEach(evt=>document.addEventListener(evt, resetInactivityTimers, {passive:true}));
  }

  function toggleEmployeeDataNav(){
    const group = $('employeeDataGroup'); const toggle = $('employeeDataToggle');
    if(!group || !toggle) return;
    const open = !group.classList.contains('open');
    group.classList.toggle('open', open);
    toggle.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  function unreadAlerts(){ return (state.alerts||[]).filter(a=>a && a.read !== true); }
  function alertKeyExists(key){ return !!key && (state.alerts||[]).some(a=>a && a.key===key); }
  function addAlert(message, key, type='info', action=null){
    if(!message) return;
    if(key && alertKeyExists(key)) return;
    state.alerts = state.alerts || [];
    state.alerts.unshift({ id:uid('alert'), key:key||uid('alertkey'), type, message, action:action||null, read:false, createdAt:new Date().toISOString() });
    save();
  }
  function markAlertRead(alertId){
    const a=(state.alerts||[]).find(x=>x.id===alertId);
    if(a){ a.read=true; a.readAt=new Date().toISOString(); save(); renderAlerts(); }
  }
  function clearCertificationAlerts(cycleId){
    const cycleToken=String(cycleId);
    let changed=false;
    (state.alerts||[]).forEach(a=>{
      const action=inferredAlertAction(a);
      if(a.read!==true && action && action.tab==='certification' && String(action.cycleId||'')===cycleToken){
        a.read=true; a.readAt=new Date().toISOString(); changed=true;
      }
    });
    return changed;
  }
  function certificationRecord(cycleId){
    const key=String(cycleId);
    const rec = state.certifications[key] || { lines:{}, completed:false, locked:false };
    if(!rec.lines) rec.lines = {};
    if(rec.completed === undefined) rec.completed = !!rec.locked;
    if(rec.locked === undefined) rec.locked = !!rec.completed;
    state.certifications[key] = rec;
    return rec;
  }
  function isCertificationComplete(cycleId){
    const rec=state.certifications[String(cycleId)];
    return !!(rec && (rec.completed || rec.locked));
  }
  function ensureCertificationAlerts(){
    const today=todayIso();
    const current=currentCycle();
    const currentRec=state.certifications[String(current.id)];
    if(today===current.closeDate && !isCertificationComplete(current.id)){
      addAlert(`Reminder: Certification Report for ${E.ppeLabel(current)} must be completed by 5pm today.`, `cert-close-${current.id}-${today}`, 'warning', { tab:'certification', cycleId:current.id });
    }
    E.PAY_CYCLES.filter(c=>c.id<current.id).forEach(c=>{
      const hasLines=(state.payslips||[]).some(p=>Number(p.cycleId)===Number(c.id));
      if(hasLines && !isCertificationComplete(c.id)){
        addAlert(`Certification report for ${E.ppeLabel(c)} has not yet been completed and is overdue. Please complete this certification report as soon as possible.`, `cert-overdue-${c.id}-${today}`, 'warning', { tab:'certification', cycleId:c.id });
      }
    });
  }
  function inferredAlertAction(alert){
    if(alert && alert.action) return alert.action;
    const key=String((alert && alert.key) || '');
    let m=key.match(/^cert-(?:close|overdue)-(\d+)-/);
    if(m) return { tab:'certification', cycleId:Number(m[1]) };
    m=key.match(/^cert-paychanged-(\d+)-(.+)-\d+$/);
    if(m) return { tab:'certification', cycleId:Number(m[1]), payId:m[2] };
    if(alert && /Certification report|Certification Report|Certification removed/.test(String(alert.message||''))) return { tab:'certification' };
    return null;
  }
  function renderAlerts(){
    ensureCertificationAlerts();
    const alerts = unreadAlerts();
    const badge = $('alertsBadge'); const dropdown = $('alertsDropdown');
    if(badge){ badge.textContent = String(alerts.length); badge.classList.toggle('hide', alerts.length === 0); }
    if(dropdown){
      dropdown.innerHTML = alerts.length ? alerts.map(a=>`<div class="alert-item"><button type="button" class="alert-action" data-alert-go="${esc(a.id)}">${esc(a.message || a.title || 'Alert')}</button><button type="button" class="alert-read" data-alert-read="${esc(a.id)}">Mark as read</button></div>`).join('') : '<div class="alert-empty">No New Alerts</div>';
      dropdown.querySelectorAll('[data-alert-read]').forEach(b=>b.addEventListener('click', event=>{ event.stopPropagation(); markAlertRead(b.dataset.alertRead); }));
      dropdown.querySelectorAll('[data-alert-go]').forEach(b=>b.addEventListener('click', event=>{ event.stopPropagation(); navigateFromAlert(b.dataset.alertGo); }));
    }
  }
  function navigateFromAlert(alertId){
    const alert=(state.alerts||[]).find(a=>a.id===alertId);
    const action=inferredAlertAction(alert);
    const dropdown=$('alertsDropdown'); const bell=$('alertsBell');
    if(dropdown) dropdown.setAttribute('hidden','');
    if(bell) bell.setAttribute('aria-expanded','false');
    if(!action || !action.tab) return;
    if(action.tab==='certification' && action.cycleId) selectedCertCycleId=String(action.cycleId);
    const btn=document.querySelector(`.nav-btn[data-tab="${action.tab}"]`);
    attemptShowTab(action.tab, btn);
    setTimeout(()=>{
      if(action.tab==='certification'){
        const select=$('certCycle');
        if(select && action.cycleId){ select.value=String(action.cycleId); renderCertOutput(); }
        if(action.payId){
          const row=document.querySelector(`[data-cert-row="${CSS.escape(String(action.payId))}"]`);
          if(row){ row.scrollIntoView({block:'center', behavior:'smooth'}); row.classList.add('unsaved'); setTimeout(()=>row.classList.remove('unsaved'), 2200); }
        }
      }
    }, 30);
  }
  function toggleAlertsDropdown(event){
    event.stopPropagation();
    renderAlerts();
    const dropdown = $('alertsDropdown'); const bell = $('alertsBell');
    if(!dropdown || !bell) return;
    const isHidden = dropdown.hasAttribute('hidden');
    if(isHidden) dropdown.removeAttribute('hidden'); else dropdown.setAttribute('hidden','');
    bell.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
  }
  function closeAlertsWhenClickingAway(event){
    const menu = $('alertsMenu'); const dropdown = $('alertsDropdown'); const bell = $('alertsBell');
    if(!menu || !dropdown || menu.contains(event.target)) return;
    dropdown.setAttribute('hidden','');
    if(bell) bell.setAttribute('aria-expanded','false');
  }

  function hydrateLogin(){
    if(sessionStorage.getItem('payrollAuthed') === 'true'){
      $('loginScreen').style.display='none';
      startInactivityTimers();
      checkOvernightProcessing(false);
    }else $('loginScreen').style.display='flex';
  }
  function login(){
    if($('processingScreen').classList.contains('open')) return;
    if(v('loginPassword') === PASSWORD){
      sessionStorage.setItem('payrollAuthed','true');
      $('loginScreen').style.display='none';
      h('loginError',''); setv('loginPassword','');
      startInactivityTimers();
      checkOvernightProcessing(false);
    }else h('loginError','Incorrect password.');
  }
  function logout(){
    sessionStorage.removeItem('payrollAuthed');
    $('loginScreen').style.display='flex';
    closeModal();
    clearTimeout(timeoutWarning); clearTimeout(timeoutLogout);
  }
  function resetInactivityTimers(){ if(sessionStorage.getItem('payrollAuthed')==='true') startInactivityTimers(); }
  function startInactivityTimers(){
    clearTimeout(timeoutWarning); clearTimeout(timeoutLogout);
    timeoutWarning = setTimeout(()=>alert('You will be logged out soon if you remain inactive.'), 10*60*1000);
    timeoutLogout = setTimeout(logout, 15*60*1000);
  }

  function save(){ if(!DataStore.save(state)) toast('Unable to save data in this browser. Export a backup before continuing.',6000); }
  function toast(message, duration=2200){ h('toast', esc(message)); $('toast').classList.add('open'); setTimeout(()=>$('toast').classList.remove('open'), duration); }
  function log(message){ state.auditLog.unshift(new Date().toLocaleString('en-AU') + ' — ' + message); save(); renderAudit(); }
  function emp(id){ return state.employees.find(e=>e.id===id); }
  function currentCycle(){ return E.currentCycle(state); }
  function currentResults(){ return state.payResults[String(currentCycle().id)] || []; }
  function paySignature(p){
    const rows=(p.rows||[]).map(r=>({d:r.description,u:Number(r.units||0),a:Number(r.amount||0),s:r.startDate||'',e:r.endDate||'',rate:Number(r.rate||0),k:r.kind||''}));
    return JSON.stringify({empId:p.empId,position:p.position||'',gross:Number(p.gross||0),tax:Number(p.tax||0),net:Number(p.net||0),rows});
  }
  function reconcileCertificationForCycle(c, oldResults, newResults){
    if(!c || Number(c.id)!==Number(currentCycle().id)) return;
    const rec=state.certifications[String(c.id)];
    if(!rec || !rec.lines) return;
    const byId=new Map((newResults||[]).map(p=>[String(p.id),p]));
    let changed=false;
    Object.keys(rec.lines).forEach(lineId=>{
      const line=rec.lines[lineId];
      if(!line || !line.certified) return;
      const currentLine=byId.get(String(lineId));
      const newHash=currentLine?paySignature(currentLine):'';
      if(!currentLine || (line.payHash && line.payHash!==newHash)){
        line.certified=false;
        line.uncertifiedAt=new Date().toISOString();
        changed=true;
        const employeeName=currentLine?currentLine.employeeName:(line.employeeName||'An employee');
        addAlert(`Certification removed: ${employeeName}'s pay changed after certification. Please review and certify again.`, `cert-paychanged-${c.id}-${lineId}-${Date.now()}`, 'warning', {tab:'certification',cycleId:c.id,payId:lineId});
      }
    });
    if(rec.completed){
      const added=(newResults||[]).filter(p=>!(rec.lines[String(p.id)]&&rec.lines[String(p.id)].certified));
      if(added.length){
        changed=true;
        addAlert(`Certification Report for ${E.ppeLabel(c)} was unlocked because new or changed pay lines require review.`, `cert-lineschanged-${c.id}-${Date.now()}`, 'warning', {tab:'certification',cycleId:c.id,payId:added[0].id});
      }
    }
    if(changed){ rec.completed=false; rec.locked=false; rec.completedAt=''; rec.updatedAt=new Date().toISOString(); }
  }
  function calculateAllForCurrent(){
    const c=currentCycle();
    const oldResults=state.payResults[String(c.id)] || [];
    const newResults=E.calculateAll(state,c.id,false);
    state.payResults[String(c.id)] = newResults;
    reconcileCertificationForCycle(c, oldResults, newResults);
    save();
  }
  function calculateOne(empId){
    const c = currentCycle();
    const oldResults = state.payResults[String(c.id)] || [];
    let results = oldResults.filter(p=>p.empId !== empId).concat(E.calculateEmployee(state,empId,c.id,false));
    state.payResults[String(c.id)] = results;
    reconcileCertificationForCycle(c, oldResults, results);
    save();
  }
  function employeeDisplayStatus(e){
    if(e && e.terminationDate) return E.isTerminatedOn(e,todayIso()) ? 'Terminated' : 'Active';
    return e && e.status === 'Terminated' ? 'Terminated' : 'Active';
  }
  function activeEmployees(){ return state.employees.filter(e=>employeeDisplayStatus(e) !== 'Terminated'); }
  function employeeList(includeTerminated=false){ return includeTerminated ? state.employees : activeEmployees(); }
  function employeeOptions(list=null, blank=true){
    const source = list || activeEmployees();
    const opts = source.map(e=>`<option value="${esc(e.id)}">${esc(E.employeeName(e))} (${esc(e.id)})</option>`).join('');
    return (blank ? '<option value="">Select employee</option>' : '') + opts;
  }
  function showTerminatedControl(id, tabKey, label='Show terminated employees'){
    return `<label class="inline-check"><input type="checkbox" id="${esc(id)}" ${showTerminatedByTab[tabKey]?'checked':''}> ${esc(label)}</label>`;
  }
  function bindShowTerminated(id, tabKey, rerender){
    const el=$(id); if(!el) return;
    el.addEventListener('change',()=>{ showTerminatedByTab[tabKey]=el.checked; rerender(); });
  }
  function table(headers, rows){
    return `<div class="table-wrap"><table><thead><tr>${headers.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c == null ? '' : c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function badge(text){
    const safe = esc(text || '');
    const cls = String(text).toLowerCase().replace(/\s+/g,'-');
    return `<span class="badge badge-${cls}">${safe}</span>`;
  }
  function modal(title, body, footer='', small=false){
    $('modalRoot').innerHTML = `<div class="modal ${small?'small':''}"><div class="modal-header"><h2>${esc(title)}</h2><button type="button" class="secondary" data-close-modal>Close</button></div>${body}${footer?`<div class="modal-footer">${footer}</div>`:''}</div>`;
    $('modalRoot').classList.add('open');
    $('modalRoot').querySelectorAll('[data-close-modal]').forEach(b=>b.addEventListener('click', closeModal));
  }
  function closeModal(){ $('modalRoot').classList.remove('open'); $('modalRoot').innerHTML=''; }
  function confirmModal(message, yesLabel, onYes, noLabel='No'){
    modal('Confirm', `<p>${esc(message)}</p>`, `<button type="button" class="danger" id="confirmYes">${esc(yesLabel)}</button><button type="button" class="secondary" data-close-modal>${esc(noLabel)}</button>`, true);
    $('confirmYes').addEventListener('click', ()=>{ closeModal(); onYes(); });
  }

  function jobDataExitConfirm(onYes){
    $('modalRoot').innerHTML = `<div class="modal small"><div class="modal-header"><h2>Confirm</h2></div><p>Are you sure you want to exit without saving?</p><div class="modal-footer"><button type="button" class="danger" id="jobDataExitYes">Yes</button><button type="button" class="secondary" id="jobDataExitNo">No</button></div></div>`;
    $('modalRoot').classList.add('open');
    $('jobDataExitYes').addEventListener('click', ()=>{ closeModal(); onYes(); });
    $('jobDataExitNo').addEventListener('click', closeModal);
  }
  function loadingModal(title, doneMessage, callback, delay=900){
    modal(title, `<div class="spinner"></div><p class="muted">Please wait...</p>`, '', true);
    setTimeout(()=>{ callback && callback(); modal(title, `<p class="success-text"><strong>${esc(doneMessage)}</strong></p>`, `<button type="button" data-close-modal>Close</button>`, true); }, delay);
  }


  function normaliseJobDataCompare(row){
    const hours = Object.assign({0:0,1:0,2:0,3:0,4:0,5:0,6:0}, (row && row.hoursByDay) || {});
    const normalHours = {};
    [0,1,2,3,4,5,6].forEach(k=>{ normalHours[k] = Number(hours[k] || 0); });
    return {
      id: row && row.id ? String(row.id) : '',
      empId: row && row.empId ? String(row.empId) : '',
      effectiveDate: row && row.effectiveDate ? String(row.effectiveDate) : '',
      effectiveSequence: Number((row && row.effectiveSequence) || 0),
      action: row && row.action ? String(row.action) : '',
      reason: row && row.reason ? String(row.reason) : '',
      positionNumber: row && row.positionNumber ? String(row.positionNumber) : '',
      positionClass: row && row.positionClass ? String(row.positionClass) : '',
      hoursByDay: normalHours
    };
  }
  function jobDataHasUnsavedChanges(){
    const section = $('jobData');
    if(!section || !section.classList.contains('active') || !$('jdEffectiveDate')) return false;
    const current = readJobDataForm();
    const original = (state.jobDataRows||[]).find(r=>r.id===current.id);
    if(!original) return true;
    return JSON.stringify(normaliseJobDataCompare(current)) !== JSON.stringify(normaliseJobDataCompare(original));
  }
  function discardJobDataUnsavedChanges(){
    selectedJobDataDraft = null;
    selectedJobDataRowIndex = 0;
  }

  function attemptShowTab(tab, btn){
    if(document.getElementById('additionalEarnings').classList.contains('active') && tab !== 'additionalEarnings' && additionalDirty){
      pendingTab = { tab, btn };
      confirmModal('Are you sure you want to exit without saving?', 'Yes', ()=>{ additionalDirty=false; pendingTab && showTab(pendingTab.tab,pendingTab.btn); pendingTab=null; }, 'No');
      return;
    }
    if(document.getElementById('taxDetails').classList.contains('active') && tab !== 'taxDetails' && taxDirty){
      pendingTab = { tab, btn };
      confirmModal('Are you sure you want to exit without saving?', 'Yes', ()=>{ taxDirty=false; pendingTab && showTab(pendingTab.tab,pendingTab.btn); pendingTab=null; }, 'No');
      return;
    }
    if(document.getElementById('jobData') && document.getElementById('jobData').classList.contains('active') && tab !== 'jobData' && jobDataHasUnsavedChanges()){
      pendingTab = { tab, btn };
      jobDataExitConfirm(()=>{ discardJobDataUnsavedChanges(); const next=pendingTab; pendingTab=null; if(next) showTab(next.tab,next.btn); });
      return;
    }
    if(document.getElementById('deductions').classList.contains('active') && tab !== 'deductions' && deductionDirty){
      pendingTab = { tab, btn };
      modal('Unsaved Deductions', '<p>You have unsaved deduction changes. Save or discard them before leaving the Deductions tab.</p>', '<button id="saveDeductionsExit">Save</button><button id="discardDeductionsExit" class="danger">Discard</button><button data-close-modal class="secondary">Cancel</button>', true);
      $('saveDeductionsExit').addEventListener('click',()=>saveDeductions(()=>{ const next=pendingTab; pendingTab=null; closeModal(); if(next) showTab(next.tab,next.btn); }));
      $('discardDeductionsExit').addEventListener('click',()=>{ deductionDirty=false; deductionDraftRows=[]; deductionDraftLoadedFor=''; selectedDeductionEmp=''; const next=pendingTab; pendingTab=null; closeModal(); if(next) showTab(next.tab,next.btn); });
      return;
    }
    showTab(tab, btn);
  }
  function showTab(tab, btn){
    const leavingDeductions = document.getElementById('deductions').classList.contains('active') && tab !== 'deductions';
    const leavingPayslip = document.getElementById('payslip').classList.contains('active') && tab !== 'payslip';
    const leavingJobData = document.getElementById('jobData') && document.getElementById('jobData').classList.contains('active') && tab !== 'jobData';
    if(leavingJobData){ selectedJobDataEmp=''; selectedJobDataDraft=null; selectedJobDataRowIndex=0; }
    if(leavingDeductions){ selectedDeductionEmp=''; deductionDraftRows=[]; deductionDirty=false; deductionDraftLoadedFor=''; }
    if(leavingPayslip){ clearOpenPayslip(); }
    document.querySelectorAll('.tab-section').forEach(s=>s.classList.remove('active'));
    const target=$(tab);
    if(target) target.classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
    if(btn) btn.classList.add('active');
    if(['employees','bankDetails','taxDetails','superDetails'].includes(tab)){
      const group=$('employeeDataGroup'); const toggle=$('employeeDataToggle');
      if(group) group.classList.add('open');
      if(toggle){ toggle.classList.add('open'); toggle.setAttribute('aria-expanded','true'); }
    }
    resetTabScroll();
    if(tab==='additionalEarnings') loadAdditionalDraft();
    if(tab==='jobData') renderJobData();
    if(tab==='deductions') renderDeductions();
    if(tab==='taxDetails') renderTaxDetails();
    if(tab==='certification') renderCertification();
    if(tab==='reports') renderReports();
    if(tab==='payslip') renderPayslip();
    resetTabScroll();
    requestAnimationFrame(resetTabScroll);
    setTimeout(resetTabScroll, 0);
  }

  function resetTabScroll(){
    try{ window.scrollTo({ top:0, left:0, behavior:'auto' }); }catch(e){}
    const scrollTargets = [window, document.documentElement, document.body, document.scrollingElement, document.querySelector('main'), document.querySelector('.app-shell')].filter(Boolean);
    scrollTargets.forEach(target=>{
      try{
        if(target === window) target.scrollTo({ top:0, left:0, behavior:'auto' });
        else { target.scrollTop = 0; target.scrollLeft = 0; }
      }catch(e){}
    });
  }

  function renderAll(){
    renderMetrics(); renderEmployees(); renderBankDetails(); renderSuperDetails(); renderJobData(); renderJobSummary(); renderAdditionalEarnings(); renderTaxDetails(); renderDeductions(); renderLeave(); renderAbsenceBalance(); renderPayslip(); renderCertification(); renderReports(); renderAudit(); renderSettings(); renderAlerts();
  }
  function renderMetrics(){
    const c = currentCycle();
    const results = currentResults();
    h('versionLabel', `v${APP_VERSION}`);
    h('metricEmployees', String(activeEmployees().length));
    h('metricGross', E.money(results.reduce((s,p)=>s+p.gross,0)));
    h('metricRetro', E.money(results.reduce((s,p)=>s+p.retro,0)));
    h('metricPayStatus', `${E.ppeLabel(c)}<small>Period: ${E.fmtPay(c.start)} - ${E.fmtPay(c.end)}<br>Payment Date: ${E.fmtPay(c.paymentDate)}<br>Pay close: ${E.fmtPay(c.closeDate)}</small>`);
  }

  function renderEmployees(){
    const list = state.employees.filter(e=>showTerminated || employeeDisplayStatus(e) !== 'Terminated');
    h('employees', `<h2>Personal Details</h2><p class="small-note">Employee IDs auto-generate. Job details are now maintained through Job Data.</p><div class="controls"><button id="addEmployeeBtn">Add New Employee</button><button id="toggleTerminatedBtn" class="ghost">${showTerminated?'Hide':'Show'} Terminated Employees</button></div><div id="employeesTable"></div>`);
    h('employeesTable', table(['ID','First Name','Last Name','Status','Actions'], list.map(e=>[
      esc(e.id), esc(e.firstName||''), esc(e.lastName||''), badge(employeeDisplayStatus(e)), `<button class="icon-btn" data-edit-details="${esc(e.id)}" title="Edit personal details">✏️</button> <button class="icon-btn" data-view-personal="${esc(e.id)}" title="View current personal details">👁️</button>`
    ])));
    $('addEmployeeBtn').addEventListener('click', openAddEmployee);
    $('toggleTerminatedBtn').addEventListener('click', ()=>{ showTerminated=!showTerminated; renderEmployees(); });
    document.querySelectorAll('[data-edit-details]').forEach(b=>b.addEventListener('click',()=>openEditEmployeeDetails(b.dataset.editDetails)));
    document.querySelectorAll('[data-view-personal]').forEach(b=>b.addEventListener('click',()=>openPersonalDetailsView(b.dataset.viewPersonal)));
  }
  function renderBankDetails(){
    h('bankDetails', '<h2>Bank Details</h2><p class="small-note">This tab is ready for future bank details. No bank details fields have been added yet.</p>');
  }
  function renderSuperDetails(){
    h('superDetails', '<h2>Super</h2><p class="small-note">This tab is ready for future superannuation details. No super details fields have been added yet.</p>');
  }

  function nextEmployeeId(){ let max=0; state.employees.forEach(e=>{ const m=String(e.id).match(/\d+/); if(m) max=Math.max(max,Number(m[0])); }); return String(max+1).padStart(6,'0'); }
  function scheduleInputs(prefix){
    return `<div class="grid day-grid"><div><label>Monday Hours</label><input id="${prefix}Mon" type="number" step="0.01"></div><div><label>Tuesday Hours</label><input id="${prefix}Tue" type="number" step="0.01"></div><div><label>Wednesday Hours</label><input id="${prefix}Wed" type="number" step="0.01"></div><div><label>Thursday Hours</label><input id="${prefix}Thu" type="number" step="0.01"></div><div><label>Friday Hours</label><input id="${prefix}Fri" type="number" step="0.01"></div><div><label>Saturday Hours</label><input id="${prefix}Sat" type="number" step="0.01"></div><div><label>Sunday Hours</label><input id="${prefix}Sun" type="number" step="0.01"></div></div>`;
  }
  function getSchedule(prefix){ return {1:Number(v(`${prefix}Mon`)||0),2:Number(v(`${prefix}Tue`)||0),3:Number(v(`${prefix}Wed`)||0),4:Number(v(`${prefix}Thu`)||0),5:Number(v(`${prefix}Fri`)||0),6:Number(v(`${prefix}Sat`)||0),0:Number(v(`${prefix}Sun`)||0)}; }
  function weeklyHours(map){ return Object.values(map||{}).reduce((s,x)=>s+Number(x||0),0); }
  function openAddEmployee(){
    modal('Add New Employee', `<div class="grid form-grid"><div><label>Employee ID</label><input id="newId" readonly value="${nextEmployeeId()}"></div><div><label>First Name</label><input id="newFirst" autocomplete="given-name"></div><div><label>Last Name</label><input id="newLast" autocomplete="family-name"></div></div><div class="divider"></div><h3>Personal Details</h3><div class="grid form-grid"><div><label>Date of Birth</label><input id="newDOB" type="date"></div><div><label>Email</label><input id="newEmail" type="email" autocomplete="email"></div><div><label>Phone number</label><input id="newPhone" type="tel" autocomplete="tel"></div><div class="full-line"><label>Address</label><input id="newAddressLine" autocomplete="address-line1"></div><div><label>Town/Suburb</label><input id="newTownSuburb" autocomplete="address-level2"></div><div><label>State</label><input id="newState" autocomplete="address-level1"></div><div><label>Postcode</label><input id="newPostcode" autocomplete="postal-code"></div><div><label>Country</label><input id="newCountry" autocomplete="country-name" value="Australia"></div></div><div class="divider"></div><h3>Tax Details</h3><div class="grid form-grid"><div><label>Effective Date</label><input id="newTaxEffective" type="date" value="${todayIso()}"></div><div><label>Tax File Number</label><input id="newTaxFileNumber" type="password"></div><div><label>Claim Tax Free Threshold</label><select id="newTaxThreshold"><option value="true">Yes</option><option value="false">No</option></select></div><div><label>STSL</label><select id="newTaxStsl"><option value="false">No</option><option value="true">Yes</option></select></div></div>`, `<button id="saveNewEmployee">Add Employee</button>`, false);
    $('saveNewEmployee').addEventListener('click', saveNewEmployee);
  }
  function saveNewEmployee(){
    if(!v('newFirst').trim() || !v('newLast').trim()) return alert('Enter first and last name.');
    const taxEffective = v('newTaxEffective') || todayIso();
    const personal = { id:uid('personal'), effectiveDate:taxEffective, dateOfBirth:v('newDOB'), email:v('newEmail'), phone:v('newPhone'), addressLine:v('newAddressLine'), townSuburb:v('newTownSuburb'), state:v('newState'), postcode:v('newPostcode'), country:v('newCountry')||'Australia' };
    const e = { id:v('newId'), firstName:v('newFirst').trim(), lastName:v('newLast').trim(), name:`${v('newFirst').trim()} ${v('newLast').trim()}`, department:'', position:'', type:'', startDate:'', originalStartDate:'', lslServiceDate:'', contractEndDate:'', autoTerminate:false, hourlyRate:0, annualLeaveBalance:0, personalLeaveBalance:0, lslAccruedBalance:0, dateOfBirth:personal.dateOfBirth, email:personal.email, phone:personal.phone, addressLine:personal.addressLine, townSuburb:personal.townSuburb, state:personal.state, postcode:personal.postcode, country:personal.country, address:personal.addressLine, personalDetailsHistory:[personal], employmentSegments:[], status:'Active' };
    state.employees.push(e);
    addJobEvent(e.id,'Personal Details',taxEffective,'Personal details recorded','employee',e.id);
    state.taxDetails.push({ id:uid('tax'), empId:e.id, effectiveDate:taxEffective, taxFileNumber:v('newTaxFileNumber'), claimTaxFreeThreshold:v('newTaxThreshold')==='true', stsl:v('newTaxStsl')==='true' });
    addJobEvent(e.id,'Tax Details',taxEffective,'Initial tax details recorded','tax',state.taxDetails[state.taxDetails.length-1].id);
    save(); closeModal(); calculateAllForCurrent(); log(`Employee added: ${E.employeeName(e)}`); renderAll(); toast(`Add Job Data before processing pay for ${E.employeeName(e)}`, 8000);
  }
  function addJobEvent(empId,type,effectiveDate,description,refKind,refId){ state.jobEvents.push({ id:uid('job'), empId, type, effectiveDate, description, refKind, refId }); }

  function openEditEmployeeDetails(empId){
    const e=emp(empId); if(!e) return;
    const current=E.activePersonalDetails(state,e.id,todayIso());
    modal('Edit Employee Details', `<input id="editDetailsId" type="hidden" value="${esc(empId)}"><div class="grid form-grid"><div class="full-line"><label>Effective Date of Change</label><input id="editDetailsEffective" type="date" value="${esc(todayIso())}"></div><div><label>First Name</label><input id="editFirst" value="${esc(e.firstName||'')}" autocomplete="given-name"></div><div><label>Last Name</label><input id="editLast" value="${esc(e.lastName||'')}" autocomplete="family-name"></div><div><label>Date of Birth</label><input id="editDOB" type="date" value="${esc(current.dateOfBirth||'')}"></div><div><label>Email</label><input id="editEmail" type="email" value="${esc(current.email||'')}" autocomplete="email"></div><div><label>Phone number</label><input id="editPhone" type="tel" value="${esc(current.phone||'')}" autocomplete="tel"></div><div class="full-line"><label>Address</label><input id="editAddressLine" value="${esc(current.addressLine||'')}" autocomplete="address-line1"></div><div><label>Town/Suburb</label><input id="editTownSuburb" value="${esc(current.townSuburb||'')}" autocomplete="address-level2"></div><div><label>State</label><input id="editState" value="${esc(current.state||'')}" autocomplete="address-level1"></div><div><label>Postcode</label><input id="editPostcode" value="${esc(current.postcode||'')}" autocomplete="postal-code"></div><div><label>Country</label><input id="editCountry" value="${esc(current.country||'Australia')}" autocomplete="country-name"></div></div>`, `<button id="saveDetails">Save Details</button>`, true);
    $('saveDetails').addEventListener('click',()=>{
      if(!v('editDetailsEffective')) return alert('Enter an effective date.');
      e.firstName=v('editFirst').trim(); e.lastName=v('editLast').trim(); e.name=`${e.firstName} ${e.lastName}`.trim();
      e.dateOfBirth=v('editDOB'); e.email=v('editEmail'); e.phone=v('editPhone'); e.addressLine=v('editAddressLine'); e.townSuburb=v('editTownSuburb'); e.state=v('editState'); e.postcode=v('editPostcode'); e.country=v('editCountry')||'Australia'; e.address=e.addressLine;
      if(!Array.isArray(e.personalDetailsHistory)) e.personalDetailsHistory=[];
      e.personalDetailsHistory.push({ id:uid('personal'), effectiveDate:v('editDetailsEffective'), dateOfBirth:e.dateOfBirth, email:e.email, phone:e.phone, addressLine:e.addressLine, townSuburb:e.townSuburb, state:e.state, postcode:e.postcode, country:e.country });
      addJobEvent(e.id,'Personal Details Change',v('editDetailsEffective'),'Personal details updated','employee',e.id);
      save(); closeModal(); log('Employee personal details updated'); renderAll();
    });
  }
  function openPersonalDetailsView(empId){
    const e=emp(empId); if(!e) return;
    const d=E.activePersonalDetails(state,e.id,todayIso());
    const locality=[d.townSuburb,d.state,d.postcode].filter(Boolean).join(' ');
    const body = `<div class="personal-card"><p><strong>${esc(E.employeeName(e))}</strong></p><p><strong>Date of Birth:</strong> ${esc(d.dateOfBirth||'')}</p><p><strong>Email:</strong> ${esc(d.email||'')}</p><p><strong>Phone number:</strong> ${esc(d.phone||'')}</p><p><strong>Address:</strong><br>${esc(d.addressLine||'')}<br>${esc(locality)}<br>${esc(d.country||'')}</p></div>`;
    modal('Current Personal Details', body, '', true);
  }
  const JOB_REASON_OPTIONS = {
    Commencement: ['New Hire Permanent','New Hire Fixed-Term','New Hire Casual','Rehire Permanent','Rehire Fixed-Term','Rehire Casual','New Fixed Term Contract'],
    Variation: ['Work Schedule Adjustment','Permanency Confirmed','Permanency Removed','Position Refresh','Pay Rate Change'],
    Movement: ['Acting Same Level','Acting Higher Level','Return from Temp Assignment','Promotion','Regression'],
    Termination: ['Voluntary Resignation','Voluntary Retirement','Appointment Cancelled','Expiry of Fixed Term']
  };
  function positionByNumber(num){ return (state.positions||[]).find(p=>String(p.positionNumber)===String(num)); }
  function sortedJobDataRows(empId){
    return (state.jobDataRows||[]).filter(r=>r.empId===empId).sort((a,b)=>E.compare(b.effectiveDate,a.effectiveDate)||Number(b.effectiveSequence||0)-Number(a.effectiveSequence||0));
  }
  function jobDataDisplayRows(empId){
    const rows=sortedJobDataRows(empId).slice();
    if(selectedJobDataDraft && selectedJobDataDraft.empId===empId){
      const idx=rows.findIndex(r=>r.id===selectedJobDataDraft.id);
      if(idx>=0) rows[idx]=selectedJobDataDraft;
      else rows.unshift(selectedJobDataDraft);
    }
    return rows;
  }
  function nextEffectiveSequence(empId, effectiveDate){
    const matches=(state.jobDataRows||[]).filter(r=>r.empId===empId && r.effectiveDate===effectiveDate);
    return matches.length ? Math.max(...matches.map(r=>Number(r.effectiveSequence||0)))+1 : 0;
  }
  function renderJobData(){
    if(!selectedJobDataEmp){
      h('jobData', `<h2>Job Data</h2><p class="small-note">Select an employee to view or add effective-dated job rows.</p><div class="controls">${showTerminatedControl('jobDataShowTerminated','jobData')}</div><div class="grid form-grid"><div><label>Employee</label><select id="jobDataEmpSelect">${employeeOptions(employeeList(showTerminatedByTab.jobData))}</select></div></div>`);
      bindShowTerminated('jobDataShowTerminated','jobData',renderJobData);
      $('jobDataEmpSelect').addEventListener('change',()=>{ selectedJobDataEmp=v('jobDataEmpSelect'); selectedJobDataRowIndex=0; selectedJobDataDraft=null; renderJobData(); });
      return;
    }
    const e=emp(selectedJobDataEmp); if(!e){ selectedJobDataEmp=''; renderJobData(); return; }
    const rows=jobDataDisplayRows(e.id);
    const totalRows=rows.length;
    if(selectedJobDataRowIndex<0) selectedJobDataRowIndex=0;
    if(totalRows && selectedJobDataRowIndex>=totalRows) selectedJobDataRowIndex=totalRows-1;
    const row = rows[selectedJobDataRowIndex];
    h('jobData', `<h2>Job Data</h2><p><strong>${esc(E.employeeName(e))}</strong></p><div class="controls"><button id="jobDataChangeEmp" class="secondary">Change Employee</button><button id="jobDataAdd" title="Add row">＋</button><button id="jobDataMinus" class="danger" title="Remove row">−</button><button id="jobDataPrev" class="secondary">←</button><span class="row-indicator">${totalRows?`${selectedJobDataRowIndex+1} of ${totalRows}`:'0 of 0'}</span><button id="jobDataNext" class="secondary">→</button></div><div id="jobDataForm"></div>`);
    $('jobDataChangeEmp').addEventListener('click',()=>{ selectedJobDataEmp=''; selectedJobDataDraft=null; selectedJobDataRowIndex=0; renderJobData(); });
    $('jobDataAdd').addEventListener('click',()=>{
      const previous = row || sortedJobDataRows(e.id)[0] || {};
      const draft = JSON.parse(JSON.stringify(previous));
      draft.id=uid('jobdata'); draft.empId=e.id; draft.effectiveDate=todayIso(); draft.effectiveSequence=nextEffectiveSequence(e.id,draft.effectiveDate); draft.saved=false;
      draft.rateId=''; draft.scheduleId='';
      if(!draft.action) draft.action='Commencement';
      if(!draft.positionClass) draft.positionClass='Permanent';
      if(!draft.hoursByDay) draft.hoursByDay={1:0,2:0,3:0,4:0,5:0,6:0,0:0};
      selectedJobDataDraft=draft; selectedJobDataRowIndex=0; renderJobData();
    });
    $('jobDataMinus').addEventListener('click',()=>removeJobDataRow(row));
    $('jobDataPrev').addEventListener('click',()=>{ if(selectedJobDataRowIndex>0){ selectedJobDataRowIndex--; renderJobData(); } });
    $('jobDataNext').addEventListener('click',()=>{ if(selectedJobDataRowIndex<totalRows-1){ selectedJobDataRowIndex++; renderJobData(); } });
    renderJobDataForm(row);
  }
  function syncJobDataRowFromForm(row, keepReason=false){
    if(!row || !$('jdEffectiveDate')) return row;
    row.effectiveDate=v('jdEffectiveDate') || row.effectiveDate || todayIso();
    row.effectiveSequence=Number(v('jdEffSeq')||0);
    row.action=v('jdAction') || row.action || 'Commencement';
    row.reason=keepReason ? (v('jdReason') || row.reason || '') : (row.reason || '');
    row.positionNumber=v('jdPositionNumber') || row.positionNumber || '';
    const pos=positionByNumber(row.positionNumber);
    if(pos){ row.positionName=pos.positionName||''; row.department=pos.department||''; row.hourlyRate=Number(pos.hourlyRate||0); row.reportsTo=pos.reportsTo||''; row.reportsToName=row.reportsTo?((positionByNumber(row.reportsTo)||{}).positionName||''):''; }
    row.positionClass=v('jdPositionClass') || row.positionClass || 'Permanent';
    row.hoursByDay=getSchedule('jd');
    return row;
  }
  function renderJobDataForm(row){
    if(!row){ h('jobDataForm','<p class="small-note">No Job Data rows yet. Click the plus button to create the first row.</p>'); return; }
    const action=row.action||'Commencement';
    const reasons=(JOB_REASON_OPTIONS[action]||[]).map(r=>`<option ${row.reason===r?'selected':''}>${esc(r)}</option>`).join('');
    h('jobDataForm', `<div class="job-data-box"><div class="grid form-grid"><div><label>Effective Date</label><input id="jdEffectiveDate" type="date" value="${esc(row.effectiveDate||todayIso())}"></div><div><label>Effective Sequence</label><input id="jdEffSeq" type="number" step="1" value="${esc(row.effectiveSequence ?? 0)}"></div><div><label>Action</label><select id="jdAction"><option ${action==='Commencement'?'selected':''}>Commencement</option><option ${action==='Variation'?'selected':''}>Variation</option><option ${action==='Movement'?'selected':''}>Movement</option><option ${action==='Termination'?'selected':''}>Termination</option></select></div><div><label>Reason</label><select id="jdReason"><option value="">Select reason</option>${reasons}</select></div></div><div class="divider"></div><div class="grid form-grid"><div><label>Position Number</label><div class="inline-field"><input id="jdPositionNumber" value="${esc(row.positionNumber||'')}"><button id="jdPositionLookup" type="button" class="icon-btn" title="Search positions">🔍</button></div></div><div><label>Position Name</label><input id="jdPositionName" readonly class="readonly" value="${esc(row.positionName||'')}"></div><div><label>Department</label><input id="jdDepartment" readonly class="readonly" value="${esc(row.department||'')}"></div><div><label>Hourly Rate</label><input id="jdHourlyRate" readonly class="readonly" value="${esc(row.hourlyRate||0)}"></div><div><label>Reports To</label><input id="jdReportsTo" readonly class="readonly" value="${esc(row.reportsTo||'')}"><p id="jdReportsToName" class="small-note">${esc(row.reportsToName||'')}</p></div></div><div class="grid form-grid"><div><label>Position Class</label><select id="jdPositionClass"><option ${row.positionClass==='Permanent'?'selected':''}>Permanent</option><option ${row.positionClass==='Fixed-Term'?'selected':''}>Fixed-Term</option><option ${row.positionClass==='Casual'?'selected':''}>Casual</option></select></div></div><div class="divider"></div><h3>Work Schedule</h3>${scheduleInputs('jd')}<p id="jdWeeklyHours" class="small-note"></p><div class="save-row"><button id="saveJobData">Save</button></div></div>`);
    setScheduleInputs('jd', row.hoursByDay||{}); updateJobDataWeeklyHours();
    $('jdAction').addEventListener('change',()=>{ const draft=syncJobDataRowFromForm(Object.assign({}, row), false); draft.action=v('jdAction'); draft.reason=''; selectedJobDataDraft=draft; renderJobData(); });
    $('jdPositionNumber').addEventListener('change',()=>populateJobDataPosition(v('jdPositionNumber')));
    $('jdPositionLookup').addEventListener('click',openJobDataPositionLookup);
    ['jdMon','jdTue','jdWed','jdThu','jdFri','jdSat','jdSun'].forEach(id=>$(id).addEventListener('input',updateJobDataWeeklyHours));
    $('saveJobData').addEventListener('click',saveJobDataRow);
  }
  function setScheduleInputs(prefix,map){ ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach((d,i)=>{ const key=[1,2,3,4,5,6,0][i]; if($(prefix+d)) setv(prefix+d, Number((map||{})[key]||0)); }); }
  function updateJobDataWeeklyHours(){ if($('jdWeeklyHours')) h('jdWeeklyHours', `Total Weekly Hours: ${weeklyHours(getSchedule('jd')).toFixed(2)}`); }
  function populateJobDataPosition(num){
    const p=positionByNumber(num); if(!p){ setv('jdPositionName',''); setv('jdDepartment',''); setv('jdHourlyRate',''); setv('jdReportsTo',''); h('jdReportsToName',''); return; }
    setv('jdPositionNumber',p.positionNumber); setv('jdPositionName',p.positionName||''); setv('jdDepartment',p.department||''); setv('jdHourlyRate',Number(p.hourlyRate||0)); setv('jdReportsTo',p.reportsTo||''); h('jdReportsToName', p.reportsTo ? esc((positionByNumber(p.reportsTo)||{}).positionName||'Position not found') : '');
  }
  function openJobDataPositionLookup(){
    const rows=(state.positions||[]).filter(p=>p.active!==false).map(p=>[esc(p.positionNumber),esc(p.positionName||''),esc(p.department||''),`<button data-pick-jd-pos="${esc(p.positionNumber)}">Select</button>`]);
    modal('Select Position', rows.length?table(['Position Number','Position Name','Department',''],rows):'<p>No active positions available. Create one in Settings > Positions.</p>', '', true);
    document.querySelectorAll('[data-pick-jd-pos]').forEach(b=>b.addEventListener('click',()=>{ const num=b.dataset.pickJdPos; closeModal(); populateJobDataPosition(num); }));
  }
  function readJobDataForm(){
    const pos=positionByNumber(v('jdPositionNumber'));
    const reportsTo=pos ? (pos.reportsTo||'') : '';
    const existing = selectedJobDataDraft || (jobDataDisplayRows(selectedJobDataEmp)[selectedJobDataRowIndex]||{});
    return { id:(existing&&existing.id)||uid('jobdata'), empId:selectedJobDataEmp, effectiveDate:v('jdEffectiveDate'), effectiveSequence:Number(v('jdEffSeq')||0), action:v('jdAction'), reason:v('jdReason'), positionNumber:v('jdPositionNumber'), positionName:pos?pos.positionName:'', department:pos?pos.department:'', hourlyRate:pos?Number(pos.hourlyRate||0):0, reportsTo, reportsToName:reportsTo?((positionByNumber(reportsTo)||{}).positionName||''):'', positionClass:v('jdPositionClass'), hoursByDay:getSchedule('jd'), saved:true, rateId: existing.rateId || '', scheduleId: existing.scheduleId || '' };
  }
  function saveJobDataRow(){
    const row=readJobDataForm(); const e=emp(row.empId); if(!e) return alert('Select an employee.');
    if(!row.effectiveDate) return alert('Enter an effective date.');
    if(!row.reason) return alert('Select a reason.');
    if(row.action!=='Termination' && !positionByNumber(row.positionNumber)) return alert('Select a valid active position.');
    if(row.action!=='Termination' && weeklyHours(row.hoursByDay)<=0) return alert('Enter a work schedule.');
    const existing=(state.jobDataRows||[]).find(r=>r.id===row.id);
    const appliedRow = existing ? Object.assign(existing,row) : row;
    if(!existing) state.jobDataRows.push(row);
    applyJobDataToEmployee(appliedRow);
    selectedJobDataDraft=null;
    selectedJobDataRowIndex=0;
    save(); calculateAllForCurrent(); log(`Job Data saved for ${E.employeeName(e)}`); renderAll(); toast('Job Data saved');
  }
  function applyJobDataToEmployee(row){
    const e=emp(row.empId); if(!e) return;
    if(!Array.isArray(e.employmentSegments)) e.employmentSegments=[];
    state.payRates = (state.payRates||[]).filter(r=>!(r.empId===e.id && r.jobDataId===row.id && r.id!==row.rateId));
    state.schedules = (state.schedules||[]).filter(r=>!(r.empId===e.id && r.jobDataId===row.id && r.id!==row.scheduleId));
    state.jobEvents = (state.jobEvents||[]).filter(j=>j.refKind!=='jobData' || j.refId!==row.id);
    if(row.action==='Termination'){
      e.terminationDate=row.effectiveDate; e.terminationReason=row.reason;
      let segment=[...e.employmentSegments].reverse().find(seg=>seg.startDate===e.startDate)||[...e.employmentSegments].reverse().find(seg=>!seg.endDate);
      if(!segment && e.startDate){ segment={id:uid('segment'),startDate:e.startDate,endDate:'',inclusiveEnd:false,terminationReason:'',source:'jobData'}; e.employmentSegments.push(segment); }
      if(segment){ segment.endDate=row.effectiveDate; segment.terminationReason=row.reason; segment.inclusiveEnd=row.reason==='Expiry of Fixed Term'; }
      e.status=E.isTerminatedOn(e,todayIso())?'Terminated':'Active';
      addJobEvent(e.id,'Termination',row.effectiveDate,row.reason,'jobData',row.id); return;
    }
    const isRehire=/^Rehire\b/.test(row.reason||'');
    const isNewHire=/^New Hire\b/.test(row.reason||'');
    if(isRehire || isNewHire || !e.startDate){
      if(!e.employmentSegments.some(seg=>seg.startDate===row.effectiveDate)) e.employmentSegments.push({id:uid('segment'),startDate:row.effectiveDate,endDate:'',inclusiveEnd:false,terminationReason:'',source:'jobData'});
      e.startDate=row.effectiveDate;
      if(!e.originalStartDate) e.originalStartDate=row.effectiveDate;
      if(isRehire || !e.lslServiceDate) e.lslServiceDate=row.effectiveDate;
      if(isRehire){ e.lslEntitlementConvertedAt=''; e.lslEntitlementDateOverride=''; e.lslProRataOverride=''; }
      e.status='Active'; e.terminationDate=''; e.terminationReason='';
    }
    e.position=row.positionName; e.department=row.department; e.hourlyRate=Number(row.hourlyRate||0); e.type=row.positionClass==='Fixed-Term'?'Fixed Term':row.positionClass; if(row.positionClass!=='Fixed-Term'){ e.contractEndDate=''; e.autoTerminate=false; }
    const rateId=row.rateId||uid('rate'); row.rateId=rateId;
    const existingRate=(state.payRates||[]).find(r=>r.id===rateId);
    const rateRow={id:rateId,empId:e.id,changeType:'Permanent',effectiveDate:row.effectiveDate,endDate:'',position:row.positionName,hourlyRate:Number(row.hourlyRate||0),jobDataId:row.id};
    if(existingRate) Object.assign(existingRate,rateRow); else state.payRates.push(rateRow);
    const schedId=row.scheduleId||uid('schedule'); row.scheduleId=schedId;
    const existingSched=(state.schedules||[]).find(r=>r.id===schedId);
    const schedRow={id:schedId,empId:e.id,effectiveDate:row.effectiveDate,hoursByDay:row.hoursByDay,jobDataId:row.id};
    if(existingSched) Object.assign(existingSched,schedRow); else state.schedules.push(schedRow);
    addJobEvent(e.id,'Job Data',row.effectiveDate,`${row.action} — ${row.reason} — ${row.positionName} — ${weeklyHours(row.hoursByDay).toFixed(2)} hours/week`,'jobData',row.id);
  }
  function removeJobDataRow(row){
    if(!row) return;
    if(row.saved===false || (selectedJobDataDraft && row.id===selectedJobDataDraft.id && !(state.jobDataRows||[]).some(r=>r.id===row.id))){ selectedJobDataDraft=null; selectedJobDataRowIndex=0; renderJobData(); return; }
    confirmModal('Remove this Job Data row? This may result in pay recalculations.', 'Yes', ()=>{ state.jobDataRows=state.jobDataRows.filter(r=>r.id!==row.id); if(row.rateId) state.payRates=state.payRates.filter(r=>r.id!==row.rateId); if(row.scheduleId) state.schedules=state.schedules.filter(r=>r.id!==row.scheduleId); state.jobEvents=state.jobEvents.filter(j=>j.refId!==row.id); if(selectedJobDataDraft && selectedJobDataDraft.id===row.id) selectedJobDataDraft=null; save(); calculateAllForCurrent(); selectedJobDataRowIndex=0; renderAll(); });
  }

  function renderJobSummary(){
    h('jobSummary', `<h2>Job Summary</h2><p class="small-note">Job Summary is read-only. It lists saved Job Data rows.</p><div class="controls">${showTerminatedControl('jobShowTerminated','jobSummary')}</div><div class="grid form-grid"><div><label>Employee</label><select id="jobEmp">${employeeOptions(employeeList(showTerminatedByTab.jobSummary))}</select></div></div><div id="jobOutput"></div>`);
    bindShowTerminated('jobShowTerminated','jobSummary',renderJobSummary); $('jobEmp').addEventListener('change',renderJobOutput); renderJobOutput();
  }
  function renderJobOutput(){
    const id=v('jobEmp'); if(!id){ h('jobOutput','<p class="small-note">Select an employee.</p>'); return; }
    const rows=(state.jobDataRows||[]).filter(r=>r.empId===id).sort((a,b)=>E.compare(b.effectiveDate,a.effectiveDate)||Number(b.effectiveSequence||0)-Number(a.effectiveSequence||0));
    h('jobOutput', rows.length?table(['Effective Date','Effective Sequence','Action','Reason','Position Name','Weekly Hours'], rows.map(r=>[E.fmtPay(r.effectiveDate),esc(r.effectiveSequence||0),esc(r.action||''),esc(r.reason||''),esc(r.positionName||''),weeklyHours(r.hoursByDay).toFixed(2)])):'<p class="small-note">No Job Data rows saved for this employee.</p>');
  }

  function renderAdditionalEarnings(){
    if(additionalPeriodOffset === undefined) additionalPeriodOffset = 0;
    h('additionalEarnings', `<h2>Additional Earnings</h2><p id="additionalNote" class="small-note"></p><div class="controls">${showTerminatedControl('addShowTerminated','additionalEarnings')}</div><div class="grid form-grid"><div><label>Employee</label><select id="addEmp">${employeeOptions(employeeList(showTerminatedByTab.additionalEarnings))}</select></div><div><label>Pay Period</label><input id="addPeriod" readonly></div></div><div class="controls" style="margin-top:14px"><button id="addPrev" class="secondary">← Previous Pay</button><button id="addNext" class="secondary">Next Pay →</button><button id="addRow">+ Add Row</button></div><div id="addRows"></div><div class="save-row"><button id="saveAdditional">Save</button></div>`);
    bindShowTerminated('addShowTerminated','additionalEarnings',renderAdditionalEarnings); $('addEmp').addEventListener('change',loadAdditionalDraft); $('addPrev').addEventListener('click',()=>moveAdditionalPeriod(-1)); $('addNext').addEventListener('click',()=>moveAdditionalPeriod(1)); $('addRow').addEventListener('click',addAdditionalRow); $('saveAdditional').addEventListener('click',saveAdditional); loadAdditionalDraft();
  }
  function additionalCycle(){ const currentIndex=E.PAY_CYCLES.findIndex(c=>c.id===currentCycle().id); const idx=Math.min(currentIndex+1,Math.max(0,currentIndex+additionalPeriodOffset)); return E.PAY_CYCLES[idx] || currentCycle(); }
  function moveAdditionalPeriod(n){ const currentIndex=E.PAY_CYCLES.findIndex(c=>c.id===currentCycle().id); const nextOffset=additionalPeriodOffset+n; const idx=currentIndex+nextOffset; if(idx<0 || idx>currentIndex+1) return; additionalPeriodOffset=nextOffset; loadAdditionalDraft(); }
  function loadAdditionalDraft(){ const c=additionalCycle(); if($('addPeriod')) setv('addPeriod',E.cycleDisplay(c)); const empId=v('addEmp'); additionalDraftRows=empId?state.additionalEarnings.filter(a=>a.empId===empId&&Number(a.cycleId)===Number(c.id)&&a.saved!==false).map(a=>DataStore.clone(a)):[]; additionalDirty=false; renderAdditionalRows(); }
  function markAdditionalDirty(){ additionalDirty=true; h('additionalNote','Unsaved changes. Additional earnings will not appear on payslips until saved.'); }
  function addAdditionalRow(){ if(!v('addEmp')) return alert('Select an employee first.'); const c=additionalCycle(); additionalDraftRows.push({id:uid('add'),empId:v('addEmp'),cycleId:c.id,earningType:'Additional Day',startDate:c.start,endDate:c.start,hours:0,amount:0,saved:false}); markAdditionalDirty(); renderAdditionalRows(); }
  function additionalDraftAmount(a){
    const c=additionalCycle();
    if(['Overpayment Adjustment','Reimbursement'].includes(a.earningType||'')) return Number(a.amount||0);
    const rate=E.activePayRate(state,v('addEmp')||a.empId,a.startDate||c.start);
    const multiplier=a.earningType==='Overtime 1.5'?1.5:a.earningType==='Overtime 2.0'?2:1;
    return E.round2(Number(a.hours||0)*Number(rate.hourlyRate||0)*multiplier);
  }
  function renderAdditionalRows(){
    if(!$('addRows')) return;
    h('additionalNote', additionalDirty?'Unsaved changes. Additional earnings will not appear on payslips until saved.':'');
    const c=additionalCycle();
    const rows=additionalDraftRows.map((a,i)=>{
      const isOver=a.earningType==='Overpayment Adjustment';
      const isReimbursement=a.earningType==='Reimbursement';
      const isAmountOnly=isOver||isReimbursement;
      const amount=additionalDraftAmount(a);
      return [`<select data-add-field="${i}|earningType"><option ${a.earningType==='Additional Day'?'selected':''}>Additional Day</option><option ${a.earningType==='Overtime 1.5'?'selected':''}>Overtime 1.5</option><option ${a.earningType==='Overtime 2.0'?'selected':''}>Overtime 2.0</option><option ${a.earningType==='Overpayment Adjustment'?'selected':''}>Overpayment Adjustment</option><option ${a.earningType==='Reimbursement'?'selected':''}>Reimbursement</option></select>`,`<input type="date" min="${esc(c.start)}" max="${esc(c.end)}" value="${esc(isOver?c.start:(a.startDate||''))}" ${isOver?'readonly class="readonly"':''} data-add-field="${i}|startDate">`,`<input type="date" min="${esc(c.start)}" max="${esc(c.end)}" value="${esc(isOver?c.end:(a.endDate||''))}" ${isOver?'readonly class="readonly"':''} data-add-field="${i}|endDate">`,`<input type="number" step="0.01" value="${esc(isAmountOnly?0:(a.hours||0))}" ${isAmountOnly?'readonly class="readonly"':''} data-add-field="${i}|hours">`,`<input type="number" step="0.01" value="${esc(amount)}" ${isAmountOnly?'':'readonly class="readonly"'} data-add-field="${i}|amount">`,`<button class="danger" data-del-add="${esc(a.id)}">Delete</button>`];
    });
    h('addRows', table(['Earnings Type','Start Date','End Date','Hours','Amount','Delete'], rows));
    document.querySelectorAll('[data-add-field]').forEach(el=>el.addEventListener('change',()=>{
      const [i,field]=el.dataset.addField.split('|'); const row=additionalDraftRows[Number(i)];
      if(field==='earningType' && el.value==='Overpayment Adjustment' && Number(additionalCycle().id)!==Number(currentCycle().id)){ el.value=row.earningType||'Additional Day'; return alert('Overpayment Adjustment can only be entered in the current open pay period.'); }
      row[field]=(field==='hours'||field==='amount')?Number(el.value||0):el.value;
      if(field==='earningType' && row.earningType==='Overpayment Adjustment'){ row.hours=0; row.startDate=c.start; row.endDate=c.end; row.amount=0; }
      if(field==='earningType' && row.earningType==='Reimbursement'){ row.hours=0; row.startDate=row.startDate||c.start; row.endDate=row.endDate||row.startDate; row.amount=0; }
      if(field==='startDate' && row.earningType!=='Overpayment Adjustment') row.endDate=el.value;
      if(!['Overpayment Adjustment','Reimbursement'].includes(row.earningType)) row.amount=additionalDraftAmount(row);
      markAdditionalDirty(); renderAdditionalRows();
    }));
    document.querySelectorAll('[data-del-add]').forEach(b=>b.addEventListener('click',()=>confirmModal('Are you sure you want to delete this entry? This may result in pay recalculations','Yes',()=>{ additionalDraftRows=additionalDraftRows.filter(a=>a.id!==b.dataset.delAdd); markAdditionalDirty(); renderAdditionalRows(); })));
  }
  function saveAdditional(){
    const empId=v('addEmp'); if(!empId) return alert('Select an employee first.');
    const c=additionalCycle();
    if(additionalDraftRows.some(a=>a.earningType==='Overpayment Adjustment' && Number(c.id)!==Number(currentCycle().id))) return alert('Overpayment Adjustment can only be entered in the current open pay period.');
    for(const a of additionalDraftRows){
      if((a.earningType||'') !== 'Overpayment Adjustment' && (!a.startDate || !a.endDate || E.compare(a.startDate,c.start)<0 || E.compare(a.endDate,c.end)>0 || E.compare(a.startDate,a.endDate)>0)) return alert('Additional earning dates must fall within the selected pay period.');
      if((a.earningType||'') === 'Additional Day' && emp(empId)?.startDate && E.compare(a.startDate, emp(empId).startDate) < 0) return alert("This additional day is before the employee's start date and cannot be paid.");
    }
    loadingModal('Saving Additional Earnings','Save Successful',()=>{
      state.additionalEarnings=state.additionalEarnings.filter(a=>!(a.empId===empId&&Number(a.cycleId)===Number(c.id)));
      additionalDraftRows.forEach(a=>{
        const row=Object.assign({},a,{empId,cycleId:c.id,saved:true});
        if(row.earningType==='Overpayment Adjustment'){ row.hours=0; row.startDate=c.start; row.endDate=c.end; row.amount=Number(row.amount||0); }
        else if(row.earningType==='Reimbursement'){ row.hours=0; row.amount=Number(row.amount||0); }
        else row.amount=additionalDraftAmount(row);
        state.additionalEarnings.push(row);
      });
      additionalDirty=false; save(); calculateAllForCurrent(); renderAll();
    },700);
  }


  function deductionCycleOptions(kind='start', selected=''){
    const curIdx = E.PAY_CYCLES.findIndex(c=>c.id===currentCycle().id);
    const fromIdx = kind==='end' ? Math.max(0,curIdx-1) : curIdx;
    return E.PAY_CYCLES.slice(fromIdx, Math.min(E.PAY_CYCLES.length, curIdx+26)).map(c=>{
      const val = kind === 'end' ? c.end : c.start;
      return `<option value="${esc(val)}" ${selected===val?'selected':''}>${E.cycleDisplay(c)}</option>`;
    }).join('');
  }
  function renderDeductions(){
    h('deductions', `<h2>Deductions</h2><p id="deductionsNote" class="small-note">Use this tab for pre-tax and post-tax super deductions. Deductions can start in the current or a future pay period. Existing deductions can be end-dated in the most recent closed pay period.</p><div class="controls">${showTerminatedControl('dedShowTerminated','deductions')}</div><div class="grid form-grid"><div><label>Employee</label><select id="dedEmp">${employeeOptions(employeeList(showTerminatedByTab.deductions))}</select></div></div><div class="controls" style="margin-top:14px"><button id="addDeductionBtn">Add New Deduction</button></div><div id="deductionsTable"></div><div class="save-row"><button id="saveDeductionsBtn">Save</button></div>`);
    bindShowTerminated('dedShowTerminated','deductions',renderDeductions);
    if(selectedDeductionEmp && employeeList(showTerminatedByTab.deductions).some(e=>e.id===selectedDeductionEmp)) setv('dedEmp',selectedDeductionEmp);
    $('dedEmp').addEventListener('change',()=>{ selectedDeductionEmp=v('dedEmp'); loadDeductionDraft(); });
    $('addDeductionBtn').addEventListener('click',openDeductionModal);
    $('saveDeductionsBtn').addEventListener('click',()=>saveDeductions());
    if(v('dedEmp')){ selectedDeductionEmp=v('dedEmp'); if(deductionDraftLoadedFor!==selectedDeductionEmp) loadDeductionDraft(); else renderDeductionsTable(); }
    else { deductionDraftRows=[]; deductionDraftLoadedFor=''; deductionDirty=false; renderDeductionsTable(); }
  }
  function loadDeductionDraft(){
    const empId=v('dedEmp');
    selectedDeductionEmp=empId;
    deductionDraftLoadedFor=empId;
    deductionDraftRows=empId?(state.deductions||[]).filter(d=>d.empId===empId).map(d=>DataStore.clone(d)):[];
    deductionDirty=false;
    renderDeductionsTable();
  }
  function markDeductionDirty(){
    deductionDirty=true;
    h('deductionsNote','Unsaved changes. Deduction changes will not update Job Summary, payroll calculations or payslips until Save is pressed.');
  }
  function openDeductionModal(){
    const empId=selectedDeductionEmp || v('dedEmp'); if(!empId) return alert('Select an employee first.');
    const c=currentCycle();
    modal('Add New Deduction', `<div class="grid form-grid"><div class="full-line"><label>Effective Date</label><select id="dedStart">${deductionCycleOptions('start', c.start)}</select></div><div class="full-line"><label>End Date</label><select id="dedEnd"><option value="">Leave blank — deduction continues each pay until an end date is added</option>${deductionCycleOptions('end','')}</select><p class="small-note">End date can be left blank to keep deduction continuous.</p></div><div class="full-line"><label>Deduction Type</label><select id="dedType"><option>Pre-tax Super Deduction</option><option>Post-Tax Super Deduction</option></select></div><div><label>Amount</label><input id="dedAmount" type="number" step="0.01" min="0"></div><div><label>Percentage</label><input id="dedPercentage" type="number" step="0.01" min="0"></div></div>`, `<button id="stageDeduction">Add to Table</button>`, true);
    const sync=()=>{ const hasAmt=String(v('dedAmount')).trim()!==''; const hasPct=String(v('dedPercentage')).trim()!==''; $('dedPercentage').disabled=hasAmt; $('dedAmount').disabled=hasPct; };
    $('dedAmount').addEventListener('input',sync); $('dedPercentage').addEventListener('input',sync); sync();
    $('stageDeduction').addEventListener('click',stageDeduction);
  }
  function stageDeduction(){
    const empId=selectedDeductionEmp || v('dedEmp'); const start=v('dedStart'); const end=v('dedEnd'); const amount=v('dedAmount'); const percentage=v('dedPercentage');
    if(!empId) return alert('Select an employee first.');
    if(!start) return alert('Select an effective date.');
    if(amount && percentage) return alert('Enter an Amount OR Percentage, not both.');
    if(!amount && !percentage) return alert('Enter either an Amount or Percentage.');
    const selectedStartCycle=E.PAY_CYCLES.find(c=>c.start===start);
    const selectedEndCycle=end ? E.PAY_CYCLES.find(c=>c.end===end) : null;
    if(!selectedStartCycle || selectedStartCycle.id < currentCycle().id) return alert('Effective Date must be the first day of the current or a future pay period.');
    if(end && (!selectedEndCycle || selectedEndCycle.id < currentCycle().id || E.compare(end,start)<0)) return alert('End Date must be the last day of the current or a future pay period and cannot be before the effective date.');
    deductionDraftRows.push({ id:uid('ded'), empId, startDate:start, endDate:end, deductionType:v('dedType'), amount:amount===''?'':Number(amount||0), percentage:percentage===''?'':Number(percentage||0), saved:false, deleted:false });
    closeModal(); markDeductionDirty(); renderDeductionsTable();
  }
  function deductionCanEditEnd(d){ return !d.endDate || E.compare(d.endDate,currentCycle().start)>=0; }
  function deductionCanDelete(d){
    if(d.saved===false) return true;
    const startCycle=E.PAY_CYCLES.find(c=>c.start===d.startDate);
    return !E.isFinalised(state,currentCycle()) && !!startCycle && Number(startCycle.id)===Number(currentCycle().id);
  }
  function renderDeductionsTable(){
    const empId=selectedDeductionEmp || v('dedEmp'); if(!$('deductionsTable')) return; if(!empId){ h('deductionsTable','<p class="small-note">Select an employee.</p>'); h('deductionsNote','Use this tab for pre-tax and post-tax super deductions. Deductions can start in the current or a future pay period. Existing deductions can be end-dated in the most recent closed pay period.'); return; }
    h('deductionsNote', deductionDirty?'Unsaved changes. Deduction changes will not update Job Summary, payroll calculations or payslips until Save is pressed.':'Use this tab for pre-tax and post-tax super deductions. Deductions can start in the current or a future pay period. Existing deductions can be end-dated in the most recent closed pay period.');
    const rows=(deductionDraftRows||[]).filter(d=>d.empId===empId && d.deleted!==true).sort((a,b)=>E.compare(a.startDate,b.startDate)).map(d=>{
      const endCell=deductionCanEditEnd(d)?`<select data-ded-end="${esc(d.id)}"><option value="" ${!d.endDate?'selected':''}></option>${deductionCycleOptions('end',d.endDate||'')}</select>`:E.fmtPay(d.endDate);
      const amountCell=d.amount!==''&&d.amount!=null?E.money(d.amount):'<span class="muted">—</span>';
      const percentageCell=d.percentage!==''&&d.percentage!=null?`${Number(d.percentage).toFixed(2)}%`:'<span class="muted">—</span>';
      return [esc(d.deductionType),E.fmtPay(d.startDate),endCell,amountCell,percentageCell,deductionCanDelete(d)?`<button class="danger" data-del-ded="${esc(d.id)}">Delete</button>`:'<span class="muted">End-date only</span>'];
    });
    h('deductionsTable', rows.length?table(['Deduction Type','Start Date','End Date','Amount','Percentage','Delete'],rows):'<p class="small-note">No deductions recorded for this employee.</p>');
    document.querySelectorAll('[data-ded-end]').forEach(el=>el.addEventListener('change',()=>stageDeductionEnd(el.dataset.dedEnd,el.value)));
    document.querySelectorAll('[data-del-ded]').forEach(b=>b.addEventListener('click',()=>confirmModal('Are you sure you want to delete this deduction?','Yes',()=>stageDeleteDeduction(b.dataset.delDed))));
  }
  function stageDeductionEnd(id,endDate){
    const d=(deductionDraftRows||[]).find(x=>x.id===id); if(!d) return;
    if(endDate){ const c=E.PAY_CYCLES.find(x=>x.end===endDate); const minimumId=d.saved===false?currentCycle().id:Math.max(1,currentCycle().id-1); if(!c || c.id<minimumId || E.compare(endDate,d.startDate)<0){ renderDeductionsTable(); return alert('End Date must be the last day of the most recent closed, current or a future pay period and cannot be before the effective date.'); } }
    d.endDate=endDate||''; markDeductionDirty(); renderDeductionsTable();
  }
  function stageDeleteDeduction(id){
    const d=(deductionDraftRows||[]).find(x=>x.id===id); if(!d) return;
    if(d.saved===false){ deductionDraftRows=deductionDraftRows.filter(x=>x.id!==id); }
    else d.deleted=true;
    markDeductionDirty(); renderDeductionsTable();
  }
  function saveDeductions(afterSave){
    const empId=selectedDeductionEmp || v('dedEmp'); if(!empId) return alert('Select an employee first.');
    for(const d of deductionDraftRows.filter(x=>x.empId===empId && x.deleted!==true)){
      if(!d.startDate) return alert('Every deduction must have a Start Date.');
      const startCycle=E.PAY_CYCLES.find(c=>c.start===d.startDate);
      if(!startCycle || startCycle.id < currentCycle().id && d.saved===false) return alert('Effective Date must be the first day of the current or a future pay period.');
      if(d.endDate){ const endCycle=E.PAY_CYCLES.find(c=>c.end===d.endDate); const minimumId=d.saved===false?currentCycle().id:Math.max(1,currentCycle().id-1); if(!endCycle || endCycle.id<minimumId || E.compare(d.endDate,d.startDate)<0) return alert('End Date must be the last day of the most recent closed, current or a future pay period and cannot be before the effective date.'); }
      if((d.amount===''||d.amount==null) && (d.percentage===''||d.percentage==null)) return alert('Each deduction must have either an Amount or Percentage.');
      if(String(d.amount)!=='' && d.amount!=null && String(d.percentage)!=='' && d.percentage!=null) return alert('Each deduction can have Amount OR Percentage, not both.');
    }
    const activeRows=deductionDraftRows.filter(d=>d.empId===empId&&d.deleted!==true);
    for(let i=0;i<activeRows.length;i++){
      for(let j=i+1;j<activeRows.length;j++){
        const a=activeRows[i], b=activeRows[j];
        if(a.deductionType!==b.deductionType) continue;
        const aEnd=a.endDate||'9999-12-31', bEnd=b.endDate||'9999-12-31';
        if(E.compare(a.startDate,bEnd)<=0&&E.compare(b.startDate,aEnd)<=0) return alert(`Overlapping ${a.deductionType} records are not allowed. End-date the existing deduction before starting the replacement deduction.`);
      }
    }
    loadingModal('Saving Deductions','Save Successful',()=>{
      const before=(state.deductions||[]).filter(d=>d.empId===empId).map(d=>DataStore.clone(d));
      const beforeById=new Map(before.map(d=>[d.id,d]));
      const other=(state.deductions||[]).filter(d=>d.empId!==empId);
      const savedRows=deductionDraftRows.filter(d=>d.empId===empId).map(d=>Object.assign({},d,{saved:true}));
      state.deductions=other.concat(savedRows);
      savedRows.forEach(d=>{
        const old=beforeById.get(d.id);
        if(!old && d.deleted!==true) addJobEvent(empId,'Deduction',d.startDate,`${d.deductionType} added${d.endDate?` until ${E.fmtPay(d.endDate)}`:' with no end date'}`,'deduction',d.id);
        else if(old && old.deleted!==true && d.deleted===true) addJobEvent(empId,'Deduction',todayIso(),`${d.deductionType} deleted`,'deduction',d.id);
        else if(old && (old.endDate||'') !== (d.endDate||'')) addJobEvent(empId,'Deduction',todayIso(),`${d.deductionType} end date updated to ${d.endDate?E.fmtPay(d.endDate):'blank/continuous'}`,'deduction',d.id);
      });
      deductionDirty=false; deductionDraftLoadedFor=''; save(); calculateAllForCurrent(); log(`Deductions saved for ${E.employeeName(emp(empId))}`); renderAll(); if(typeof afterSave==='function') afterSave();
    },700);
  }

  function taxRecordsForEmp(empId){ return (state.taxDetails||[]).filter(t=>t.empId===empId).sort((a,b)=>E.compare(b.effectiveDate,a.effectiveDate)); }
  function currentTaxRecord(empId){
    const rows=taxRecordsForEmp(empId);
    return rows.filter(t=>E.compare(t.effectiveDate,currentCycle().end)<=0).sort((a,b)=>E.compare(b.effectiveDate,a.effectiveDate))[0] || rows[0] || null;
  }
  function defaultTaxRecord(empId, future=false){
    const e=emp(empId)||{};
    const previous = currentTaxRecord(empId) || taxRecordsForEmp(empId)[0] || {};
    return { id:future?`new_${Date.now()}`:'new_initial', empId, effectiveDate:future?E.addDays(currentCycle().end,1):(e.startDate||currentCycle().start), taxFileNumber:future?(previous.taxFileNumber||''):'', claimTaxFreeThreshold:previous.claimTaxFreeThreshold===undefined?true:previous.claimTaxFreeThreshold, stsl:previous.stsl===undefined?false:previous.stsl };
  }
  function renderTaxDetails(){
    h('taxDetails', `<h2>Tax Details</h2><p class="small-note">Tax details are effective-dated. TFNs are masked by default and only reveal while the eye button is held.</p><div class="controls">${showTerminatedControl('taxShowTerminated','taxDetails')}</div><div class="grid form-grid"><div><label>Employee</label><select id="taxEmp">${employeeOptions(employeeList(showTerminatedByTab.taxDetails))}</select></div></div><div id="taxDetailsBody"></div>`);
    bindShowTerminated('taxShowTerminated','taxDetails',renderTaxDetails); $('taxEmp').addEventListener('change',()=>{ selectedTaxRecordId=''; taxDirty=false; renderTaxDetailsBody(); });
    renderTaxDetailsBody();
  }
  function taxRecordLabel(rec,current){
    const timing = E.compare(rec.effectiveDate,currentCycle().end)>0 ? 'Future' : (current && rec.id===current.id ? 'Current' : 'Past');
    return `${timing}: ${E.fmtPay(rec.effectiveDate)}`;
  }
  function renderTaxDetailsBody(){
    const empId=v('taxEmp'); if(!empId){ h('taxDetailsBody','<p class="small-note">Select an employee.</p>'); return; }
    const records=taxRecordsForEmp(empId); const current=currentTaxRecord(empId);
    if(!selectedTaxRecordId) selectedTaxRecordId=current?current.id:'new_initial';
    let rec = selectedTaxRecordId.startsWith('new_') ? defaultTaxRecord(empId, selectedTaxRecordId!=='new_initial') : records.find(t=>t.id===selectedTaxRecordId);
    if(!rec) rec=current||defaultTaxRecord(empId,false);
    const ordered=[]; if(current) ordered.push(current); records.forEach(r=>{ if(!ordered.some(x=>x.id===r.id)) ordered.push(r); });
    const list = ordered.length ? `<div class="tax-record-list">${ordered.map(r=>`<button type="button" data-tax-record="${esc(r.id)}" class="${r.id===rec.id?'active':''}">${esc(taxRecordLabel(r,current))}</button>`).join('')}</div>` : '<p class="small-note">No saved tax records yet. The first record will default to the employee start date.</p>';
    h('taxDetailsBody', `${list}<div class="controls"><button id="addTaxRecord">+ Add Future Tax Details</button></div><div class="grid form-grid"><div><label>Effective Date</label><input id="taxEffective" type="date" value="${esc(rec.effectiveDate||'')}"></div><div><label>Tax File Number</label><div class="controls"><input id="taxFileNumber" type="password" value="${esc(rec.taxFileNumber||'')}"><button type="button" id="revealTfn" class="icon-btn" title="Hold to reveal TFN">👁️</button></div></div><div><label>Claim Tax Free Threshold</label><select id="taxThreshold"><option value="true" ${rec.claimTaxFreeThreshold!==false?'selected':''}>Yes</option><option value="false" ${rec.claimTaxFreeThreshold===false?'selected':''}>No</option></select></div><div><label>STSL</label><select id="taxStsl"><option value="false" ${rec.stsl!==true?'selected':''}>No</option><option value="true" ${rec.stsl===true?'selected':''}>Yes</option></select></div></div><div class="save-row"><button id="saveTaxDetails">Save</button></div><p id="taxUnsaved" class="small-note">${taxDirty?'Unsaved changes. Changes will be discarded if you leave without saving.':''}</p>`);
    document.querySelectorAll('[data-tax-record]').forEach(b=>b.addEventListener('click',()=>{ if(taxDirty) return confirmModal('Are you sure you want to exit without saving?', 'Yes', ()=>{ taxDirty=false; selectedTaxRecordId=b.dataset.taxRecord; renderTaxDetailsBody(); }, 'No'); selectedTaxRecordId=b.dataset.taxRecord; renderTaxDetailsBody(); }));
    $('addTaxRecord').addEventListener('click',()=>{ selectedTaxRecordId=`new_${Date.now()}`; taxDirty=true; renderTaxDetailsBody(); });
    ['taxEffective','taxFileNumber','taxThreshold','taxStsl'].forEach(id=>$(id).addEventListener('change',()=>{ taxDirty=true; h('taxUnsaved','Unsaved changes. Changes will be discarded if you leave without saving.'); }));
    const tfn=$('taxFileNumber'); const eye=$('revealTfn');
    const show=()=>{tfn.type='text';}; const hide=()=>{tfn.type='password';};
    ['mousedown','touchstart'].forEach(evt=>eye.addEventListener(evt,show)); ['mouseup','mouseleave','touchend','touchcancel'].forEach(evt=>eye.addEventListener(evt,hide));
    $('saveTaxDetails').addEventListener('click',saveTaxDetails);
  }
  function saveTaxDetails(){
    const empId=v('taxEmp'); if(!empId) return alert('Select an employee first.');
    if(!v('taxEffective')) return alert('Enter an effective date.');
    const record={ id:selectedTaxRecordId && !selectedTaxRecordId.startsWith('new_') ? selectedTaxRecordId : uid('tax'), empId, effectiveDate:v('taxEffective'), taxFileNumber:v('taxFileNumber'), claimTaxFreeThreshold:v('taxThreshold')==='true', stsl:v('taxStsl')==='true' };
    state.taxDetails = (state.taxDetails||[]).filter(t=>t.id!==record.id);
    state.taxDetails.push(record);
    selectedTaxRecordId=record.id; taxDirty=false;
    addJobEvent(empId,'Tax Details',record.effectiveDate,'Tax details updated','tax',record.id);
    save(); calculateAllForCurrent(); toast('Save Successful'); renderAll();
  }

  function renderLeave(){
    const base=new Date(E.parseDate(currentCycle().start).getFullYear(),E.parseDate(currentCycle().start).getMonth()+leaveMonthOffset,1); const monthStart=E.iso(new Date(base.getFullYear(),base.getMonth(),1)); const monthEnd=E.iso(new Date(base.getFullYear(),base.getMonth()+1,0));
    const list=state.leaveBookings.filter(l=>(!leaveFilterEmp||l.empId===leaveFilterEmp)&&E.compare(l.startDate,monthEnd)<=0&&E.compare(l.endDate,monthStart)>=0).sort((a,b)=>E.compare(a.startDate,b.startDate));
    h('leave', `<h2>Leave</h2><div class="leave-action-row"><div class="controls"><button id="bookLeaveBtn">Book Leave</button><button id="absenceCalendarBtn" class="purple">Absence Calendar</button><button id="cashOutLeaveBtn" class="success">Cash Out Leave</button></div><div class="controls right-controls"><button id="filterLeaveBtn" class="teal">Filter</button></div></div><br><br><div class="controls"><button id="prevMonth" class="secondary">Previous Month</button><strong>${base.toLocaleDateString('en-AU',{month:'long',year:'numeric'})}</strong><button id="nextMonth" class="secondary">Next Month</button>${leaveFilterEmp?`<span class="badge badge-info">Filtered: ${esc(E.employeeName(emp(leaveFilterEmp)))}</span>`:''}</div><div id="leaveList"></div>`);
    h('leaveList', table(['Employee','Type','Start','End','Hours','Status','Action'], list.map(l=>[esc(E.employeeName(emp(l.empId)||{})),esc(l.type==='LWOP'?'Leave Without Pay':l.type),E.fmtPay(l.startDate),E.fmtPay(l.endDate),Number(l.hours||0).toFixed(2),badge(l.status||'Approved'),`<button class="danger" data-del-leave="${esc(l.id)}">Delete</button>`])));
    $('bookLeaveBtn').addEventListener('click',openLeaveModal); $('absenceCalendarBtn').addEventListener('click',openCalendarSelect); $('cashOutLeaveBtn').addEventListener('click',openCashOutLeave); $('filterLeaveBtn').addEventListener('click',openLeaveFilter); $('prevMonth').addEventListener('click',()=>{leaveMonthOffset--;renderLeave();}); $('nextMonth').addEventListener('click',()=>{leaveMonthOffset++;renderLeave();}); document.querySelectorAll('[data-del-leave]').forEach(b=>b.addEventListener('click',()=>confirmModal('Are you sure you want to delete this leave entry','Yes',()=>deleteLeaveEntry(b.dataset.delLeave))));
  }
  function openLeaveModal(){
    modal('Book Leave', `<div class="leave-booking-form"><div class="full-line">${showTerminatedControl('leaveBookShowTerminated','leave')}</div><div class="full-line"><label>Employee</label><select id="leaveEmp">${employeeOptions(employeeList(showTerminatedByTab.leave))}</select></div><div class="full-line"><label>Leave Type</label><select id="leaveType"><option>Annual Leave</option><option>Personal Leave</option><option>Long Service Leave</option><option>Bereavement Leave</option><option>Family and Domestic Violence Leave</option><option value="LWOP">Leave Without Pay</option></select><p id="leaveBalanceNote" class="small-note"></p></div><div class="form-spacer"></div><div class="grid form-grid"><div><label>Start Date</label><input id="leaveStart" type="date"></div><div><label>End Date</label><input id="leaveEnd" type="date"></div></div><div class="full-line"><label>Absence Duration (Hours)</label><input id="leaveDuration" type="number" step="0.01" readonly value="0.00"></div><div id="personalEvidenceRow" class="full-line" style="display:none"><label><input id="leaveEvidenceProvided" type="checkbox"> Evidence Provided?</label></div><p id="fdvPrivacyNote" class="small-note" style="display:none">This is a confidential leave type. The balance is shown here only for authorised booking purposes and will not appear on the payslip or Absence Balance.</p></div><p id="leaveDurationNote" class="small-note">Only scheduled work days deduct leave credits. Public holidays and non-rostered days count as 0 hours.</p>`, `<button id="saveLeave">Book Leave</button>`, true);
    ['leaveEmp','leaveType','leaveStart','leaveEnd'].forEach(id=>$(id).addEventListener('change',updateLeaveDuration));
    $('leaveDuration').addEventListener('input',()=>updateLeaveDuration(false));
    $('leaveStart').addEventListener('change',()=>{ setv('leaveEnd',v('leaveStart')); updateLeaveDuration(); });
    bindShowTerminated('leaveBookShowTerminated','leave',openLeaveModal); $('saveLeave').addEventListener('click',saveLeave);
    updateLeaveDuration();
  }
  function updateLeaveDuration(resetValue=true){
    if(!$('leaveDuration')) return;
    const evidence=!!($('leaveEvidenceProvided')&&$('leaveEvidenceProvided').checked);
    const basic=E.validateLeaveBooking(state,v('leaveEmp'),v('leaveType'),v('leaveStart'),v('leaveEnd'),undefined,undefined,{evidenceProvided:evidence});
    const duration=$('leaveDuration');
    const single=v('leaveStart') && v('leaveStart')===v('leaveEnd');
    const editable=single && ['Annual Leave','Personal Leave','LWOP','Family and Domestic Violence Leave'].includes(v('leaveType')) && basic.partialAllowed;
    duration.readOnly=!editable;
    duration.disabled=!editable && v('leaveType')==='Long Service Leave';
    duration.max=basic.maxHours || '';
    if(resetValue) setv('leaveDuration', basic.hours ? Number(basic.hours).toFixed(2) : '0.00');
    if($('personalEvidenceRow')) $('personalEvidenceRow').style.display=v('leaveType')==='Personal Leave'?'block':'none';
    if($('fdvPrivacyNote')) $('fdvPrivacyNote').style.display=v('leaveType')==='Family and Domestic Violence Leave'?'block':'none';
    if($('leaveBalanceNote')){
      const le=emp(v('leaveEmp')); const lt=v('leaveType');
      if(le && ['Annual Leave','Personal Leave','Long Service Leave'].includes(lt)){
        const bal=E.projectedBalances(state,le,currentCycle(),false);
        const label=lt==='Annual Leave'?'Annual Leave Balance (Hours)':lt==='Personal Leave'?'Personal Leave Balance (Hours)':'LSL Accrued Balance (Hours)';
        const val=lt==='Annual Leave'?bal.annual:lt==='Personal Leave'?bal.personal:bal.lslAccrued;
        h('leaveBalanceNote', `${label}: ${Number(val||0).toFixed(2)}`);
      }else if(le && lt==='Family and Domestic Violence Leave'){
        h('leaveBalanceNote', `Available balance remaining: ${Number(E.fdvRemainingDays(state,le,v('leaveStart')||currentCycle().start)||0).toFixed(2)} days`);
      }else h('leaveBalanceNote','');
    }
    if($('leaveDurationNote')){
      if(editable) h('leaveDurationNote', `Partial-day leave is available. Maximum for this date is ${Number(basic.maxHours||0).toFixed(2)} hours.`);
      else h('leaveDurationNote', 'Absence Duration is automatically calculated. It is greyed out for Long Service Leave or date ranges longer than one day.');
    }
  }
  function saveLeave(){
    const requested = $('leaveDuration') && !$('leaveDuration').readOnly ? Number(v('leaveDuration')||0) : undefined;
    const evidenceProvided=!!($('leaveEvidenceProvided')&&$('leaveEvidenceProvided').checked);
    const result=E.validateLeaveBooking(state,v('leaveEmp'),v('leaveType'),v('leaveStart'),v('leaveEnd'),requested,undefined,{evidenceProvided});
    if(!result.ok) return alert(result.message);
    state.leaveBookings.push({ id:uid('leave'), empId:v('leaveEmp'), type:v('leaveType'), startDate:v('leaveStart'), endDate:v('leaveEnd'), hours:result.hours, requestedHours:requested, workingDays:result.workingDays, evidenceProvided, confidential:v('leaveType')==='Family and Domestic Violence Leave', status:'Approved' });
    save(); closeModal(); calculateAllForCurrent(); log(`${v('leaveType')==='LWOP'?'Leave Without Pay':v('leaveType')} booked`); renderAll();
  }
  function openLeaveFilter(){ modal('Filter Leave', `${showTerminatedControl('leaveFilterShowTerminated','leave')}<label>Employee</label><select id="filterEmp">${employeeOptions(employeeList(showTerminatedByTab.leave))}</select>`, `<button id="applyFilter" class="teal">Apply Filter</button><button id="clearFilter" class="secondary">Clear Filter</button>`, true); bindShowTerminated('leaveFilterShowTerminated','leave',openLeaveFilter); $('applyFilter').addEventListener('click',()=>{ leaveFilterEmp=v('filterEmp'); closeModal(); renderLeave(); }); $('clearFilter').addEventListener('click',()=>{ leaveFilterEmp=''; closeModal(); renderLeave(); }); }
  function openCalendarSelect(){ modal('Select Employee', `${showTerminatedControl('calendarShowTerminated','leave')}<label>Employee</label><select id="calendarEmp">${employeeOptions(employeeList(showTerminatedByTab.leave))}</select>`, `<button id="openCalendar">Open Calendar</button>`, true); bindShowTerminated('calendarShowTerminated','leave',openCalendarSelect); $('openCalendar').addEventListener('click',()=>{ selectedCalendarEmp=v('calendarEmp'); selectedCalendarYear=E.parseDate(currentCycle().start).getFullYear(); if(!selectedCalendarEmp) return alert('Select an employee.'); closeModal(); openAbsenceCalendar(); }); }
  function openAbsenceCalendar(){
    const e=emp(selectedCalendarEmp); if(!e) return;
    const defaultYear=E.parseDate(currentCycle().start).getFullYear();
    const maxYear=defaultYear + 1;
    selectedCalendarYear = selectedCalendarYear || defaultYear;
    if(selectedCalendarYear < defaultYear) selectedCalendarYear = defaultYear;
    if(selectedCalendarYear > maxYear) selectedCalendarYear = maxYear;
    const year=selectedCalendarYear;
    let body=`<p><strong>${esc(E.employeeName(e))}</strong></p><div class="controls"><button id="prevCalendarYear" class="secondary" ${year<=defaultYear?'disabled':''}>Previous Year</button><strong>${year}</strong><button id="nextCalendarYear" class="secondary" ${year>=maxYear?'disabled':''}>Next Year</button><span class="small-note">Calendar defaults to the current year and can be viewed up to one year ahead.</span></div><div class="legend"><span class="annual">Annual Leave</span><span class="personal">Personal Leave</span><span class="lsl">Long Service Leave</span><span class="lwop">Leave Without Pay</span><span class="otherleave">Other Leave</span><span class="publicholiday">Public Holiday</span><span class="nonrostered">Non Rostered Day</span></div><div class="calendar">`;
    for(let m=0;m<12;m++){
      const first=new Date(year,m,1); const last=new Date(year,m+1,0);
      body+=`<div class="month"><h4>${first.toLocaleDateString('en-AU',{month:'long'})}</h4><div class="month-grid">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<div class="cal-head">${d}</div>`).join('')}`;
      for(let i=0;i<first.getDay();i++) body+='<div class="cal-day blank"></div>';
      for(let day=1;day<=last.getDate();day++){
        const d=E.iso(new Date(year,m,day));
        const employed=E.isEmployedOn(e,d);
        const sched=employed?E.activeSchedule(state,e.id,d):null;
        const hrs=employed?Number((sched&&sched.hoursByDay&&sched.hoursByDay[E.parseDate(d).getDay()])||0):0;
        const leave=employed?state.leaveBookings.find(l=>l.empId===e.id&&E.between(d,l.startDate,l.endDate)):null;
        const isPH=E.isPublicHoliday(d);
        let cls=hrs<=0?'nonrostered':''; let title=hrs<=0?'Non Rostered Day':'';
        if(leave && hrs>0 && !isPH){ cls=leave.type==='Annual Leave'?'annual':leave.type==='Personal Leave'?'personal':leave.type==='Long Service Leave'?'lsl':leave.type==='LWOP'?'lwop':'otherleave'; title=leave.type==='Family and Domestic Violence Leave'?'Private Leave':leave.type==='LWOP'?'Leave Without Pay':(['Annual Leave','Personal Leave','Long Service Leave'].includes(leave.type)?leave.type:'Other Leave'); }
        if(isPH){ cls='publicholiday'; title=E.publicHolidayName(d)+(leave?` — ${leave.type} booking excluded from leave credits`:'' ); }
        body+=`<div class="cal-day ${cls}" title="${esc(title)}"><strong>${day}</strong></div>`;
      }
      body+='</div></div>';
    }
    body+='</div>'; modal('Absence Calendar', body, '', false);
    const prev=$('prevCalendarYear'); const next=$('nextCalendarYear');
    if(prev) prev.addEventListener('click',()=>{ selectedCalendarYear=Math.max(defaultYear, selectedCalendarYear-1); openAbsenceCalendar(); });
    if(next) next.addEventListener('click',()=>{ selectedCalendarYear=Math.min(maxYear, selectedCalendarYear+1); openAbsenceCalendar(); });
  }


  function leaveOverlapsFinalisedCycle(l){
    return E.PAY_CYCLES.some(c=>E.isFinalised(state,c) && E.compare(l.startDate,c.end)<=0 && E.compare(l.endDate,c.start)>=0);
  }
  function deleteLeaveEntry(id){
    const l=(state.leaveBookings||[]).find(x=>String(x.id)===String(id));
    if(!l) return;
    const finalised=leaveOverlapsFinalisedCycle(l);
    if(finalised){
      const e=emp(l.empId);
      if(e && l.type==='Annual Leave') e.annualLeaveBalance=E.round4(Number(e.annualLeaveBalance||0)+Number(l.hours||0));
      if(e && l.type==='Personal Leave') e.personalLeaveBalance=E.round4(Number(e.personalLeaveBalance||0)+Number(l.hours||0));
      if(e && l.type==='Long Service Leave') e.lslAccruedBalance=E.round4(Number(e.lslAccruedBalance||0)+Number(l.hours||0));
    }
    state.leaveBookings=state.leaveBookings.filter(x=>String(x.id)!==String(id));
    save(); calculateAllForCurrent(); log(finalised?'Finalised-period leave deleted. Credits returned and retro will be calculated.':'Leave entry deleted. Recalculation applied.'); renderAll();
  }
  function openCashOutLeave(){
    const c=currentCycle();
    modal('Cash Out Leave', `<div class="grid form-grid"><div><label>Employee</label><select id="cashEmp">${employeeOptions(employeeList(showTerminatedByTab.leave))}</select></div><div style="align-self:end">${showTerminatedControl('cashShowTerminated','leave')}</div><div><label>Effective Date</label><input id="cashEffective" readonly class="readonly" value="${esc(c.start)}"></div><div><label>Leave Type</label><select id="cashLeaveType"><option>Annual Leave</option><option>Long Service Leave</option></select></div><div><label>Leave Balance</label><input id="cashBalance" readonly class="readonly" value="0.00"></div><div><label>Hours to Cash Out</label><input id="cashHours" type="number" step="0.01" min="0"></div></div><div class="controls" style="margin-top:12px"><button id="previousCashOut" class="secondary">Previous Requests</button></div>`, `<button id="processCashOut">Process Cash Out</button>`, true);
    bindShowTerminated('cashShowTerminated','leave',openCashOutLeave);
    ['cashEmp','cashLeaveType'].forEach(id=>$(id).addEventListener('change',updateCashOutBalance));
    $('previousCashOut').addEventListener('click',openPreviousCashOutRequests);
    $('processCashOut').addEventListener('click',processCashOut);
    updateCashOutBalance();
  }
  function updateCashOutBalance(){
    if(!$('cashBalance')) return;
    const e=emp(v('cashEmp'));
    if(!e){ setv('cashBalance','0.00'); return; }
    const b=E.projectedBalances(state,e,currentCycle(),false);
    const bal=v('cashLeaveType')==='Long Service Leave'?b.lslAccrued:b.annual;
    setv('cashBalance',Number(bal||0).toFixed(2));
    $('cashHours').max=Number(bal||0).toFixed(2);
  }
  function processCashOut(){
    const e=emp(v('cashEmp')); if(!e) return alert('Select an employee.');
    const hours=Number(v('cashHours')||0); const balance=Number(v('cashBalance')||0);
    if(hours<=0) return alert('Enter hours to cash out.');
    if(hours>balance+0.0001) return alert('Hours to Cash Out cannot exceed the leave balance.');
    const c=currentCycle();
    state.cashOutRequests.push({id:uid('cash'),empId:e.id,cycleId:c.id,effectiveDate:c.start,leaveType:v('cashLeaveType'),hours,saved:true,deleted:false});
    save(); closeModal(); calculateAllForCurrent(); log(`${v('cashLeaveType')} cash out processed for ${E.employeeName(e)}`); renderAll();
  }
  function openPreviousCashOutRequests(){
    const empId=v('cashEmp'); const e=emp(empId); if(!e) return alert('Select an employee first.');
    const rows=(state.cashOutRequests||[]).filter(x=>x.empId===empId && !x.deleted).sort((a,b)=>E.compare(b.effectiveDate,a.effectiveDate));
    const body=rows.length?table(['Pay','Effective Date','Leave Type','Hours','Action'],rows.map(r=>[E.ppeLabel(E.cycleById(r.cycleId)),E.fmtPay(r.effectiveDate),esc(r.leaveType),Number(r.hours||0).toFixed(2),`<button class="danger" data-del-cash="${esc(r.id)}">Delete</button>`])):'<p class="small-note">No previous cash out requests.</p>';
    modal(`Previous Cash Out Requests - ${E.employeeName(e)}`, body, `<button type="button" data-close-modal class="secondary">Close</button>`, false);
    document.querySelectorAll('[data-del-cash]').forEach(b=>b.addEventListener('click',()=>confirmModal('Are you sure?', 'Yes', ()=>deleteCashOutRequest(b.dataset.delCash))));
  }
  function deleteCashOutRequest(id){
    const r=(state.cashOutRequests||[]).find(x=>String(x.id)===String(id)); if(!r) return;
    const c=E.cycleById(r.cycleId); const e=emp(r.empId); const finalised=E.isFinalised(state,c);
    if(finalised){
      r.deleted=true; r.deletedAtCycleId=currentCycle().id;
      if(e && r.leaveType==='Annual Leave') e.annualLeaveBalance=E.round4(Number(e.annualLeaveBalance||0)+Number(r.hours||0));
      if(e && r.leaveType==='Long Service Leave') e.lslAccruedBalance=E.round4(Number(e.lslAccruedBalance||0)+Number(r.hours||0));
    }else{
      state.cashOutRequests=state.cashOutRequests.filter(x=>String(x.id)!==String(id));
    }
    save(); calculateAllForCurrent(); log(finalised?'Finalised cash out deleted. Credits returned and recovery will process in current pay.':'Cash out request deleted.'); closeModal(); renderAll();
  }

  function renderAbsenceBalance(){
    h('absenceBalance', `<h2>Absence Balance</h2><div class="controls">${showTerminatedControl('absenceShowTerminated','absenceBalance')}</div><div class="grid form-grid"><div><label>Employee</label><select id="absenceEmp">${employeeOptions(employeeList(showTerminatedByTab.absenceBalance))}</select></div></div><div id="absenceOutput"></div>`);
    bindShowTerminated('absenceShowTerminated','absenceBalance',renderAbsenceBalance); $('absenceEmp').addEventListener('change',()=>{ absenceEditing=false; absenceDraft=null; renderAbsenceOutput(); }); renderAbsenceOutput();
  }
  function renderAbsenceOutput(){
    const e=emp(v('absenceEmp')); if(!e){ h('absenceOutput','<p class="small-note">Select an employee.</p>'); return; }
    const b=E.projectedBalances(state,e,currentCycle(),false);
    if(absenceEditing){
      const d=absenceDraft || {annual:b.annual, personal:b.personal, lslAccrued:b.lslAccrued, lslProRata:b.lslProRata, lslEntitlementDate:b.lslEntitlementDate}; absenceDraft=d;
      h('absenceOutput', `<div class="grid form-grid"><div><label>Annual Leave Balance (Hours)</label><input id="adjAnnual" type="number" step="0.01" value="${Number(d.annual||0).toFixed(2)}"></div><div><label>Personal Leave Balance (Hours)</label><input id="adjPersonal" type="number" step="0.01" value="${Number(d.personal||0).toFixed(2)}"></div><div><label>LSL Accrued Balance (Hours)</label><input id="adjLslAccrued" type="number" step="0.01" value="${Number(d.lslAccrued||0).toFixed(2)}"></div><div><label>LSL Pro-rata (Hours)</label><input id="adjLslProRata" type="number" step="0.01" value="${Number(d.lslProRata||0).toFixed(2)}"></div><div><label>LSL Entitlement Date</label><input id="adjLslDate" type="date" value="${esc(d.lslEntitlementDate||'')}"></div></div><div class="save-row"><button id="cancelAbsenceAdjust" class="secondary">Cancel</button><button id="saveAbsenceAdjust">Save</button></div>`);
      ['adjAnnual','adjPersonal','adjLslAccrued','adjLslProRata','adjLslDate'].forEach(id=>$(id).addEventListener('input',()=>{ absenceDraft={ annual:Number(v('adjAnnual')||0), personal:Number(v('adjPersonal')||0), lslAccrued:Number(v('adjLslAccrued')||0), lslProRata:Number(v('adjLslProRata')||0), lslEntitlementDate:v('adjLslDate') }; }));
      $('cancelAbsenceAdjust').addEventListener('click',()=>{ absenceEditing=false; absenceDraft=null; renderAbsenceOutput(); });
      $('saveAbsenceAdjust').addEventListener('click',saveAbsenceAdjustment); return;
    }
    h('absenceOutput', table(['Balance','Hours / Date'], [['Annual Leave Balance (Hours)',b.annual.toFixed(2)],['Personal Leave Balance (Hours)',b.personal.toFixed(2)],['LSL Accrued Balance (Hours)',b.lslAccrued.toFixed(2)],['LSL Pro-rata (Hours)',b.lslProRata.toFixed(2)],['LSL Entitlement Date',E.fmtPay(b.lslEntitlementDate)]]) + `<div class="controls"><button id="adjustBalances" class="secondary">Adjust Balances</button><button id="recalculateBalances" class="secondary">Recalculate Balances</button></div>`);
    $('adjustBalances').addEventListener('click',()=>{ absenceEditing=true; absenceDraft=null; renderAbsenceOutput(); });
    $('recalculateBalances').addEventListener('click',openRecalculateBalances);
  }

  function openRecalculateBalances(){
    const e=emp(v('absenceEmp')); if(!e) return alert('Select an employee first.');
    confirmModal(`Recalculate balances for ${E.employeeName(e)} from saved employment history, schedules, leave bookings and cash-outs?`, 'Yes', ()=>{
      const before=E.projectedBalances(state,e,currentCycle());
      const recalculated=E.recalculateBalances(state,e,currentCycle().end);
      e.annualLeaveBalance=E.round4(recalculated.annual);
      e.personalLeaveBalance=E.round4(recalculated.personal);
      e.lslAccruedBalance=E.round4(recalculated.lslAccrued);
      e.lslProRataOverride=E.round4(recalculated.lslProRata);
      e.lslEntitlementDateOverride=recalculated.lslEntitlementDate; e.lslEntitlementConvertedAt=(recalculated.lslEntitlementDate&&E.compare(recalculated.lslEntitlementDate,currentCycle().end)<=0)?currentCycle().end:'';
      addJobEvent(e.id,'Absence Balance Recalculation',todayIso(),`Balances recalculated. Annual ${before.annual.toFixed(2)} → ${recalculated.annual.toFixed(2)}, Personal ${before.personal.toFixed(2)} → ${recalculated.personal.toFixed(2)}, LSL Accrued ${before.lslAccrued.toFixed(2)} → ${recalculated.lslAccrued.toFixed(2)}, LSL Pro-rata ${before.lslProRata.toFixed(2)} → ${recalculated.lslProRata.toFixed(2)}.`, 'employee', e.id);
      save(); calculateAllForCurrent(); toast('Balances recalculated'); renderAll();
    });
  }

  function saveAbsenceAdjustment(){
    const e=emp(v('absenceEmp')); if(!e || !absenceDraft) return;
    const before=E.projectedBalances(state,e,currentCycle());
    const draft=Object.assign({},absenceDraft);
    modal('Adjustment Comment', '<p>Please enter a comment/explanation for this adjustment.</p><textarea id="absenceComment" rows="4" style="width:100%"></textarea>', '<button id="saveAbsenceComment">Save</button><button data-close-modal class="secondary">Cancel</button>', true);
    $('saveAbsenceComment').addEventListener('click',()=>{
      const comment=v('absenceComment').trim(); if(!comment) return alert('A comment is required.');
      e.annualLeaveBalance=E.round4(Number(draft.annual||0)); e.personalLeaveBalance=E.round4(Number(draft.personal||0)); e.lslAccruedBalance=E.round4(Number(draft.lslAccrued||0)); e.lslProRataOverride=E.round4(Number(draft.lslProRata||0)); e.lslEntitlementDateOverride=draft.lslEntitlementDate||''; e.lslEntitlementConvertedAt=(draft.lslEntitlementDate&&E.compare(draft.lslEntitlementDate,currentCycle().end)<=0)?currentCycle().end:'';
      const desc=`Balances adjusted. Annual ${before.annual.toFixed(2)} → ${Number(draft.annual||0).toFixed(2)}, Personal ${before.personal.toFixed(2)} → ${Number(draft.personal||0).toFixed(2)}, LSL Accrued ${before.lslAccrued.toFixed(2)} → ${Number(draft.lslAccrued||0).toFixed(2)}, LSL Pro-rata ${before.lslProRata.toFixed(2)} → ${Number(draft.lslProRata||0).toFixed(2)}, LSL Date ${E.fmtPay(before.lslEntitlementDate)} → ${E.fmtPay(draft.lslEntitlementDate)}. Comment: ${comment}`;
      addJobEvent(e.id,'Absence Balance Adjustment',todayIso(),desc,'employee',e.id); absenceEditing=false; absenceDraft=null; save(); calculateAllForCurrent(); closeModal(); log('Absence balances adjusted.'); renderAll();
    });
  }

  function allPayslipsForEmployee(empId){ const current=currentResults().filter(p=>p.empId===empId).map(p=>Object.assign({},p,{key:`open_${p.id}`})); const hist=state.payslips.filter(p=>p.empId===empId).map(p=>Object.assign({},p,{key:`hist_${p.id}`})); return current.concat(hist).sort((a,b)=>E.compare(b.cycle.end,a.cycle.end)||b.segmentIndex-a.segmentIndex); }
  function renderPayslip(){ h('payslip', `<h2>Payment Advice</h2><p class="small-note">Select an employee, then choose a payslip date. Click the same payslip again to close it.</p><div class="controls no-print">${showTerminatedControl('payslipShowTerminated','payslip')}</div><div class="grid form-grid no-print"><div><label>Employee</label><select id="payslipEmp">${employeeOptions(employeeList(showTerminatedByTab.payslip))}</select></div><div style="align-self:end"><button id="printPayslip">Print Payslip</button></div></div><div id="payslipList" class="payslip-list"></div><div id="payslipContent"></div>`); bindShowTerminated('payslipShowTerminated','payslip',renderPayslip); $('payslipEmp').addEventListener('change',()=>{ selectedPayslipKey=''; renderPayslipList(); }); $('printPayslip').addEventListener('click',printPayslip); renderPayslipList(); }
  function clearOpenPayslip(){ selectedPayslipKey=''; const node=document.getElementById('payslipContent'); if(node) node.innerHTML=''; const print=document.getElementById('printArea'); if(print) print.innerHTML=''; }
  function renderPayslipList(){ const id=v('payslipEmp'); if(!id){ h('payslipList',''); h('payslipContent',''); return; } const list=allPayslipsForEmployee(id); if(!list.length){ h('payslipList','<p class="small-note">No payslips available for this employee.</p>'); h('payslipContent',''); return; } h('payslipList', list.map(p=>`<button type="button" style="color:#000" class="${selectedPayslipKey===p.key?'active':''}" data-open-payslip="${esc(p.key)}">${E.ppeLabel(p.cycle)} — ${E.fmtPay(p.cycle.end)} — ${esc(p.position||'')} — ${p.finalised?'Finalised':'Open'} — Net ${E.money(p.net)}</button>`).join('')); document.querySelectorAll('[data-open-payslip]').forEach(b=>b.addEventListener('click',()=>togglePayslip(b.dataset.openPayslip))); }
  function togglePayslip(key){ if(selectedPayslipKey===key){ selectedPayslipKey=''; h('payslipContent',''); renderPayslipList(); return; } selectedPayslipKey=key; const p=allPayslipsForEmployee(v('payslipEmp')).find(x=>x.key===key); h('payslipContent',p?payslipHtml(p):''); renderPayslipList(); }
  function printPayslip(){ if(!selectedPayslipKey) return alert('Select a payslip first.'); const p=allPayslipsForEmployee(v('payslipEmp')).find(x=>x.key===selectedPayslipKey); if(!p) return; if(!p.finalised) return alert('This payslip cannot be printed until the pay has been finalised.'); h('printArea', payslipHtml(p)); setTimeout(()=>window.print(), 0); }
  function financialYearBounds(paymentDate){
    const d=E.parseDate(paymentDate); const y=d.getMonth()+1>=7?d.getFullYear():d.getFullYear()-1;
    return {start:`${y}-07-01`, end:`${y+1}-06-30`};
  }
  function inSameFinancialYear(paymentDate,targetPaymentDate){ const fy=financialYearBounds(targetPaymentDate); return E.compare(paymentDate,fy.start)>=0 && E.compare(paymentDate,fy.end)<=0 && E.compare(paymentDate,targetPaymentDate)<=0; }
  function ytdTotalsForPayslip(p){
    const hist=state.payslips.filter(x=>x.empId===p.empId && inSameFinancialYear(x.cycle.paymentDate,p.cycle.paymentDate));
    const currentOpen=(!p.finalised && Number(p.cycleId)===Number(currentCycle().id)) ? currentResults().filter(x=>x.empId===p.empId && inSameFinancialYear(x.cycle.paymentDate,p.cycle.paymentDate)) : [];
    const all=hist.concat(currentOpen);
    return { gross:all.reduce((s,x)=>s+Number(x.gross||0),0), tax:all.reduce((s,x)=>s+Number(x.tax||0),0), net:all.reduce((s,x)=>s+Number(x.net||0),0) };
  }
  function consolidatePayslipDisplayRows(rows){
    const output=[];
    const grouped=new Map();
    (rows||[]).forEach(row=>{
      const description=String(row.description||'');
      const canGroup=row.kind!=='retro' && ['Annual Leave','Annual Leave Loading'].includes(description);
      if(!canGroup){ output.push(Object.assign({},row)); return; }
      const key=[description,Number(row.rate||0).toFixed(6),row.position||'',row.kind||'',row.ote===false?'nonote':'ote'].join('|');
      let target=grouped.get(key);
      if(!target){ target=Object.assign({},row); grouped.set(key,target); output.push(target); return; }
      target.units=E.round4(Number(target.units||0)+Number(row.units||0));
      target.amount=E.round2(Number(target.amount||0)+Number(row.amount||0));
      if(!target.startDate || E.compare(row.startDate,target.startDate)<0) target.startDate=row.startDate;
      if(!target.endDate || E.compare(row.endDate,target.endDate)>0) target.endDate=row.endDate;
    });
    return output;
  }
  function payslipHtml(p){
    const e=p.employeeSnapshot||emp(p.empId)||{};
    const status=p.finalised?'<div class="payslip-status pay-final">This pay has been finalised</div>':'<div class="payslip-status pay-open">This pay has not yet been finalised</div>';
    const ytd=ytdTotalsForPayslip(p);
    const addressLine=esc(e.addressLine||e.address||'');
    const locality=[e.townSuburb,e.state,e.postcode].filter(Boolean).map(esc).join(' ');
    const country=esc(e.country||'');
    const employeeBlock = `<div class="payslip-address"><strong>${esc(E.employeeName(e))}</strong><br>${addressLine}<br>${locality}<br>${country}</div>`;
    const detailRows = [
      ['Employee Name', esc(E.employeeName(e))], ['Employee ID number', esc(p.empId)], ['Department', esc(e.department||'')], ['Position', esc(p.position||'')], ['Pay Period', `${E.fmtPay(p.cycle.start)} - ${E.fmtPay(p.cycle.end)}`], ['Payment Date', E.fmtPay(p.cycle.paymentDate)]
    ].map(r=>`<div><strong>${r[0]}:</strong> ${r[1]}</div>`).join('');
    const displayRows=consolidatePayslipDisplayRows(p.rows||[]);
    const rows=displayRows.map(r=>`<tr><td>${esc(r.description || 'Additional Day')}</td><td class="right">${Number(r.units||0).toFixed(2)}</td><td class="right">${r.rate!==undefined&&r.rate!==null&&Number(r.rate)!==0?E.money(r.rate):''}</td><td class="right">${Number(r.amount||0).toFixed(2)}</td><td>${E.fmtPay(r.startDate)}</td><td>${E.fmtPay(r.endDate)}</td></tr>`).join('');
    const preTaxRows=(p.preTaxDeductions||[]).map(d=>[esc(d.description),E.money(d.amount)]);
    const postTaxRows=(p.postTaxDeductions||[]).map(d=>[esc(d.description),E.money(d.amount)]);
    const preTaxSection=preTaxRows.length?`<div class="section-title">Pre-Tax Deductions</div>${table(['Description','Amount'],preTaxRows)}`:'';
    const postTaxSection=postTaxRows.length?`<div class="section-title">Post-Tax Deductions</div>${table(['Description','Amount'],postTaxRows)}`:'';
    const taxRows=[[p.noTfn?'Marginal Tax - No TFN Provided':'Marginal Tax',E.money(p.marginalTax||0)]];
    if(Math.abs(Number(p.terminationLeaveTax||0))>0.004) taxRows.push(['Tax - Unused Leave on Termination',E.money(p.terminationLeaveTax||0)]);
    if(Math.abs(Number(p.marginalTaxRetro||0))>0.004) taxRows.push([p.noTfnRetro?'Marginal Tax Retro - No TFN Provided':'Marginal Tax Retro',E.money(p.marginalTaxRetro||0)]);
    if(Math.abs(Number(p.stsl||0))>0.004) taxRows.push(['STSL Repayment',E.money(p.stsl||0)]);
    if(Math.abs(Number(p.stslRetro||0))>0.004) taxRows.push(['STSL Repayment Retro',E.money(p.stslRetro||0)]);
    const superRows=[];
    if(Math.abs(Number(p.superCurrent ?? p.superAmt ?? 0))>0.004) superRows.push(['Employer Super Contribution',E.money(p.superCurrent ?? p.superAmt ?? 0)]);
    if(Math.abs(Number(p.superRetro||0))>0.004) superRows.push(['Employer Super Contribution Retro',E.money(p.superRetro||0)]);
    if(!superRows.length) superRows.push(['Employer Super Contribution',E.money(0)]);
    const usedAnnual=(p.rows||[]).filter(r=>r.description==='Annual Leave').reduce((a,r)=>a+Number(r.units||0),0);
    const usedPersonal=(p.rows||[]).filter(r=>r.description==='Personal Leave').reduce((a,r)=>a+Number(r.units||0),0);
    const usedLsl=(p.rows||[]).filter(r=>r.description==='Long Service Leave').reduce((a,r)=>a+Number(r.units||0),0);
    const leaveRows=[
      ['Annual Leave Balance (Hours)', Number(p.annualAccrual||0).toFixed(4), Number(usedAnnual||0).toFixed(4), Number((p.balances&&p.balances.annual)||0).toFixed(4)],
      ['Personal Leave Balance (Hours)', Number(p.personalAccrual||0).toFixed(4), Number(usedPersonal||0).toFixed(4), Number((p.balances&&p.balances.personal)||0).toFixed(4)],
      ['LSL Accrued Balance (Hours)', Number(p.lslAccrual||0).toFixed(4), Number(usedLsl||0).toFixed(4), Number((p.balances&&p.balances.lslAccrued)||0).toFixed(4)],
      ['LSL Entitlement Date', '', '', E.fmtPay((p.balances&&p.balances.lslEntitlementDate)||'')]
    ];
    return `<div class="payslip"><h2>Payment Advice ${p.segmentCount>1?`(${p.segmentIndex} of ${p.segmentCount})`:''}</h2>${status}<div class="payslip-header"><div>${employeeBlock}</div><div class="payslip-details">${detailRows}</div></div><div class="section-title">Pay Summary</div>${table(['','Gross','Tax','Net'],[['Current',E.money(p.gross),E.money(p.tax),E.money(p.net)],['YTD',E.money(ytd.gross),E.money(ytd.tax),E.money(ytd.net)]])}<div class="section-title">Earnings</div><table><thead><tr><th>Description</th><th>Units</th><th>Rate</th><th>Amount</th><th>Begin Dt</th><th>End Dt</th></tr></thead><tbody>${rows}<tr><td><strong>Total</strong></td><td class="right"><strong>${Number(p.units||0).toFixed(2)}</strong></td><td></td><td class="right"><strong>${Number(p.gross||0).toFixed(2)}</strong></td><td></td><td></td></tr></tbody></table>${preTaxSection}<div class="section-title">Tax</div>${table(['Description','Amount'],taxRows)}${postTaxSection}<div class="section-title">Employer Superannuation</div>${table(['Description','Amount'],superRows)}<div class="section-title">Leave Balance</div>${table(['Leave','Accrued','Used','Balance'],leaveRows)}</div>`;
  }

  function renderCertification(){ const visible=E.PAY_CYCLES.filter(c=>c.id<=currentCycle().id || E.isFinalised(state,c)); const selected=selectedCertCycleId && visible.some(c=>String(c.id)===String(selectedCertCycleId)) ? String(selectedCertCycleId) : String(currentCycle().id); h('certification', `<h2>Certification Report</h2><p class="small-note">Reports are only available for the current/open pay and previous generated pay periods. Future reports are not shown.</p><div class="grid form-grid"><div><label>Pay Cycle</label><select id="certCycle">${visible.map(c=>`<option value="${c.id}" ${String(c.id)===selected?'selected':''}>${E.cycleDisplay(c)}</option>`).join('')}</select></div></div><div id="certOutput"></div>`); $('certCycle').addEventListener('change',()=>{ selectedCertCycleId=v('certCycle'); renderCertOutput(); }); renderCertOutput(); }
  function renderCertOutput(){
    const c=E.cycleById(v('certCycle')||currentCycle().id);
    const rec=certificationRecord(c.id);
    const isCurrent = Number(c.id)===Number(currentCycle().id);
    const locked=!!rec.completed && (!isCurrent || !!rec.locked);
    const lines=(isCurrent?currentResults():state.payslips.filter(p=>Number(p.cycleId)===Number(c.id)));
    if(!lines.length){ h('certOutput','<p class="small-note">No payslips generated for this pay period.</p>'); return; }
    const certifiedCount=lines.filter(p=>rec.lines && rec.lines[String(p.id)] && rec.lines[String(p.id)].certified).length;
    const statusText=rec.completed ? '<p class="success-text"><strong>Certification report completed and locked.</strong></p>' : `<p class="small-note">${certifiedCount} of ${lines.length} pay lines certified. Progress auto-saves when each certify checkbox is ticked.</p>`;
    h('certOutput', statusText + table(['Details','Employee','Position','Gross','Tax','Net','Certify'], lines.map(p=>{
      const line=rec.lines[String(p.id)] || {};
      const checked=locked || !!line.certified;
      return [`<span data-cert-row="${esc(p.id)}"><button class="icon-btn" title="View pay breakdown" data-cert-detail="${esc(p.id)}">🔍</button></span>`,esc(p.employeeName),esc(p.position),E.money(p.gross),E.money(p.tax),E.money(p.net),`<input type="checkbox" class="certLine" data-id="${esc(p.id)}" ${checked?'checked':''} ${locked?'disabled':''}>`];
    })) + `<div class="divider"></div><div class="grid form-grid"><div><label>Name</label><input id="certName" ${locked?'readonly':''} value="${esc(rec.name||'')}"></div><div><label>Position</label><input id="certPosition" ${locked?'readonly':''} value="${esc(rec.position||'')}"></div></div><p><label><input type="checkbox" id="certDeclaration" ${rec.declaration?'checked':''} ${locked?'disabled':''}> I certify to the best of my knowledge, this pay is correct</label></p><button id="saveCert" ${locked?'disabled':''}>Complete Certification Report</button>`);
    document.querySelectorAll('[data-cert-detail]').forEach(b=>b.addEventListener('click',()=>openCertificationDetail(c.id,b.dataset.certDetail)));
    document.querySelectorAll('.certLine').forEach(ch=>ch.addEventListener('change',()=>autoSaveCertLine(c.id,ch.dataset.id,ch.checked)));
    ['certName','certPosition','certDeclaration'].forEach(id=>{ const el=$(id); if(el && !locked) el.addEventListener('change',()=>autoSaveCertMeta(c.id)); });
    if(!locked) $('saveCert').addEventListener('click',()=>saveCertification(c.id));
  }
  function openCertificationDetail(cycleId,payId){
    const c=E.cycleById(cycleId||currentCycle().id);
    const lines=(c.id===currentCycle().id?currentResults():state.payslips.filter(p=>Number(p.cycleId)===Number(c.id)));
    const p=lines.find(x=>String(x.id)===String(payId));
    if(!p) return alert('Pay breakdown was not found.');
    const summary=table(['Summary','Amount'],[['Gross',E.money(p.gross)],['Tax',E.money(p.tax)],['Pre-tax deductions',E.money(p.preTaxDeductionTotal||0)],['Post-tax deductions',E.money(p.postTaxDeductionTotal||0)],['Employer Superannuation',E.money(p.superAmt||0)],['Net Pay',E.money(p.net)]]);
    modal(`Pay Breakdown - ${p.employeeName}`, summary + payslipHtml(p), `<button type="button" data-close-modal class="secondary">Close</button>`, false);
  }
  function autoSaveCertMeta(cycleId){
    const rec=certificationRecord(cycleId);
    if(rec.completed) return;
    rec.name=v('certName');
    rec.position=v('certPosition');
    rec.declaration=!!($('certDeclaration') && $('certDeclaration').checked);
    rec.updatedAt=new Date().toISOString();
    save();
  }
  function autoSaveCertLine(cycleId, payId, checked){
    const c=E.cycleById(cycleId);
    const isCurrent=Number(c.id)===Number(currentCycle().id);
    const lines=(isCurrent?currentResults():state.payslips.filter(p=>Number(p.cycleId)===Number(c.id)));
    const p=lines.find(x=>String(x.id)===String(payId));
    if(!p) return;
    const rec=certificationRecord(cycleId);
    if(rec.completed && !isCurrent) return;
    autoSaveCertMeta(cycleId);
    rec.lines[String(payId)]={ certified:!!checked, certifiedAt:checked?new Date().toISOString():'', employeeName:p.employeeName, payHash:checked?paySignature(p):'' };
    if(!checked){ rec.completed=false; rec.locked=false; }
    rec.updatedAt=new Date().toISOString();
    save();
    toast(checked?'Certification progress saved':'Certification removed');
    renderCertOutput();
  }
  function saveCertification(cycleId){
    const rec=certificationRecord(cycleId);
    const c=E.cycleById(cycleId);
    const isCurrent=Number(c.id)===Number(currentCycle().id);
    const lines=(isCurrent?currentResults():state.payslips.filter(p=>Number(p.cycleId)===Number(c.id)));
    const checks=[...document.querySelectorAll('.certLine')];
    if(checks.some(c=>!c.checked)) return alert('Please certify each pay line.');
    if(!v('certName')||!v('certPosition')) return alert('Enter name and position.');
    if(!$('certDeclaration').checked) return alert('Please tick the certification declaration.');
    rec.name=v('certName'); rec.position=v('certPosition'); rec.declaration=true; rec.completed=true; rec.locked=true; rec.completedAt=new Date().toISOString(); rec.savedAt=rec.completedAt;
    lines.forEach(p=>{ rec.lines[String(p.id)]={ certified:true, certifiedAt:rec.completedAt, employeeName:p.employeeName, payHash:paySignature(p) }; });
    clearCertificationAlerts(cycleId);
    save(); log(`Certification Report completed for ${E.ppeLabel(E.cycleById(cycleId))}`); renderCertification(); renderAlerts();
  }

  function reportLongDate(dateIso){
    const d=E.parseDate(dateIso); if(!d) return '';
    try{return new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'long',year:'numeric'}).format(d);}catch(err){return E.fmtLong(dateIso);}
  }
  function statementJobNumberMap(rows){
    const keys=[];
    rows.forEach(r=>{ const key=String(r.positionNumber||r.positionName||r.position||'Job'); if(!keys.includes(key)) keys.push(key); });
    const map=new Map(); keys.forEach((key,i)=>map.set(key,i+1)); return map;
  }
  function statementRowsForEmployee(e,asAt){
    let rows=(state.jobDataRows||[]).filter(r=>r.empId===e.id&&r.saved!==false&&r.effectiveDate&&E.compare(r.effectiveDate,asAt)<=0)
      .slice().sort((a,b)=>E.compare(a.effectiveDate,b.effectiveDate)||Number(a.effectiveSequence||0)-Number(b.effectiveSequence||0));
    if(!rows.length&&e.startDate){
      const schedule=E.activeSchedule(state,e.id,e.startDate); const rate=E.activePayRate(state,e.id,e.startDate);
      rows=[{effectiveDate:e.startDate,positionNumber:'1',positionName:(rate&&rate.position)||e.position||'',department:e.department||'',hoursByDay:(schedule&&schedule.hoursByDay)||{},reason:'New Hire'}];
      if(e.terminationDate&&E.compare(e.terminationDate,asAt)<=0) rows.push({effectiveDate:e.terminationDate,positionNumber:'1',positionName:(rate&&rate.position)||e.position||'',department:e.department||'',hoursByDay:(schedule&&schedule.hoursByDay)||{},reason:e.terminationReason||'Termination'});
    }
    const jobMap=statementJobNumberMap(rows);
    return rows.map(r=>{
      const sched=(r.hoursByDay&&Object.values(r.hoursByDay).some(x=>Number(x)>0))?r:{hoursByDay:(E.activeSchedule(state,e.id,r.effectiveDate)||{}).hoursByDay||{}};
      const weekly=Object.values(sched.hoursByDay||{}).reduce((sum,x)=>sum+Number(x||0),0);
      const fte=weekly>0?weekly/E.STANDARD_WEEKLY_HOURS:0;
      const key=String(r.positionNumber||r.positionName||r.position||'Job');
      return { job:jobMap.get(key)||1, date:r.effectiveDate, position:r.positionName||r.position||((E.activePayRate(state,e.id,r.effectiveDate)||{}).position)||e.position||'', location:r.location||r.department||e.department||'', fte, action:r.reason||r.action||'' };
    });
  }
  function statementLeaveWithoutPayRows(e,asAt,serviceRows){
    return (state.leaveBookings||[]).filter(l=>l.empId===e.id&&l.type==='LWOP'&&l.startDate&&E.compare(l.startDate,asAt)<=0).map(l=>{
      const prior=[...serviceRows].filter(r=>E.compare(r.date,l.startDate)<=0).sort((a,b)=>E.compare(b.date,a.date))[0];
      return {job:(prior&&prior.job)||1,begin:l.startDate,end:E.compare(l.endDate,asAt)>0?asAt:l.endDate};
    });
  }
  function statementOfServiceHtml(empId,asAt,options={}){
    const e=emp(empId); if(!e) return '';
    const personal=E.activePersonalDetails(state,e.id,asAt);
    const locality=[personal.townSuburb,personal.state,personal.postcode].filter(Boolean).join(' ');
    const serviceRows=statementRowsForEmployee(e,asAt);
    const lwopRows=statementLeaveWithoutPayRows(e,asAt,serviceRows);
    const segments=E.employmentSegments(e).filter(seg=>E.compare(seg.startDate,asAt)<=0);
    const commencement=(segments.length?segments.map(s=>s.startDate).sort((a,b)=>E.compare(a,b))[0]:e.originalStartDate||e.startDate)||'';
    const reference=options.reference||`D${String(asAt||todayIso()).slice(0,4)}/${String(e.id).replace(/\D/g,'')||e.id}`;
    const signatory=(options.signatory||'').trim();
    const signatoryPosition=(options.signatoryPosition||'PAYROLL OFFICER').trim();
    const contact=(options.contact||'HR@mcdonaldscf.com').trim();
    const serviceBody=serviceRows.length?serviceRows.map(r=>`<tr><td>${esc(r.job)}</td><td>${esc(E.fmtPay(r.date))}</td><td>${esc(r.position)}</td><td>${esc(r.location)}</td><td>${Number(r.fte||0).toFixed(2)}</td><td>${esc(r.action)}</td></tr>`).join(''):'<tr><td colspan="6">No service history was available as at the selected date.</td></tr>';
    const lwopBody=lwopRows.length?lwopRows.map(r=>`<tr><td>${esc(r.job)}</td><td>${esc(E.fmtPay(r.begin))}</td><td>${esc(E.fmtPay(r.end))}</td></tr>`).join(''):'<tr><td colspan="3">No Leave Without Pay recorded.</td></tr>';
    return `<article class="statement-service"><header class="statement-header"><div class="statement-brand"><div class="statement-dept">McDonald&#39;s California Franchise</div></div><div class="statement-reference">${esc(reference)}</div></header><div class="statement-address"><strong>${esc(E.employeeName(e))}</strong><br>${esc(String(personal.addressLine||'').toUpperCase())}<br>${esc(String(locality||'').toUpperCase())}<br>${esc(String(personal.country||'').toUpperCase())}</div><h1>STATEMENT OF SERVICE</h1><p>${esc(E.employeeName(e))} commenced service with McDonald&#39;s California Franchise on ${esc(reportLongDate(commencement))}. Employment is full time equivalent (FTE) and continuous unless otherwise stated.</p><p>Job number indicates employment in different roles within the company. Multiple jobs may be active concurrently.</p><h2>Service History:</h2><table class="statement-table"><thead><tr><th>Job</th><th>Date</th><th>Position</th><th>Location</th><th>FTE</th><th>Action</th></tr></thead><tbody>${serviceBody}</tbody></table><h2>Leave Without Pay Taken:</h2><table class="statement-table statement-lwop"><thead><tr><th>Job</th><th>Begin Date</th><th>End Date</th></tr></thead><tbody>${lwopBody}</tbody></table><p>This statement is a true indication of service as at ${esc(reportLongDate(asAt))}.</p><p>Please contact the Human Resources Department on ${esc(contact)}, if you have any enquiries relating to this matter.</p><div class="statement-signature"><p>Yours sincerely</p><div class="signature-space"></div><p><strong>${esc(String(signatory||'').toUpperCase())}</strong><br><strong>${esc(String(signatoryPosition||'').toUpperCase())}</strong><br>${esc(reportLongDate(todayIso()))}</p></div><footer class="statement-footer"><span>McDonald&#39;s California Franchise</span><span class="statement-page-number">Page</span></footer></article>`;
  }
  function renderReports(){
    const list=state.employees.slice().sort((a,b)=>E.employeeName(a).localeCompare(E.employeeName(b)));
    const selected=selectedReportEmp&&list.some(e=>e.id===selectedReportEmp)?selectedReportEmp:'';
    h('reports', `<h2>Reports</h2><p class="small-note">Generate payroll and employment reports. Statement of Service is available now; additional payroll reports can be added later.</p><div class="report-controls"><div class="grid form-grid"><div><label>Report</label><select id="reportType"><option>Statement of Service</option></select></div><div><label>Employee</label><select id="reportEmp">${employeeOptions(list)}</select></div><div><label>As at date</label><input id="reportAsAt" type="date" value="${esc(todayIso())}"></div><div><label>Reference number</label><input id="reportReference" placeholder="Auto-generated if blank"></div><div><label>Signatory name</label><input id="reportSignatory"></div><div><label>Signatory position</label><input id="reportSignatoryPosition" value="PAYROLL OFFICER"></div><div><label>Contact email</label><input id="reportContact" value="HR@mcdonaldscf.com"></div></div><div class="controls" style="margin-top:14px"><button id="previewStatement">Generate Preview</button><button id="printStatement" class="secondary" ${statementPreviewHtml?'':'disabled'}>Print / Save PDF</button><button id="downloadStatement" class="success" ${statementPreviewHtml?'':'disabled'}>Download HTML</button></div></div><div id="reportPreview" class="report-preview">${statementPreviewHtml||'<p class="small-note">Select an employee and generate the Statement of Service.</p>'}</div>`);
    if(selected) setv('reportEmp',selected);
    $('reportEmp').addEventListener('change',()=>{selectedReportEmp=v('reportEmp');});
    $('previewStatement').addEventListener('click',()=>{
      const empId=v('reportEmp'); const asAt=v('reportAsAt'); if(!empId) return alert('Select an employee.'); if(!asAt) return alert('Select an as at date.');
      const employee=emp(empId); const firstStart=(E.employmentSegments(employee)[0]||{}).startDate||employee.originalStartDate||employee.startDate||'';
      if(firstStart&&E.compare(asAt,firstStart)<0) return alert('The as at date cannot be before the employee commenced service.');
      selectedReportEmp=empId;
      statementPreviewHtml=statementOfServiceHtml(empId,asAt,{reference:v('reportReference'),signatory:v('reportSignatory'),signatoryPosition:v('reportSignatoryPosition'),contact:v('reportContact')});
      h('reportPreview',statementPreviewHtml); $('printStatement').disabled=false; $('downloadStatement').disabled=false;
    });
    $('printStatement').addEventListener('click',()=>{ if(!statementPreviewHtml) return alert('Generate the report preview first.'); h('printArea',statementPreviewHtml); setTimeout(()=>window.print(),0); });
    $('downloadStatement').addEventListener('click',()=>{
      if(!statementPreviewHtml) return alert('Generate the report preview first.');
      const employee=emp(selectedReportEmp); const filename=`Statement-of-Service-${String((employee&&E.employeeName(employee))||selectedReportEmp).replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'')}.html`;
      const standaloneCss=`*{box-sizing:border-box}body{margin:0;background:#fff;color:#111;font-family:Arial,sans-serif}.statement-service{position:relative;box-sizing:border-box;background:#fff;color:#111;max-width:210mm;min-height:270mm;margin:0 auto;padding:18mm 18mm 20mm;font-size:12px;line-height:1.45}.statement-header{display:flex;justify-content:space-between;align-items:flex-start;gap:20px}.statement-brand{line-height:1.15}.statement-dept{font-size:25px;font-weight:700;letter-spacing:-.5px}.statement-reference{font-weight:700}.statement-address{margin:10mm 0 9mm;line-height:1.45;min-height:25mm}.statement-service h1{font-size:14px;margin:0 0 4mm}.statement-service h2{font-size:12px;margin:6mm 0 2mm}.statement-service p{margin:0 0 4mm}.statement-table{width:100%;border-collapse:collapse;margin:0 0 8mm}.statement-table th,.statement-table td{border:0;padding:1.4mm 1.2mm;font-size:10.5px;vertical-align:top}.statement-table th{border-bottom:1px solid #333;text-align:left}.statement-table th:nth-child(1),.statement-table td:nth-child(1){width:8%}.statement-table th:nth-child(2),.statement-table td:nth-child(2){width:12%}.statement-table th:nth-child(5),.statement-table td:nth-child(5){width:8%;text-align:center}.statement-table th:nth-child(6),.statement-table td:nth-child(6){width:24%}.statement-lwop{max-width:75mm}.statement-lwop th,.statement-lwop td{width:auto!important;text-align:left!important}.statement-signature{margin-top:8mm}.signature-space{height:16mm}.statement-footer{position:absolute;left:18mm;right:18mm;bottom:8mm;border-top:1px solid #444;padding-top:2mm;display:flex;justify-content:space-between;font-size:9px}.statement-page-number::after{content:' ' counter(page)}@page{size:A4;margin:7mm}@media print{.statement-service{width:100%;max-width:none;min-height:282mm;padding:14mm 16mm 18mm}.statement-table thead{display:table-header-group}.statement-table tr{break-inside:avoid;page-break-inside:avoid}.statement-footer{position:fixed;left:16mm;right:16mm;bottom:5mm}}`;
      const html=`<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Statement of Service</title><style>${standaloneCss}</style></head><body class="statement-download">${statementPreviewHtml}</body></html>`;
      const blob=new Blob([html],{type:'text/html'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),500);
    });
  }

  function renderAudit(){ h('audit', `<h2>Audit Log</h2>${state.auditLog.map(x=>`<div class="history-item">${esc(x)}</div>`).join('')}`); }
  function renderSettings(){
    h('settings', `<h2>Settings</h2><p><strong>Current app version:</strong> v${APP_VERSION}</p><div class="controls"><button id="settingsGeneral" class="${settingsView==='general'?'':'secondary'}">General</button><button id="settingsPositions" class="${settingsView==='positions'?'':'secondary'}">Positions</button></div><div id="settingsOutput"></div>`);
    $('settingsGeneral').addEventListener('click',()=>{ settingsView='general'; renderSettings(); });
    $('settingsPositions').addEventListener('click',()=>{ settingsView='positions'; renderSettings(); });
    if(settingsView==='positions') renderPositionsSettings(); else renderGeneralSettings();
  }
  function renderGeneralSettings(){
    h('settingsOutput', `<div class="controls"><button id="checkUpdates">Check for Updates</button><button id="changeNotes" class="secondary">Change Notes</button><button id="overnight" class="secondary">Check Overnight Processing</button><button id="finalisePay" class="warning">Finalise Pay</button><button id="checkErrors" class="secondary">Check for Errors</button></div><div class="controls"><button id="publicHolidays" class="secondary">View WA Public Holidays</button></div><div id="settingsGeneralOutput" class="small-note"></div>`);
    $('checkUpdates').addEventListener('click',checkForUpdates); $('changeNotes').addEventListener('click',openChangeNotes); $('overnight').addEventListener('click',()=>checkOvernightProcessing(true)); $('finalisePay').addEventListener('click',openFinalisePay); $('publicHolidays').addEventListener('click',openPublicHolidays); $('checkErrors').addEventListener('click',checkForErrors);
  }
  function generatePositionNumber(){
    const used=new Set((state.positions||[]).map(p=>String(p.positionNumber)));
    for(let i=0;i<2000;i++){ const n=String(Math.floor(1000+Math.random()*9000)); if(!used.has(n)) return n; }
    let n=1000; while(used.has(String(n))) n++; return String(n).slice(0,4);
  }
  function renderPositionsSettings(){
    const rows=(state.positions||[]).sort((a,b)=>String(a.positionName||'').localeCompare(String(b.positionName||''))).map(p=>[esc(p.positionNumber),`<button class="link-button" data-open-position="${esc(p.id)}">${esc(p.positionName||'')}</button>`,esc(p.department||''),E.money(p.hourlyRate||0),p.active===false?badge('Inactive'):badge('Active')]);
    h('settingsOutput', `<div class="controls"><button id="createPosition">Create</button></div>${rows.length?table(['Position Number','Position Name','Department','Hourly Rate','Status'],rows):'<p class="small-note">No positions have been created.</p>'}`);
    $('createPosition').addEventListener('click',openCreatePosition);
    document.querySelectorAll('[data-open-position]').forEach(b=>b.addEventListener('click',()=>openEditPosition(b.dataset.openPosition)));
  }
  function positionForm(pos,isCreate){
    const reportsToName=pos.reportsTo?((positionByNumber(pos.reportsTo)||{}).positionName||'Position not found'):'';
    return `<div class="grid form-grid"><div><label>Position Name</label><input id="posName" value="${esc(pos.positionName||'')}"></div><div><label>Position Number</label><input id="posNumber" readonly class="readonly" value="${esc(pos.positionNumber||generatePositionNumber())}"></div><div><label>Department</label><select id="posDepartment"><option ${pos.department==='Operations'?'selected':''}>Operations</option><option ${pos.department==='ICT'?'selected':''}>ICT</option><option ${pos.department==='Human Resources'?'selected':''}>Human Resources</option></select></div><div><label>Hourly Rate</label><input id="posRate" type="number" step="0.01" value="${esc(pos.hourlyRate||'')}"></div><div><label>Reports To</label><div class="inline-field"><input id="posReportsTo" value="${esc(pos.reportsTo||'')}"><button id="posLookup" type="button" class="icon-btn">🔍</button></div><p id="posReportsToName" class="small-note">${esc(reportsToName)}</p></div>${isCreate?'':`<div><label>Status</label><select id="posActive"><option value="true" ${pos.active!==false?'selected':''}>Active</option><option value="false" ${pos.active===false?'selected':''}>Inactive</option></select></div>`}</div>`;
  }
  function openCreatePosition(){
    const pos={positionNumber:generatePositionNumber(),department:'Operations',active:true};
    modal('Create Position', positionForm(pos,true), '<button id="addPosition">Add</button>', true);
    bindPositionFormLookup();
    $('addPosition').addEventListener('click',()=>savePosition(null,true));
  }
  function openEditPosition(id){
    const pos=(state.positions||[]).find(p=>p.id===id); if(!pos) return;
    modal('Position Details', positionForm(pos,false), '<button id="savePosition">Save</button>', true);
    bindPositionFormLookup();
    $('savePosition').addEventListener('click',()=>savePosition(id,false));
  }
  function bindPositionFormLookup(){
    $('posReportsTo').addEventListener('change',()=>{ const p=positionByNumber(v('posReportsTo')); h('posReportsToName', v('posReportsTo') ? esc((p&&p.positionName)||'Position not found') : ''); });
    $('posLookup').addEventListener('click',()=>{
      const rows=(state.positions||[]).map(p=>`<div class="lookup-row"><button type="button" data-pick-reportsto="${esc(p.positionNumber)}">${esc(p.positionNumber)} — ${esc(p.positionName||'')}</button></div>`).join('');
      h('posReportsToName', rows || 'No positions available.');
      document.querySelectorAll('[data-pick-reportsto]').forEach(b=>b.addEventListener('click',()=>{ const num=b.dataset.pickReportsto; setv('posReportsTo',num); const p=positionByNumber(num); h('posReportsToName', esc((p&&p.positionName)||'')); }));
    });
  }

  function employeesAssignedToPosition(positionNumber){
    return activeEmployees().filter(e=>{
      const latest=(state.jobDataRows||[]).filter(r=>r.empId===e.id && r.action!=='Termination' && E.compare(r.effectiveDate,todayIso())<=0).sort((a,b)=>E.compare(b.effectiveDate,a.effectiveDate)||Number(b.effectiveSequence||0)-Number(a.effectiveSequence||0))[0];
      return latest && String(latest.positionNumber)===String(positionNumber);
    });
  }
  function savePosition(id,isCreate){
    if(!v('posName').trim()) return alert('Position Name is required.');
    if(!v('posNumber')) return alert('Position Number is required.');
    if(!v('posDepartment')) return alert('Department is required.');
    if(String(v('posRate')).trim()==='' || Number(v('posRate'))<0) return alert('Hourly Rate is required.');
    const reportsTo=v('posReportsTo').trim();
    if(reportsTo && !positionByNumber(reportsTo)) return alert('Reports To position number was not found.');
    let pos=id?(state.positions||[]).find(p=>p.id===id):null;
    if(!pos){ pos={id:uid('pos'),positionNumber:v('posNumber'),active:true}; state.positions.push(pos); }
    const requestedActive = isCreate ? true : v('posActive')==='true';
    if(pos.active!==false && requestedActive===false){
      const assigned=employeesAssignedToPosition(pos.positionNumber);
      if(assigned.length) return alert(`This position cannot be made inactive because it has current employees assigned: ${assigned.map(E.employeeName).join(', ')}`);
    }
    pos.positionName=v('posName').trim(); pos.department=v('posDepartment'); pos.hourlyRate=Number(v('posRate')); pos.reportsTo=reportsTo; pos.active=requestedActive;
    save(); closeModal(); renderSettings(); toast(isCreate?'Position added':'Position saved');
  }

  function checkForErrors(){
    calculateAllForCurrent();
    const c=currentCycle();
    const warnings=[];
    const results=currentResults();
    state.employees.forEach(e=>{
      const active=employeeDisplayStatus(e)!=='Terminated';
      if(!active) return;
      const jobRows=(state.jobDataRows||[]).filter(r=>r.empId===e.id && E.compare(r.effectiveDate,c.end)<=0).sort((a,b)=>E.compare(b.effectiveDate,a.effectiveDate)||Number(b.effectiveSequence||0)-Number(a.effectiveSequence||0));
      const activeJob=jobRows.find(r=>r.action!=='Termination') || null;
      const schedule=E.activeSchedule(state,e.id,c.end);
      const hasPay=results.some(p=>p.empId===e.id && (Math.abs(Number(p.gross||0))>0.004 || Math.abs(Number(p.net||0))>0.004 || (p.rows||[]).length));
      if(hasPay && (!schedule || !Object.values(schedule.hoursByDay||{}).some(x=>Number(x)>0))) warnings.push(`${E.employeeName(e)} has a missing or invalid work schedule.`);
      if(hasPay && !(state.taxDetails||[]).some(t=>t.empId===e.id && String(t.taxFileNumber||'').trim())) warnings.push(`${E.employeeName(e)} has no Tax Details/TFN entered.`);
      const bal=E.projectedBalances(state,e,c,false);
      if(bal.annual<0 || bal.personal<0 || bal.lslAccrued<0) warnings.push(`${E.employeeName(e)} has a negative leave balance.`);
      const isFixed=(activeJob&&activeJob.positionClass==='Fixed-Term') || e.type==='Fixed Term';
      const hasTermRow=(state.jobDataRows||[]).some(r=>r.empId===e.id && r.action==='Termination');
      if(isFixed && !hasTermRow) warnings.push(`${E.employeeName(e)} is fixed-term but does not have a Termination row in Job Data.`);
    });
    (state.additionalEarnings||[]).filter(a=>a.saved===false).forEach(a=>warnings.push(`${E.employeeName(emp(a.empId)||{})} has unsaved Additional Earnings.`));
    results.forEach(p=>{ if(Number(p.net||0)<0) warnings.push(`${p.employeeName} has negative net pay on ${E.ppeLabel(p.cycle)} (${E.money(p.net)}).`); });
    (state.leaveBookings||[]).forEach(l=>{
      const e=emp(l.empId); if(!e) return;
      const validation=E.validateLeaveBooking(Object.assign({},state,{leaveBookings:(state.leaveBookings||[]).filter(x=>x.id!==l.id)}),l.empId,l.type,l.startDate,l.endDate,l.requestedHours!==undefined?l.requestedHours:(l.startDate===l.endDate?l.hours:undefined),l.id,{evidenceProvided:!!l.evidenceProvided});
      if(!validation.ok) warnings.push(`${E.employeeName(e)} leave booking ${E.fmtPay(l.startDate)} - ${E.fmtPay(l.endDate)}: ${validation.message}`);
    });
    const body=warnings.length?`<p class="small-note">These warnings do not prevent you from finalising pay. They are for review only.</p><ul>${warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul>`:'<p class="success-text"><strong>No errors found</strong></p>';
    modal('Pay Error / Warning Check', body, `<button data-close-modal>Close</button>`);
  }

  async function checkForUpdates(){ h('settingsGeneralOutput','Checking for updates...'); try{ const res=await fetch('./latest-version.json?ts='+Date.now()); if(!res.ok) throw new Error('No file'); const latest=await res.json(); h('settingsGeneralOutput', latest.version===APP_VERSION?`You are up to date. Current version: v${APP_VERSION}.`:`Update available: v${esc(latest.version)}. Export data before replacing files.`); }catch(e){ h('settingsGeneralOutput','Could not check updates. Make sure latest-version.json has been uploaded.'); } }
  const changeNotes=[
    {version:'v1.1.19',notes:[
      'Allowed valid Additional Earnings to be paid to terminated employees without recreating Regular Pay after termination.',
      'Kept current Annual Leave Loading on the same payslip as the employee\'s Annual Leave and Regular Pay when the position and base rate match.'
    ]},
    {version:'v1.1.18',notes:[
      'Consolidated same-rate Annual Leave and Annual Leave Loading payslip rows so a multi-day booking displays as one line for each earnings type.',
      "Updated Statement of Service branding and wording to McDonald's California Franchise, removed the government and address branding, and changed the contact details to Human Resources at HR@mcdonaldscf.com."
    ]},
    {version:'v1.1.17',notes:[
      'Added a Reports tab under Certification Report with a Statement of Service report generator.',
      'Added a Department of Education-style Statement of Service layout with service history, Leave Without Pay, effective-dated address, preview, print/PDF and HTML download.',
      'Added Reimbursement as an amount-based Additional Earnings type that does not create hours or leave accrual.',
      'Added automatic 17.5% Annual Leave Loading for booked Annual Leave and historical Annual Leave Loading Retro for previously unpaid loading.'
    ]},
    {version:'v1.1.16',notes:[
      'Stopped finalised leave payouts and prior-employment earnings from being automatically recovered in later pay periods, including after rehire.',
      'Added employment-segment boundaries so retro calculations do not compare across a termination and rehire break.',
      'Split employee addresses into Address, Town/Suburb, State, Postcode and Country and updated payslip address formatting.',
      'Added Personal Leave evidence validation for bookings of 3 working days or more.',
      'Confirmed Overpayment Adjustment is excluded from leave and service-hour accrual calculations.',
      'Added Bereavement Leave with a maximum of 5 scheduled working days per booking.',
      'Added confidential NES Family and Domestic Violence Leave with 10 days upfront, work-anniversary renewal, casual eligibility, private calendar display and ordinary payslip earnings descriptions.'
    ]},
    {version:'v1.1.15',notes:[
      'Completed a full code audit and removed obsolete Change Centre/legacy handlers that were no longer reachable from the interface.',
      'Added the most recent closed pay period as a valid deduction end date, with overlap validation and protection against deleting historical deductions.',
      'Corrected whole-employee tax, deductions and leave accrual allocation when an employee has multiple payslips/positions in one pay period.',
      'Strengthened difference-only retro calculations, duplicate-retro prevention, incremental retro tax and normal-rate/unit presentation.',
      'Added finalisation, date, storage, certification-alert and one-time LSL conversion safeguards, and corrected fixed-term expiry so the contract end date remains inclusive.',
      'Consolidated print CSS and verified a single-page A4 payslip, top-aligned tab navigation and key browser workflows.'
    ]},
    {version:'v1.1.14',notes:[
      'Added Job Data unsaved-change confirmation with exact message: Are you sure you want to exit without saving? Yes discards changes and exits; No returns to Job Data.',
      'Fixed retro duplication logic so retro already included on a finalised later payslip is treated as already paid and is not generated again in the next pay.',
      'Added regression tests for Job Data unsaved-change prompts and duplicate retro suppression.'
    ]},
    {version:'v1.1.13',notes:[
      'Refined retro pay rate change display so difference-only retro amounts generally keep the applicable ordinary rate and adjust retro units, while allowing exceptions where a changed rate is clearer.',
      'Enlarged printed payslips so the payment advice fills more of the A4 page, with the employee name/address moved right for an envelope window and right-side details aligned to the right edge.',
      'Made the alerts dropdown larger and less condensed with clickable alert items that navigate to the relevant page, such as the Certification Report and selected PPE.',
      'Fixed the page container layout so tab content is top-aligned under the fixed header instead of being vertically centred in the middle of the screen.'
    ]},
    {version:'v1.1.12',notes:[
      'Tightened the printed payslip layout again to reduce unnecessary blank space on A4 output.',
      'Strengthened tab navigation so the actual page and content containers reset to the top after each tab renders.',
      'Updated retro comparisons so backdated pay rate changes produce difference-only retro lines by earnings type instead of offsetting recovery/reissue lines.',
      'Centralised Annual Leave and Personal Leave accrual calculations so each pay period uses the employee\'s effective ordinary hours and does not double-add on recalculation.',
      'Certification Report line certification now auto-saves when each certify checkbox is pressed.',
      'If current/open pay changes after certification, the affected certification line is automatically uncertified and an alert is created.',
      'Alerts can now be marked as read from the bell dropdown.',
      'Added daily overdue certification alerts for incomplete past pay-period certification reports, while allowing incomplete past reports to be completed.',
      'Completed previous-period certification reports remain permanently locked; current/open completed reports unlock only if pay changes.'
    ]},
    {version:'v1.1.11',notes:[
      'Added Employee Data sidebar dropdown with Personal Details, Bank Details, Tax Details and Super tabs.',
      'Added the top-right alert bell dropdown with No New Alerts and badge support for future workflow alerts.',
      'Added LSL Entitlement Date to the payslip Leave Balance section and kept LSL pro-rata off the payslip.',
      'Made address changes effective-dated for payslip snapshots so finalised payslips stay frozen and open/future payslips use the correct address as at payment date.',
      'Added Other Leave to the Absence Calendar key in dark green and grouped future unlisted leave types under Other Leave.',
      'Improved tab switching so pages open at the top under the fixed bar and open payslip content is cleared when leaving Payslip.',
      'Improved payslip print CSS to print only the payslip area, reduce trailing blank pages and use more of the A4 page.',
      'Public Holiday earnings now generate only for rostered ordinary hours, with no automatic public holiday pay for casual employees unless worked/rules are added later.',
      'Retro pay rate changes now calculate the difference only, split by original earnings type, instead of reversing and reissuing the full payment.'
    ]},
    {version:'v1.1.7',notes:[
      'Deductions tab now stages changes and only updates Job Summary, payroll calculations and payslips after the Save button is pressed.',
      'Deductions tab keeps the selected employee visible after adding, deleting or end-dating deductions until the user leaves the tab.',
      'Certification Report now has a magnifying glass details button to view a detailed employee pay breakdown.',
      'Payslip detail now clears when leaving the Payslip tab so an open payslip cannot remain visible while scrolling elsewhere.',
      'Retro overtime now generates Marginal Tax Retro and STSL Repayment Retro where applicable, while still not accruing annual or personal leave.',
      'Leave Without Pay now appears in the Absence Calendar key after Long Service Leave and before Public Holiday using a burgundy colour.',
      'Additional Day entries before the employee start date now show a warning when Save is clicked.',
      'Matching retro Regular Pay recovery lines are consolidated on the payslip.'
    ]},
    {version:'v1.1.6',notes:[
      'Added Deductions tab for pre-tax and post-tax super deductions with current/future pay-period start and end date controls.',
      'Added Pre-Tax Deductions and Post-Tax Deductions payslip sections; pre-tax deductions reduce taxable income while gross remains unchanged, and post-tax percentage deductions calculate from net after tax/pre-tax deductions.',
      'Added Settings > Check for Errors, including negative net pay warnings, missing TFN/tax details, negative leave balances, fixed-term contract warnings, missing schedules and no-pay payslip warnings.',
      'Added Import Preview before data import replaces current app data, including counts for employees, payslips, leave, additional earnings, deductions, tax details and change records.',
      'Added Recalculate Balances in Absence Balance and included Additional Day hours in ordinary-hours accrual calculations.'
    ]},
    {version:'v1.1.5',notes:[
      'Replaced estimated tax logic with lookups from the uploaded ATO Fortnightly Tax Table and STSL Tax Table PDFs.',
      'PAYG now uses the tax-free-threshold or no-tax-free-threshold column based on the employee\'s effective Tax Details record, using the nearest lower earnings row when needed.',
      'STSL now uses the uploaded STSL table only when the employee\'s effective Tax Details record has STSL set to Yes, including retro calculations where applicable.',
      'No Tax Details at all still applies the Marginal Tax - No TFN Provided fallback at 45% for that employee only.',
      'Updated the Absence Calendar so it defaults to the current year and can navigate up to one year into the future.'
    ]},
    {version:'v1.1.4',notes:[
      'Added active-employee-only dropdowns by default in Change Centre, Job Summary, Tax Details, Additional Earnings, Leave, Absence Balance and Payslips, with show-terminated options where needed.',
      'Added Cash Out Leave in the Leave tab, including previous requests, deletion confirmation, current-pay payout lines and finalised-pay recovery support.',
      'Added Absence Balance adjustment mode with required comment, Job Summary recording, editable Annual Leave, Personal Leave, LSL Accrued, LSL Pro-rata and LSL Entitlement Date.',
      'Improved fixed-term and termination logic: fixed-term auto terminate defaults to Yes, rehire asks employment type/contract details, and employees are not marked Terminated until after the termination date.',
      'Improved finalised leave deletion so credits are returned and retro/recovery processing occurs in the current open pay.',
      'Restricted Additional Earnings dates to the selected pay period and kept the current open pay as the default period.',
      'Improved Tax Details so new future tax records copy the previous TFN, and negative/positive retro earnings can generate Marginal Tax Retro and STSL Repayment Retro adjustments.'
    ]},
    {version:'v1.1.3',notes:[
      'Added visible but read-only calculated Annual Leave and Personal Leave balances on commencement and rehire, and removed any initial LSL entry.',
      'Added Tax Details fields directly into the commencement popup so initial TFN, tax-free-threshold and STSL details flow through to Tax Details.',
      'Added No TFN Provided tax treatment at 45% and showed the label in the payslip Tax section.',
      'Updated Leave Without Pay and Leave Without Pay Retro to appear under Earnings with hours and zero earnings, while suppressing payslips where the whole pay has no payable earnings.',
      'Improved retro leave visibility so prior-period leave replacements can appear on the current open payslip even where the net gross change is zero.',
      'Moved Tax Details above Additional Earnings in the sidebar.',
      'Added Amount to Additional Earnings and introduced Overpayment Adjustment for the current open pay period only.',
      'Combined multiple current-period Regular Pay rows into one Regular Pay line where rate and position match.',
      'Removed the Date of Birth warning popup and made post-termination/contract-end calendar dates show as Non Rostered Day.'
    ]},
    {version:'v1.1.2',notes:[
      'Updated payslip Pay Summary so Current and YTD are rows and Gross, Tax and Net are columns.',
      'Fixed Additional Day descriptions and kept current-pay additional earnings/overtime on the same payslip instead of creating a separate payslip.',
      'Added financial-year YTD logic using payment date, so YTD resets after 30 June and sums payslips in the same Australian financial year.',
      'Updated SG to 12% of ordinary time earnings and added Employer Super Contribution Retro for prior-period super adjustments.',
      'Strengthened STSL handling so STSL calculates when the effective Tax Details record has STSL set to Yes.',
      'Improved retro line handling for prior-period leave and additional earnings so rows appear as Regular Pay Retro, Annual Leave Retro, Additional Day Retro, Overtime 1.5 Retro or Overtime 2.0 Retro.',
      'Prevented leave calendar bookings from overwriting Non Rostered Day and Public Holiday calendar markings.',
      'Prevented overlapping leave bookings for the same employee and date range.',
      'Added partial-day leave for single-day Annual Leave, Personal Leave and LWOP, with editable Absence Duration and scheduled-hours validation.',
      'Updated the Book Leave popup layout and moved Effective Date of Change to its own top line in Edit Employee Details.'
    ]},
    {version:'v1.1.1',notes:[
      'Added retro prior-processing cut-off of 03/05/2026 while preserving older service and commencement dates.',
      'Added Tax Details tab with effective-dated TFN, tax-free-threshold and STSL records, masked TFN reveal-on-hold, save/unsaved warning logic and payslip tax/STSL lines.',
      'Added personal details capture on commencement and effective-dated personal details updates/viewing from Employees.',
      'Removed LSL pro-rata from payslips while keeping LSL accrued and LSL entitlement date.',
      'Removed Super from Certification Report and placed View WA Public Holidays on a new Settings line.',
      'Added public holidays to the Absence Calendar key and calendar display.',
      'Added rehire reminder toast for personal and tax details.'
    ]},
    {version:'v1.1.0',notes:[
      'Restructured into separate GitHub Pages files: index.html, styles.css, app.js, payroll-engine.js, data-store.js and test-cases.js.',
      'Locked first pay cycle to PPE4/6/26, Period 22/5/26 - 4/6/26, Payment Date 4/6/26, Pay close 29/5/26.',
      'Added repeatable test cases for pay cycle, inclusive dates, retro, login/version strings and dropdown assumptions.',
      'Kept employee-selected Calculate Pay, Additional Earnings, Certification Report, Leave, Absence Calendar, Rehire, Extend Contract and manual Finalise Pay.'
    ]},
    {version:'v1.0.11',notes:['Emergency rebuild for login/version issues.']},
    {version:'v1.0.10',notes:['Attempted pay-cycle and retro fixes. Replaced by structured v1.1.0 project.']},
    {version:'v1.0.9',notes:['Added Additional Earnings, Rehire Employee, Extend Contract and Certification Report concepts.']}
  ];
  function openChangeNotes(){ modal('Change Notes', changeNotes.map(n=>`<div class="history-item"><strong>${esc(n.version)}</strong><ul>${n.notes.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`).join(''), '', false); }
  function openPublicHolidays(){ modal('Western Australia Public Holidays', table(['Date','Public Holiday'], E.PUBLIC_HOLIDAYS_WA.map(p=>[E.fmtPay(p[0]),esc(p[1])])), '', false); }
  function checkOvernightProcessing(manual){ const today=todayIso(); if(manual && state.lastOvernightDate===today) return alert('Overnight processing has already been checked today.'); if(manual && !confirm('If overnight processing should have run, do you want to run it now?')) return; state.lastOvernightDate=today; calculateAllForCurrent(); save(); if(manual) showProcessing('Overnight Processing in Progress',()=>{ log('Overnight processing checked/run. Pay was calculated but not finalised.'); renderAll(); }); }
  function openFinalisePay(){
    const c=currentCycle();
    confirmModal(`Are you sure you want to finalise the pay for ${E.ppeLabel(c)}?`, 'Yes', ()=>showProcessing('Pay Finalisation in Progress',()=>{
      try{
        const result=E.finaliseCurrentPay(state); save(); calculateAllForCurrent(); log(`Pay finalised for ${E.ppeLabel(result.finalisedCycle)}. Next pay opened: ${E.ppeLabel(result.nextCycle)}`); renderAll();
      }catch(err){ alert(err && err.message ? err.message : 'Pay finalisation failed.'); }
    }));
  }
  function showProcessing(title,callback){
    logout(); h('processingTitle',title); $('processingScreen').classList.add('open');
    setTimeout(()=>{ try{ if(callback) callback(); } finally{ $('processingScreen').classList.remove('open'); } }, 1600);
  }

  function openCalculateModal(){ modal('Calculate Pay', `<label>Select Employee</label><select id="calcEmp">${employeeOptions(activeEmployees())}</select>`, `<button id="calcCancel" class="secondary" data-close-modal>Cancel</button><button id="calcRun">Calculate</button>`, true); $('calcRun').addEventListener('click',()=>{ const id=v('calcEmp'); if(!id) return alert('Select an employee.'); closeModal(); loadingModal('Calculate Pay','Pay Run Successful',()=>{ calculateOne(id); log(`Calculate Pay run for ${E.employeeName(emp(id))}`); renderAll(); },800); }); }

  function exportData(){ save(); const blob=new Blob([DataStore.exportJson(state)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='payroll-app-data.json'; a.click(); log('Data exported'); }
  function importPreviewRows(nextState){
    const payslipCount = Object.values(nextState.payResults||{}).flat().length + (nextState.payslips||[]).length;
    const warnings=[];
    if(nextState.version && nextState.version !== APP_VERSION) warnings.push(`Imported file version is v${nextState.version}; this app is v${APP_VERSION}. It will be migrated on import.`);
    ['employees','schedules','payRates'].forEach(k=>{ if(!Array.isArray(nextState[k])) warnings.push(`Missing or invalid ${k} data.`); });
    return table(['Item','Count / Details'],[
      ['Imported file/app version',esc(nextState.version||'Unknown')],['Employees',String((nextState.employees||[]).length)],['Payslips / pay results',String(payslipCount)],['Leave bookings',String((nextState.leaveBookings||[]).length)],['Additional earnings entries',String((nextState.additionalEarnings||[]).length)],['Deduction entries',String((nextState.deductions||[]).filter(d=>d.deleted!==true).length)],['Tax detail records',String((nextState.taxDetails||[]).length)],['Job summary/change records',String((nextState.jobEvents||[]).length)],['Cash-out leave requests',String((nextState.cashOutRequests||[]).length)],['Warnings',warnings.length?warnings.map(esc).join('<br>'):'No warnings']
    ]);
  }
  function importData(event){
    const file=event.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=()=>{ try{ const imported=DataStore.importJson(reader.result); modal('Import Preview', `<p class="small-note">Review the file summary below. Your current data will only be replaced if you confirm.</p>${importPreviewRows(imported)}`, `<button id="confirmImport" class="danger">Import and Replace Data</button><button data-close-modal class="secondary">Cancel</button>`); $('confirmImport').addEventListener('click',()=>{ state=imported; save(); calculateAllForCurrent(); closeModal(); renderAll(); log('Data imported'); toast('Import Successful'); }); }catch(err){ alert('Import failed. Please select a valid payroll-app-data.json file.'); } };
    reader.readAsText(file); event.target.value='';
  }
  function todayIso(){ const d=new Date(); return E.iso(new Date(d.getFullYear(),d.getMonth(),d.getDate())); }

  window.PayrollApp = { getState:()=>state, renderAll, calculateAllForCurrent, login, statementOfServiceHtml, consolidatePayslipDisplayRows, payslipHtml };
})();
