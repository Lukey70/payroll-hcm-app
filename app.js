(function(){
  'use strict';
  const APP_VERSION = DataStore.APP_VERSION;
  const PASSWORD = '1234';
  let state = DataStore.load();
  let showTerminated = false;
  const showTerminatedByTab = { changeCentre:false, jobSummary:false, taxDetails:false, additionalEarnings:false, deductions:false, leave:false, absenceBalance:false, payslip:false };
  let leaveMonthOffset = 0;
  let leaveFilterEmp = '';
  let selectedPayslipKey = '';
  let selectedCalendarEmp = '';
  let selectedCalendarYear = null;
  let additionalPeriodOffset = 0;
  let additionalDraftRows = [];
  let additionalDirty = false;
  let selectedDeductionEmp = '';
  let deductionDraftRows = [];
  let deductionDirty = false;
  let deductionDraftLoadedFor = '';
  let taxDirty = false;
  let selectedTaxRecordId = '';
  let absenceEditing = false;
  let absenceDraft = null;
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
    ['mousemove','mousedown','keydown','touchstart','click'].forEach(evt=>document.addEventListener(evt, resetInactivityTimers, {passive:true}));
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

  function save(){ DataStore.save(state); }
  function toast(message, duration=2200){ h('toast', esc(message)); $('toast').classList.add('open'); setTimeout(()=>$('toast').classList.remove('open'), duration); }
  function log(message){ state.auditLog.unshift(new Date().toLocaleString('en-AU') + ' — ' + message); save(); renderAudit(); }
  function emp(id){ return state.employees.find(e=>e.id===id); }
  function currentCycle(){ return E.currentCycle(state); }
  function currentResults(){ return state.payResults[String(currentCycle().id)] || []; }
  function calculateAllForCurrent(){ state.payResults[String(currentCycle().id)] = E.calculateAll(state,currentCycle().id,false); save(); }
  function calculateOne(empId){
    const c = currentCycle();
    let results = state.payResults[String(c.id)] || [];
    results = results.filter(p=>p.empId !== empId).concat(E.calculateEmployee(state,empId,c.id,false));
    state.payResults[String(c.id)] = results;
    save();
  }
  function employeeDisplayStatus(e){
    if(e && e.terminationDate && E.compare(todayIso(), e.terminationDate)>0) return 'Terminated';
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
  function loadingModal(title, doneMessage, callback, delay=900){
    modal(title, `<div class="spinner"></div><p class="muted">Please wait...</p>`, '', true);
    setTimeout(()=>{ callback && callback(); modal(title, `<p class="success-text"><strong>${esc(doneMessage)}</strong></p>`, `<button type="button" data-close-modal>Close</button>`, true); }, delay);
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
    if(leavingDeductions){ selectedDeductionEmp=''; deductionDraftRows=[]; deductionDirty=false; deductionDraftLoadedFor=''; }
    if(leavingPayslip){ selectedPayslipKey=''; h('payslipContent',''); }
    document.querySelectorAll('.tab-section').forEach(s=>s.classList.remove('active'));
    $(tab).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
    if(btn) btn.classList.add('active');
    if(tab==='additionalEarnings') loadAdditionalDraft();
    if(tab==='deductions') renderDeductions();
    if(tab==='taxDetails') renderTaxDetails();
    if(tab==='certification') renderCertification();
    if(tab==='payslip') renderPayslip();
  }

  function renderAll(){
    renderMetrics(); renderEmployees(); renderChangeCentre(); renderJobSummary(); renderAdditionalEarnings(); renderTaxDetails(); renderDeductions(); renderLeave(); renderAbsenceBalance(); renderPayslip(); renderCertification(); renderAudit(); renderSettings();
  }
  function renderMetrics(){
    const c = currentCycle();
    const results = currentResults();
    h('versionLabel', `v${APP_VERSION}`);
    h('metricEmployees', String(state.employees.length));
    h('metricGross', E.money(results.reduce((s,p)=>s+p.gross,0)));
    h('metricRetro', E.money(results.reduce((s,p)=>s+p.retro,0)));
    h('metricPayStatus', `${E.ppeLabel(c)}<small>Period: ${E.fmtPay(c.start)} - ${E.fmtPay(c.end)}<br>Payment Date: ${E.fmtPay(c.paymentDate)}<br>Pay close: ${E.fmtPay(c.closeDate)}</small>`);
  }

  function renderEmployees(){
    const list = state.employees.filter(e=>showTerminated || employeeDisplayStatus(e) !== 'Terminated');
    h('employees', `<h2>Employees</h2><p class="small-note">Employee IDs auto-generate. Fixed-term contract end dates are treated as expected termination dates.</p><div class="controls"><button id="addEmployeeBtn">Add New Employee</button><button id="rehireBtn" class="secondary">Rehire Employee</button><button id="extendContractBtn" class="secondary">Extend Contract</button><button id="terminationBtn" class="secondary">Process Termination</button><button id="toggleTerminatedBtn" class="ghost">${showTerminated?'Hide':'Show'} Terminated Employees</button></div><div id="employeesTable"></div>`);
    h('employeesTable', table(['ID','First Name','Last Name','Type','Department','Position','Start','Termination / Contract End','Rate','Status','Actions'], list.map(e=>[
      esc(e.id), esc(e.firstName||''), esc(e.lastName||''), esc(e.type||''), esc(e.department||''), esc(e.position||''), E.fmtPay(e.startDate), (e.terminationDate||e.contractEndDate)?`${E.fmtPay(e.terminationDate||e.contractEndDate)}<br>${esc(e.terminationReason|| (e.type==='Fixed Term'?'Expected fixed-term end':''))}`:'', E.money(e.hourlyRate), badge(employeeDisplayStatus(e)), `<button class="icon-btn" data-edit-details="${esc(e.id)}" title="Edit personal details">✏️</button> <button class="icon-btn" data-view-personal="${esc(e.id)}" title="View current personal details">👁️</button> <button class="icon-btn" data-view-schedule="${esc(e.id)}" title="View schedule">📅</button>`
    ])));
    $('addEmployeeBtn').addEventListener('click', openAddEmployee);
    $('rehireBtn').addEventListener('click', openRehire);
    $('extendContractBtn').addEventListener('click', openExtendContract);
    $('terminationBtn').addEventListener('click', openTermination);
    $('toggleTerminatedBtn').addEventListener('click', ()=>{ showTerminated=!showTerminated; renderEmployees(); });
    document.querySelectorAll('[data-edit-details]').forEach(b=>b.addEventListener('click',()=>openEditEmployeeDetails(b.dataset.editDetails)));
    document.querySelectorAll('[data-view-personal]').forEach(b=>b.addEventListener('click',()=>openPersonalDetailsView(b.dataset.viewPersonal)));
    document.querySelectorAll('[data-view-schedule]').forEach(b=>b.addEventListener('click',()=>openScheduleView(b.dataset.viewSchedule)));
  }
  function nextEmployeeId(){ let max=0; state.employees.forEach(e=>{ const m=String(e.id).match(/\d+/); if(m) max=Math.max(max,Number(m[0])); }); return String(max+1).padStart(6,'0'); }
  function scheduleInputs(prefix){
    return `<div class="grid day-grid"><div><label>Monday Hours</label><input id="${prefix}Mon" type="number" step="0.01"></div><div><label>Tuesday Hours</label><input id="${prefix}Tue" type="number" step="0.01"></div><div><label>Wednesday Hours</label><input id="${prefix}Wed" type="number" step="0.01"></div><div><label>Thursday Hours</label><input id="${prefix}Thu" type="number" step="0.01"></div><div><label>Friday Hours</label><input id="${prefix}Fri" type="number" step="0.01"></div><div><label>Saturday Hours</label><input id="${prefix}Sat" type="number" step="0.01"></div><div><label>Sunday Hours</label><input id="${prefix}Sun" type="number" step="0.01"></div></div>`;
  }
  function getSchedule(prefix){ return {1:Number(v(`${prefix}Mon`)||0),2:Number(v(`${prefix}Tue`)||0),3:Number(v(`${prefix}Wed`)||0),4:Number(v(`${prefix}Thu`)||0),5:Number(v(`${prefix}Fri`)||0),6:Number(v(`${prefix}Sat`)||0),0:Number(v(`${prefix}Sun`)||0)}; }
  function weeklyHours(map){ return Object.values(map||{}).reduce((s,x)=>s+Number(x||0),0); }
  function autoInitialLeaveBalances(startDate, schedule){
    if(!startDate) return {annual:0, personal:0};
    const from = E.compare(startDate, E.RETRO_PROCESSING_START) < 0 ? E.RETRO_PROCESSING_START : startDate;
    const to = E.addDays(currentCycle().start,-1);
    if(E.compare(from,to)>0) return {annual:0, personal:0};
    let ordinary = 0;
    E.daysBetween(from,to).forEach(d=>{ ordinary += Number((schedule||{})[E.parseDate(d).getDay()]||0); });
    return { annual:E.round4(ordinary*4/52), personal:E.round4(ordinary*3/52) };
  }
  function refreshAutoLeaveBalance(prefix){
    if(!$(`${prefix}AL`) || !$(`${prefix}PL`)) return;
    const b = autoInitialLeaveBalances(v(`${prefix}Start`) || v(`${prefix}rehireStart`), getSchedule(prefix));
    setv(`${prefix}AL`, b.annual.toFixed(2));
    setv(`${prefix}PL`, b.personal.toFixed(2));
  }
  function openAddEmployee(){
    modal('Commence New Employee', `<div class="grid form-grid"><div><label>Employee ID</label><input id="newId" readonly value="${nextEmployeeId()}"></div><div><label>First Name</label><input id="newFirst" autocomplete="given-name"></div><div><label>Last Name</label><input id="newLast" autocomplete="family-name"></div><div><label>Department</label><input id="newDepartment"></div><div><label>Position</label><input id="newPosition"></div><div><label>Employment Type</label><select id="newType"><option value="">Select</option><option>Permanent</option><option>Fixed Term</option><option>Casual</option></select></div><div><label>Start Date</label><input id="newStart" type="date"></div><div><label>Contract End Date</label><input id="newContractEnd" type="date" disabled></div><div><label>Auto Terminate?</label><select id="newAutoTerm" disabled><option value="false">No</option><option value="true">Yes</option></select></div><div><label>Hourly Rate</label><input id="newRate" type="number" step="0.01"></div><div><label>Annual Leave Balance (Hours)</label><input id="newAL" type="number" step="0.01" readonly class="readonly" value="0.00"></div><div><label>Personal Leave Balance (Hours)</label><input id="newPL" type="number" step="0.01" readonly class="readonly" value="0.00"></div></div><div class="divider"></div><h3>Personal Details</h3><div class="grid form-grid"><div><label>Date of Birth</label><input id="newDOB" type="date"></div><div><label>Email</label><input id="newEmail" type="email" autocomplete="email"></div><div><label>Phone number</label><input id="newPhone" type="tel" autocomplete="tel"></div><div><label>Address</label><input id="newAddress" autocomplete="street-address" placeholder="Start typing address"></div></div><div class="divider"></div><h3>Tax Details</h3><div class="grid form-grid"><div><label>Effective Date</label><input id="newTaxEffective" type="date" readonly class="readonly"></div><div><label>Tax File Number</label><input id="newTaxFileNumber" type="password"></div><div><label>Claim Tax Free Threshold</label><select id="newTaxThreshold"><option value="true">Yes</option><option value="false">No</option></select></div><div><label>STSL</label><select id="newTaxStsl"><option value="false">No</option><option value="true">Yes</option></select></div></div><div class="divider"></div><h3>Starting Work Schedule</h3>${scheduleInputs('new')}`, `<button id="saveNewEmployee">Commence Employee</button>`, false);
    $('newType').addEventListener('change',()=>toggleContractFields('newType','newContractEnd','newAutoTerm'));
    $('newStart').addEventListener('change',()=>{ setv('newTaxEffective',v('newStart')); refreshAutoLeaveBalance('new'); });
    ['newMon','newTue','newWed','newThu','newFri','newSat','newSun'].forEach(id=>$(id).addEventListener('input',()=>refreshAutoLeaveBalance('new')));
    $('saveNewEmployee').addEventListener('click', saveNewEmployee);
  }
  function toggleContractFields(typeId,endId,autoId){
    const allowed = v(typeId)==='Fixed Term';
    $(endId).disabled = !allowed; $(autoId).disabled = !allowed;
    if(allowed){ setv(autoId,'true'); } else { setv(endId,''); setv(autoId,'false'); }
  }
  function saveNewEmployee(){
    const type = v('newType'); const start = v('newStart'); const sched = getSchedule('new');
    if(!v('newFirst').trim() || !v('newLast').trim()) return alert('Enter first and last name.');
    if(!type) return alert('Select employment type.');
    if(type==='Permanent' && v('newContractEnd')) return alert('Permanent employees cannot have a contract end date.');
    if(!start) return alert('Enter a start date.');
    if(weeklyHours(sched)<=0) return alert('Enter at least one work day/hour.');
    const personal = { id:uid('personal'), effectiveDate:start, dateOfBirth:v('newDOB'), email:v('newEmail'), phone:v('newPhone'), address:v('newAddress') };
    const autoBalances = autoInitialLeaveBalances(start, sched);
    const e = { id:v('newId'), firstName:v('newFirst').trim(), lastName:v('newLast').trim(), name:`${v('newFirst').trim()} ${v('newLast').trim()}`, department:v('newDepartment'), position:v('newPosition'), type, startDate:start, originalStartDate:start, lslServiceDate:start, contractEndDate:type==='Fixed Term'?v('newContractEnd'):'', autoTerminate:type==='Fixed Term'&&v('newAutoTerm')==='true', hourlyRate:Number(v('newRate')||0), annualLeaveBalance:autoBalances.annual, personalLeaveBalance:autoBalances.personal, lslAccruedBalance:0, dateOfBirth:personal.dateOfBirth, email:personal.email, phone:personal.phone, address:personal.address, personalDetailsHistory:[personal], status:'Active' };
    state.employees.push(e);
    const rateId=uid('rate'), schedId=uid('schedule');
    state.payRates.push({ id:rateId, empId:e.id, changeType:'Permanent', effectiveDate:start, endDate:'', position:e.position, hourlyRate:e.hourlyRate });
    state.schedules.push({ id:schedId, empId:e.id, effectiveDate:start, hoursByDay:sched });
    addJobEvent(e.id,'Commencement',start,'Employee commenced','employee',e.id);
    addJobEvent(e.id,'Position/Pay Rate',start,`${e.position} — ${E.money(e.hourlyRate)}`,'rate',rateId);
    addJobEvent(e.id,'Schedule',start,`Starting schedule ${weeklyHours(sched).toFixed(2)} hours/week`,'schedule',schedId);
    addJobEvent(e.id,'Personal Details',start,'Personal details recorded','employee',e.id);
    state.taxDetails.push({ id:uid('tax'), empId:e.id, effectiveDate:start, taxFileNumber:v('newTaxFileNumber'), claimTaxFreeThreshold:v('newTaxThreshold')==='true', stsl:v('newTaxStsl')==='true' });
    addJobEvent(e.id,'Tax Details',start,'Initial tax details recorded','tax',state.taxDetails[state.taxDetails.length-1].id);
    save(); closeModal(); calculateAllForCurrent(); log(`Employee commenced: ${E.employeeName(e)}`); renderAll(); toast(`Please complete Tax Details for ${E.employeeName(e)}`, 15000);
  }
  function addJobEvent(empId,type,effectiveDate,description,refKind,refId){ state.jobEvents.push({ id:uid('job'), empId, type, effectiveDate, description, refKind, refId }); }

  function openEditEmployeeDetails(empId){
    const e=emp(empId); if(!e) return;
    modal('Edit Employee Details', `<input id="editDetailsId" type="hidden" value="${esc(empId)}"><div class="grid form-grid"><div class="full-line"><label>Effective Date of Change</label><input id="editDetailsEffective" type="date" value="${esc(todayIso())}"></div><div><label>First Name</label><input id="editFirst" value="${esc(e.firstName||'')}" autocomplete="given-name"></div><div><label>Last Name</label><input id="editLast" value="${esc(e.lastName||'')}" autocomplete="family-name"></div><div><label>Date of Birth</label><input id="editDOB" type="date" value="${esc(e.dateOfBirth||'')}"></div><div><label>Email</label><input id="editEmail" type="email" value="${esc(e.email||'')}" autocomplete="email"></div><div><label>Phone number</label><input id="editPhone" type="tel" value="${esc(e.phone||'')}" autocomplete="tel"></div><div><label>Address</label><input id="editAddress" value="${esc(e.address||'')}" autocomplete="street-address"></div></div>`, `<button id="saveDetails">Save Details</button>`, true);
    $('saveDetails').addEventListener('click',()=>{
      if(!v('editDetailsEffective')) return alert('Enter an effective date.');
      e.firstName=v('editFirst').trim(); e.lastName=v('editLast').trim(); e.name=`${e.firstName} ${e.lastName}`.trim();
      e.dateOfBirth=v('editDOB'); e.email=v('editEmail'); e.phone=v('editPhone'); e.address=v('editAddress');
      if(!Array.isArray(e.personalDetailsHistory)) e.personalDetailsHistory=[];
      e.personalDetailsHistory.push({ id:uid('personal'), effectiveDate:v('editDetailsEffective'), dateOfBirth:e.dateOfBirth, email:e.email, phone:e.phone, address:e.address });
      addJobEvent(e.id,'Personal Details Change',v('editDetailsEffective'),'Personal details updated','employee',e.id);
      save(); closeModal(); log('Employee personal details updated'); renderAll();
    });
  }
  function openPersonalDetailsView(empId){
    const e=emp(empId); if(!e) return;
    const body = `<div class="personal-card"><p><strong>${esc(E.employeeName(e))}</strong></p><p><strong>Date of Birth:</strong> ${esc(e.dateOfBirth||'')}</p><p><strong>Email:</strong> ${esc(e.email||'')}</p><p><strong>Phone number:</strong> ${esc(e.phone||'')}</p><p><strong>Address:</strong> ${esc(e.address||'')}</p></div>`;
    modal('Current Personal Details', body, '', true);
  }
  function openScheduleView(empId){ const e=emp(empId); const s=E.activeSchedule(state,empId,currentCycle().start) || state.schedules.filter(x=>x.empId===empId).sort((a,b)=>E.compare(b.effectiveDate,a.effectiveDate))[0]; const rows=s? [['Monday',s.hoursByDay[1]||0],['Tuesday',s.hoursByDay[2]||0],['Wednesday',s.hoursByDay[3]||0],['Thursday',s.hoursByDay[4]||0],['Friday',s.hoursByDay[5]||0],['Saturday',s.hoursByDay[6]||0],['Sunday',s.hoursByDay[0]||0]]:[]; modal('Current Work Schedule', `<p><strong>${esc(E.employeeName(e))}</strong></p>${s?`<p><strong>Effective date:</strong> ${E.fmtPay(s.effectiveDate)}</p>${table(['Day','Hours'],rows)}`:'<p>No schedule found.</p>'}`, '', true); }

  function openRehire(){
    const terms = state.employees.filter(e=>employeeDisplayStatus(e)==='Terminated');
    modal('Rehire Employee', `<div class="grid form-grid"><div><label>Terminated Employee</label><select id="rehireEmp">${employeeOptions(terms)}</select></div><div><label>Employee ID</label><input id="rehireId" readonly></div><div><label>First Name</label><input id="rehireFirst" readonly></div><div><label>Last Name</label><input id="rehireLast" readonly></div><div><label>New Start Date</label><input id="rehireStart" type="date"></div><div><label>Employment Type</label><select id="rehireType"><option>Permanent</option><option>Fixed Term</option></select></div><div><label>Contract End Date</label><input id="rehireContractEnd" type="date" disabled></div><div><label>Auto Terminate?</label><select id="rehireAutoTerm" disabled><option value="false">No</option><option value="true">Yes</option></select></div><div><label>Department</label><input id="rehireDept"></div><div><label>Position</label><input id="rehirePosition"></div><div><label>Hourly Rate</label><input id="rehireRate" type="number" step="0.01"></div><div><label>Annual Leave Balance (Hours)</label><input id="rehireAL" type="number" step="0.01" readonly class="readonly" value="0.00"></div><div><label>Personal Leave Balance (Hours)</label><input id="rehirePL" type="number" step="0.01" readonly class="readonly" value="0.00"></div></div><div class="divider"></div><h3>New Work Schedule</h3>${scheduleInputs('rehire')}`, `<button id="saveRehire">Rehire Employee</button>`, false);
    const populate=()=>{ const e=emp(v('rehireEmp'))||{}; setv('rehireId',e.id); setv('rehireFirst',e.firstName); setv('rehireLast',e.lastName); setv('rehireDept',e.department); setv('rehirePosition',e.position); setv('rehireRate',e.hourlyRate); };
    $('rehireEmp').addEventListener('change',populate); $('rehireType').addEventListener('change',()=>toggleContractFields('rehireType','rehireContractEnd','rehireAutoTerm')); $('rehireStart').addEventListener('change',()=>refreshAutoLeaveBalance('rehire')); ['rehireMon','rehireTue','rehireWed','rehireThu','rehireFri','rehireSat','rehireSun'].forEach(id=>$(id).addEventListener('input',()=>refreshAutoLeaveBalance('rehire'))); populate(); toggleContractFields('rehireType','rehireContractEnd','rehireAutoTerm'); $('saveRehire').addEventListener('click',saveRehire);
  }
  function saveRehire(){ const e=emp(v('rehireEmp')); if(!e) return alert('Select a terminated employee.'); const start=v('rehireStart'); const sched=getSchedule('rehire'); const type=v('rehireType'); if(!start) return alert('Enter a new start date.'); if(type==='Fixed Term' && !v('rehireContractEnd')) return alert('Fixed-term rehires require a contract end date.'); if(weeklyHours(sched)<=0) return alert('Enter a work schedule.'); const oldTerm=e.terminationDate; e.status='Active'; e.startDate=start; e.lslServiceDate=start; e.lslEntitlementDateOverride=''; e.lslProRataOverride=''; e.type=type; e.contractEndDate=type==='Fixed Term'?v('rehireContractEnd'):''; e.autoTerminate=type==='Fixed Term'; e.terminationDate=''; e.terminationReason=''; e.department=v('rehireDept')||e.department; e.position=v('rehirePosition')||e.position; e.hourlyRate=Number(v('rehireRate')||e.hourlyRate||0); const autoBalances=autoInitialLeaveBalances(start,sched); e.annualLeaveBalance=autoBalances.annual; e.personalLeaveBalance=autoBalances.personal; e.lslAccruedBalance=0; const rateId=uid('rate'), schedId=uid('schedule'); state.payRates.push({id:rateId,empId:e.id,changeType:'Permanent',effectiveDate:start,endDate:'',position:e.position,hourlyRate:e.hourlyRate}); state.schedules.push({id:schedId,empId:e.id,effectiveDate:start,hoursByDay:sched}); addJobEvent(e.id,'Rehire',start,`Employee rehired. Previous termination ${E.fmtPay(oldTerm)}`,'employee',e.id); addJobEvent(e.id,'Employment Type',start,`${type}${e.contractEndDate?` — Contract end ${E.fmtPay(e.contractEndDate)}`:''}`,'employee',e.id); addJobEvent(e.id,'Position/Pay Rate',start,`${e.position} — ${E.money(e.hourlyRate)}`,'rate',rateId); addJobEvent(e.id,'Schedule',start,`Rehire schedule ${weeklyHours(sched).toFixed(2)} hours/week`,'schedule',schedId); save(); closeModal(); calculateAllForCurrent(); log(`Employee rehired: ${E.employeeName(e)}`); renderAll(); toast("Employee's personal and tax details may have changed since last employment. Please update if necessary", 15000); }
  function openExtendContract(){ const fixed=state.employees.filter(e=>e.type==='Fixed Term'); modal('Extend Contract', `<div class="grid form-grid"><div><label>Fixed-Term Employee</label><select id="extendEmp">${employeeOptions(fixed)}</select></div><div><label>New Contract End Date</label><input id="extendEnd" type="date"></div></div>`, `<button id="saveExtend">Save Contract Extension</button>`, true); $('saveExtend').addEventListener('click',()=>{ const e=emp(v('extendEmp')); if(!e) return alert('Select a fixed-term employee.'); if(!v('extendEnd')) return alert('Enter a new contract end date.'); const old=e.contractEndDate; e.contractEndDate=v('extendEnd'); e.status='Active'; e.terminationDate=''; e.terminationReason=''; addJobEvent(e.id,'New Fixed Term Contract',v('extendEnd'),`Contract extended from ${E.fmtPay(old)} to ${E.fmtPay(v('extendEnd'))}`,'employee',e.id); save(); closeModal(); log(`Contract extended for ${E.employeeName(e)}`); renderAll(); }); }
  function openTermination(){ modal('Process Termination', `<div class="grid form-grid"><div><label>Employee</label><select id="termEmp">${employeeOptions(activeEmployees())}</select></div><div><label>Last Working Date</label><input id="termDate" type="date"></div><div><label>Reason for Termination</label><select id="termReason"><option>Voluntary - Resignation</option><option>Voluntary - Retirement</option></select></div></div>`, `<button id="saveTermination" class="danger">Terminate Employee</button>`, true); $('saveTermination').addEventListener('click',()=>{ const e=emp(v('termEmp')); if(!e) return alert('Select employee.'); if(!v('termDate')) return alert('Enter last working date.'); e.terminationDate=v('termDate'); e.terminationReason=v('termReason'); e.status = E.compare(todayIso(), e.terminationDate)>0 ? 'Terminated' : 'Active'; addJobEvent(e.id,'Termination',e.terminationDate,e.terminationReason,'employee',e.id); save(); closeModal(); calculateAllForCurrent(); log(`Termination processed for ${E.employeeName(e)}`); renderAll(); }); }

  function renderChangeCentre(){
    const empOpts = employeeOptions(employeeList(showTerminatedByTab.changeCentre));
    h('changeCentre', `<h2>Change Centre</h2><p class="small-note">Use this tab for master data, position/pay and work schedule changes. Backdated changes will calculate retro when required.</p><div class="controls">${showTerminatedControl('ccShowTerminated','changeCentre')}</div><h3>Employee master change</h3><div class="grid form-grid"><div><label>Employee</label><select id="editEmp">${empOpts}</select></div><div><label>Start Date</label><input id="editStart" type="date"></div><div><label>Employment Type</label><select id="editType"><option>Permanent</option><option>Fixed Term</option><option>Casual</option></select></div><div><label>Contract End Date</label><input id="editContractEnd" type="date"></div><div><label>Auto Terminate?</label><select id="editAutoTerm"><option value="false">No</option><option value="true">Yes</option></select></div><div><label>Status</label><select id="editStatus"><option>Active</option><option>Terminated</option></select></div></div><div class="controls" style="margin-top:14px"><button id="saveMasterChange">Save Master Change</button></div><div class="divider"></div><h3>Position / pay rate change</h3><div class="grid form-grid"><div><label>Employee</label><select id="rateEmp">${empOpts}</select></div><div><label>Change Type</label><select id="rateType"><option>Permanent</option><option>Temporary</option></select></div><div><label>Effective Date</label><input id="rateStart" type="date"></div><div><label>Temporary End Date</label><input id="rateEnd" type="date" disabled></div><div><label>New Position</label><input id="ratePosition"></div><div><label>New Hourly Rate</label><input id="rateAmount" type="number" step="0.01"></div></div><div class="controls" style="margin-top:14px"><button id="saveRateChange">Add Position/Pay Change</button></div><div class="divider"></div><h3>Work schedule change</h3><div class="grid form-grid"><div><label>Employee</label><select id="schedEmp">${empOpts}</select></div><div><label>Effective Date</label><input id="schedStart" type="date"></div></div>${scheduleInputs('sched')}<div class="controls" style="margin-top:14px"><button id="saveScheduleChange">Add Schedule Change</button></div>`);
    $('rateType').addEventListener('change',()=>{ $('rateEnd').disabled = v('rateType') !== 'Temporary'; if(v('rateType')!=='Temporary') setv('rateEnd',''); });
    $('editType').addEventListener('change',()=>toggleContractFields('editType','editContractEnd','editAutoTerm'));
    $('saveMasterChange').addEventListener('click',saveMasterChange); $('saveRateChange').addEventListener('click',saveRateChange); $('saveScheduleChange').addEventListener('click',saveScheduleChange); bindShowTerminated('ccShowTerminated','changeCentre',renderChangeCentre);
  }
  function saveMasterChange(){ const e=emp(v('editEmp')); if(!e) return alert('Select employee.'); const type=v('editType'); if(type==='Permanent'&&v('editContractEnd')) return alert('Permanent employees cannot have a contract end date.'); e.startDate=v('editStart')||e.startDate; e.type=type; e.contractEndDate=type==='Fixed Term'?v('editContractEnd'):''; e.autoTerminate=type==='Fixed Term'&&v('editAutoTerm')==='true'; e.status=(e.terminationDate&&E.compare(todayIso(),e.terminationDate)<=0)?'Active':v('editStatus'); addJobEvent(e.id,'Master Change',e.startDate,`Employment/status updated to ${e.type}/${e.status}`,'employee',e.id); save(); calculateAllForCurrent(); log('Employee master updated'); renderAll(); }
  function saveRateChange(){ const empId=v('rateEmp'); if(!empId || !v('rateStart') || !v('ratePosition') || !v('rateAmount')) return alert('Complete all pay change fields.'); if(v('rateType')==='Temporary' && !v('rateEnd')) return alert('Temporary changes require an end date.'); const id=uid('rate'); state.payRates.push({id,empId,changeType:v('rateType'),effectiveDate:v('rateStart'),endDate:v('rateType')==='Temporary'?v('rateEnd'):'',position:v('ratePosition'),hourlyRate:Number(v('rateAmount'))}); addJobEvent(empId,'Position/Pay Rate',v('rateStart'),`${v('rateType')} — ${v('ratePosition')} — ${E.money(v('rateAmount'))}`,'rate',id); save(); calculateAllForCurrent(); log('Position/pay rate change added'); renderAll(); }
  function saveScheduleChange(){ const empId=v('schedEmp'); const sched=getSchedule('sched'); if(!empId || !v('schedStart') || weeklyHours(sched)<=0) return alert('Complete employee, effective date and schedule hours.'); const id=uid('schedule'); state.schedules.push({id,empId,effectiveDate:v('schedStart'),hoursByDay:sched}); addJobEvent(empId,'Schedule',v('schedStart'),`Schedule changed to ${weeklyHours(sched).toFixed(2)} hours/week`,'schedule',id); save(); calculateAllForCurrent(); log('Schedule change added'); renderAll(); }

  function renderJobSummary(){
    h('jobSummary', `<h2>Job Summary</h2><p class="small-note">Shows employee/job record changes only. Leave bookings are not shown here.</p><div class="controls">${showTerminatedControl('jobShowTerminated','jobSummary')}</div><div class="grid form-grid"><div><label>Employee</label><select id="jobEmp">${employeeOptions(employeeList(showTerminatedByTab.jobSummary))}</select></div></div><div id="jobOutput"></div>`);
    bindShowTerminated('jobShowTerminated','jobSummary',renderJobSummary); $('jobEmp').addEventListener('change',renderJobOutput); renderJobOutput();
  }
  function renderJobOutput(){ const id=v('jobEmp'); if(!id){ h('jobOutput','<p class="small-note">Select an employee.</p>'); return; } const rows=[]; state.jobEvents.filter(x=>x.empId===id).forEach(x=>rows.push({kind:x.refKind||'event',id:x.refId||x.id,effectiveDate:x.effectiveDate,type:x.type,description:x.description,eventId:x.id})); state.payRates.filter(x=>x.empId===id&&!rows.some(r=>r.id===x.id)).forEach(x=>rows.push({kind:'rate',id:x.id,effectiveDate:x.effectiveDate,type:'Position/Pay Rate',description:`${x.changeType} — ${x.position} — ${E.money(x.hourlyRate)}`})); state.schedules.filter(x=>x.empId===id&&!rows.some(r=>r.id===x.id)).forEach(x=>rows.push({kind:'schedule',id:x.id,effectiveDate:x.effectiveDate,type:'Schedule',description:`${weeklyHours(x.hoursByDay).toFixed(2)} hours/week`})); rows.sort((a,b)=>E.compare(b.effectiveDate,a.effectiveDate)); h('jobOutput', table(['Effective Date','Type','Description','Action'], rows.map(r=>[E.fmtPay(r.effectiveDate),esc(r.type),esc(r.description),`<button class="danger" data-del-job="${esc(r.kind)}|${esc(r.id)}|${esc(r.eventId||'')}">Delete</button>`]))); document.querySelectorAll('[data-del-job]').forEach(b=>b.addEventListener('click',()=>{ const [kind,id,eventId]=b.dataset.delJob.split('|'); confirmModal('Are you sure you want to delete this entry? This may result in pay recalculations','Yes',()=>deleteJobEntry(kind,id,eventId)); })); }
  function deleteJobEntry(kind,id,eventId){ if(kind==='rate') state.payRates=state.payRates.filter(x=>x.id!==id); if(kind==='schedule') state.schedules=state.schedules.filter(x=>x.id!==id); if(eventId) state.jobEvents=state.jobEvents.filter(x=>x.id!==eventId); state.jobEvents=state.jobEvents.filter(x=>x.refId!==id); save(); calculateAllForCurrent(); log('Job Summary entry deleted. Recalculation applied.'); renderAll(); }

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
    if((a.earningType||'')==='Overpayment Adjustment') return Number(a.amount||0);
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
      const amount=additionalDraftAmount(a);
      return [`<select data-add-field="${i}|earningType"><option ${a.earningType==='Additional Day'?'selected':''}>Additional Day</option><option ${a.earningType==='Overtime 1.5'?'selected':''}>Overtime 1.5</option><option ${a.earningType==='Overtime 2.0'?'selected':''}>Overtime 2.0</option><option ${a.earningType==='Overpayment Adjustment'?'selected':''}>Overpayment Adjustment</option></select>`,`<input type="date" min="${esc(c.start)}" max="${esc(c.end)}" value="${esc(isOver?c.start:(a.startDate||''))}" ${isOver?'readonly class="readonly"':''} data-add-field="${i}|startDate">`,`<input type="date" min="${esc(c.start)}" max="${esc(c.end)}" value="${esc(isOver?c.end:(a.endDate||''))}" ${isOver?'readonly class="readonly"':''} data-add-field="${i}|endDate">`,`<input type="number" step="0.01" value="${esc(isOver?0:(a.hours||0))}" ${isOver?'readonly class="readonly"':''} data-add-field="${i}|hours">`,`<input type="number" step="0.01" value="${esc(amount)}" ${isOver?'':'readonly class="readonly"'} data-add-field="${i}|amount">`,`<button class="danger" data-del-add="${esc(a.id)}">Delete</button>`];
    });
    h('addRows', table(['Earnings Type','Start Date','End Date','Hours','Amount','Delete'], rows));
    document.querySelectorAll('[data-add-field]').forEach(el=>el.addEventListener('change',()=>{
      const [i,field]=el.dataset.addField.split('|'); const row=additionalDraftRows[Number(i)];
      if(field==='earningType' && el.value==='Overpayment Adjustment' && Number(additionalCycle().id)!==Number(currentCycle().id)){ el.value=row.earningType||'Additional Day'; return alert('Overpayment Adjustment can only be entered in the current open pay period.'); }
      row[field]=(field==='hours'||field==='amount')?Number(el.value||0):el.value;
      if(field==='earningType' && row.earningType==='Overpayment Adjustment'){ row.hours=0; row.startDate=c.start; row.endDate=c.end; row.amount=0; }
      if(field==='startDate' && row.earningType!=='Overpayment Adjustment') row.endDate=el.value;
      if(row.earningType!=='Overpayment Adjustment') row.amount=additionalDraftAmount(row);
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
        else row.amount=additionalDraftAmount(row);
        state.additionalEarnings.push(row);
      });
      additionalDirty=false; save(); calculateAllForCurrent(); renderAll();
    },700);
  }


  function deductionCycleOptions(kind='start', selected=''){
    const curIdx = E.PAY_CYCLES.findIndex(c=>c.id===currentCycle().id);
    return E.PAY_CYCLES.slice(curIdx, Math.min(E.PAY_CYCLES.length, curIdx+26)).map(c=>{
      const val = kind === 'end' ? c.end : c.start;
      return `<option value="${esc(val)}" ${selected===val?'selected':''}>${E.cycleDisplay(c)}</option>`;
    }).join('');
  }
  function renderDeductions(){
    h('deductions', `<h2>Deductions</h2><p id="deductionsNote" class="small-note">Use this tab for pre-tax and post-tax super deductions. Deductions can start in the current or a future pay period only.</p><div class="controls">${showTerminatedControl('dedShowTerminated','deductions')}</div><div class="grid form-grid"><div><label>Employee</label><select id="dedEmp">${employeeOptions(employeeList(showTerminatedByTab.deductions))}</select></div></div><div class="controls" style="margin-top:14px"><button id="addDeductionBtn">Add New Deduction</button></div><div id="deductionsTable"></div><div class="save-row"><button id="saveDeductionsBtn">Save</button></div>`);
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
  function deductionCanDelete(d){ return !E.isFinalised(state,currentCycle()) && E.compare(d.startDate,currentCycle().end)<=0 && (!d.endDate || E.compare(d.endDate,currentCycle().start)>=0); }
  function renderDeductionsTable(){
    const empId=selectedDeductionEmp || v('dedEmp'); if(!$('deductionsTable')) return; if(!empId){ h('deductionsTable','<p class="small-note">Select an employee.</p>'); h('deductionsNote','Use this tab for pre-tax and post-tax super deductions. Deductions can start in the current or a future pay period only.'); return; }
    h('deductionsNote', deductionDirty?'Unsaved changes. Deduction changes will not update Job Summary, payroll calculations or payslips until Save is pressed.':'Use this tab for pre-tax and post-tax super deductions. Deductions can start in the current or a future pay period only.');
    const rows=(deductionDraftRows||[]).filter(d=>d.empId===empId && d.deleted!==true).sort((a,b)=>E.compare(a.startDate,b.startDate)).map(d=>{
      const endCell=deductionCanEditEnd(d)?`<select data-ded-end="${esc(d.id)}"><option value="" ${!d.endDate?'selected':''}></option>${deductionCycleOptions('end',d.endDate||'')}</select>`:E.fmtPay(d.endDate);
      const amountCell=d.amount!==''&&d.amount!=null?E.money(d.amount):'<span class="muted">—</span>';
      const percentageCell=d.percentage!==''&&d.percentage!=null?`${Number(d.percentage).toFixed(2)}%`:'<span class="muted">—</span>';
      return [esc(d.deductionType),E.fmtPay(d.startDate),endCell,amountCell,percentageCell,deductionCanDelete(d)?`<button class="danger" data-del-ded="${esc(d.id)}">Delete</button>`:'<span class="muted">Locked after finalised/current period</span>'];
    });
    h('deductionsTable', rows.length?table(['Deduction Type','Start Date','End Date','Amount','Percentage','Delete'],rows):'<p class="small-note">No deductions recorded for this employee.</p>');
    document.querySelectorAll('[data-ded-end]').forEach(el=>el.addEventListener('change',()=>stageDeductionEnd(el.dataset.dedEnd,el.value)));
    document.querySelectorAll('[data-del-ded]').forEach(b=>b.addEventListener('click',()=>confirmModal('Are you sure you want to delete this deduction?','Yes',()=>stageDeleteDeduction(b.dataset.delDed))));
  }
  function stageDeductionEnd(id,endDate){
    const d=(deductionDraftRows||[]).find(x=>x.id===id); if(!d) return;
    if(endDate){ const c=E.PAY_CYCLES.find(x=>x.end===endDate); if(!c || c.id<currentCycle().id || E.compare(endDate,d.startDate)<0){ renderDeductionsTable(); return alert('End Date must be the last day of the current or a future pay period and cannot be before the effective date.'); } }
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
      if(d.endDate){ const endCycle=E.PAY_CYCLES.find(c=>c.end===d.endDate); if(!endCycle || endCycle.id < currentCycle().id || E.compare(d.endDate,d.startDate)<0) return alert('End Date must be the last day of the current or a future pay period and cannot be before the effective date.'); }
      if((d.amount===''||d.amount==null) && (d.percentage===''||d.percentage==null)) return alert('Each deduction must have either an Amount or Percentage.');
      if(String(d.amount)!=='' && d.amount!=null && String(d.percentage)!=='' && d.percentage!=null) return alert('Each deduction can have Amount OR Percentage, not both.');
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
    modal('Book Leave', `<div class="leave-booking-form"><div class="full-line">${showTerminatedControl('leaveBookShowTerminated','leave')}</div><div class="full-line"><label>Employee</label><select id="leaveEmp">${employeeOptions(employeeList(showTerminatedByTab.leave))}</select></div><div class="full-line"><label>Leave Type</label><select id="leaveType"><option>Annual Leave</option><option>Personal Leave</option><option>Long Service Leave</option><option value="LWOP">Leave Without Pay</option></select></div><div class="form-spacer"></div><div class="grid form-grid"><div><label>Start Date</label><input id="leaveStart" type="date"></div><div><label>End Date</label><input id="leaveEnd" type="date"></div></div><div class="full-line"><label>Absence Duration (Hours)</label><input id="leaveDuration" type="number" step="0.01" readonly value="0.00"></div></div><p id="leaveDurationNote" class="small-note">Only scheduled work days deduct leave credits. Public holidays and non-rostered days count as 0 hours.</p>`, `<button id="saveLeave">Book Leave</button>`, true);
    ['leaveEmp','leaveType','leaveStart','leaveEnd'].forEach(id=>$(id).addEventListener('change',updateLeaveDuration));
    $('leaveDuration').addEventListener('input',()=>updateLeaveDuration(false));
    $('leaveStart').addEventListener('change',()=>{ setv('leaveEnd',v('leaveStart')); updateLeaveDuration(); });
    bindShowTerminated('leaveBookShowTerminated','leave',openLeaveModal); $('saveLeave').addEventListener('click',saveLeave);
    updateLeaveDuration();
  }
  function updateLeaveDuration(resetValue=true){
    if(!$('leaveDuration')) return;
    const basic=E.validateLeaveBooking(state,v('leaveEmp'),v('leaveType'),v('leaveStart'),v('leaveEnd'));
    const duration=$('leaveDuration');
    const single=v('leaveStart') && v('leaveStart')===v('leaveEnd');
    const editable=single && ['Annual Leave','Personal Leave','LWOP'].includes(v('leaveType')) && basic.partialAllowed;
    duration.readOnly=!editable;
    duration.disabled=!editable && v('leaveType')==='Long Service Leave';
    duration.max=basic.maxHours || '';
    if(resetValue){
      setv('leaveDuration', basic.hours ? Number(basic.hours).toFixed(2) : '0.00');
    }
    if($('leaveDurationNote')){
      if(editable) h('leaveDurationNote', `Partial-day leave is available. Maximum for this date is ${Number(basic.maxHours||0).toFixed(2)} hours.`);
      else h('leaveDurationNote', 'Absence Duration is automatically calculated. It is greyed out for Long Service Leave or date ranges longer than one day.');
    }
  }
  function saveLeave(){
    const requested = $('leaveDuration') && !$('leaveDuration').readOnly ? Number(v('leaveDuration')||0) : undefined;
    const result=E.validateLeaveBooking(state,v('leaveEmp'),v('leaveType'),v('leaveStart'),v('leaveEnd'),requested);
    if(!result.ok) return alert(result.message);
    state.leaveBookings.push({ id:uid('leave'), empId:v('leaveEmp'), type:v('leaveType'), startDate:v('leaveStart'), endDate:v('leaveEnd'), hours:result.hours, status:'Approved' });
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
    let body=`<p><strong>${esc(E.employeeName(e))}</strong></p><div class="controls"><button id="prevCalendarYear" class="secondary" ${year<=defaultYear?'disabled':''}>Previous Year</button><strong>${year}</strong><button id="nextCalendarYear" class="secondary" ${year>=maxYear?'disabled':''}>Next Year</button><span class="small-note">Calendar defaults to the current year and can be viewed up to one year ahead.</span></div><div class="legend"><span class="annual">Annual Leave</span><span class="personal">Personal Leave</span><span class="lsl">Long Service Leave</span><span class="lwop">Leave Without Pay</span><span class="publicholiday">Public Holiday</span><span class="nonrostered">Non Rostered Day</span></div><div class="calendar">`;
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
        if(leave && hrs>0 && !isPH){ cls=leave.type==='Annual Leave'?'annual':leave.type==='Personal Leave'?'personal':leave.type==='Long Service Leave'?'lsl':leave.type==='LWOP'?'lwop':''; title=leave.type==='LWOP'?'Leave Without Pay':leave.type; }
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
    const b=E.projectedBalances(state,e,currentCycle());
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
    const b=E.projectedBalances(state,e,currentCycle());
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
      e.lslEntitlementDateOverride=recalculated.lslEntitlementDate;
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
      e.annualLeaveBalance=E.round4(Number(draft.annual||0)); e.personalLeaveBalance=E.round4(Number(draft.personal||0)); e.lslAccruedBalance=E.round4(Number(draft.lslAccrued||0)); e.lslProRataOverride=E.round4(Number(draft.lslProRata||0)); e.lslEntitlementDateOverride=draft.lslEntitlementDate||'';
      const desc=`Balances adjusted. Annual ${before.annual.toFixed(2)} → ${Number(draft.annual||0).toFixed(2)}, Personal ${before.personal.toFixed(2)} → ${Number(draft.personal||0).toFixed(2)}, LSL Accrued ${before.lslAccrued.toFixed(2)} → ${Number(draft.lslAccrued||0).toFixed(2)}, LSL Pro-rata ${before.lslProRata.toFixed(2)} → ${Number(draft.lslProRata||0).toFixed(2)}, LSL Date ${E.fmtPay(before.lslEntitlementDate)} → ${E.fmtPay(draft.lslEntitlementDate)}. Comment: ${comment}`;
      addJobEvent(e.id,'Absence Balance Adjustment',todayIso(),desc,'employee',e.id); absenceEditing=false; absenceDraft=null; save(); calculateAllForCurrent(); closeModal(); log('Absence balances adjusted.'); renderAll();
    });
  }

  function allPayslipsForEmployee(empId){ const current=currentResults().filter(p=>p.empId===empId).map(p=>Object.assign({},p,{key:`open_${p.id}`})); const hist=state.payslips.filter(p=>p.empId===empId).map(p=>Object.assign({},p,{key:`hist_${p.id}`})); return current.concat(hist).sort((a,b)=>E.compare(b.cycle.end,a.cycle.end)||b.segmentIndex-a.segmentIndex); }
  function renderPayslip(){ h('payslip', `<h2>Payslip Detail</h2><p class="small-note">Select an employee, then choose a payslip date. Click the same payslip again to close it.</p><div class="controls no-print">${showTerminatedControl('payslipShowTerminated','payslip')}</div><div class="grid form-grid no-print"><div><label>Employee</label><select id="payslipEmp">${employeeOptions(employeeList(showTerminatedByTab.payslip))}</select></div><div style="align-self:end"><button id="printPayslip">Print Payslip</button></div></div><div id="payslipList" class="payslip-list"></div><div id="payslipContent"></div>`); bindShowTerminated('payslipShowTerminated','payslip',renderPayslip); $('payslipEmp').addEventListener('change',()=>{ selectedPayslipKey=''; renderPayslipList(); }); $('printPayslip').addEventListener('click',printPayslip); renderPayslipList(); }
  function renderPayslipList(){ const id=v('payslipEmp'); if(!id){ h('payslipList',''); h('payslipContent',''); return; } const list=allPayslipsForEmployee(id); if(!list.length){ h('payslipList','<p class="small-note">No payslips available for this employee.</p>'); h('payslipContent',''); return; } h('payslipList', list.map(p=>`<button type="button" style="color:#000" class="${selectedPayslipKey===p.key?'active':''}" data-open-payslip="${esc(p.key)}">${E.ppeLabel(p.cycle)} — ${E.fmtPay(p.cycle.end)} — ${esc(p.position||'')} — ${p.finalised?'Finalised':'Open'} — Net ${E.money(p.net)}</button>`).join('')); document.querySelectorAll('[data-open-payslip]').forEach(b=>b.addEventListener('click',()=>togglePayslip(b.dataset.openPayslip))); }
  function togglePayslip(key){ if(selectedPayslipKey===key){ selectedPayslipKey=''; h('payslipContent',''); renderPayslipList(); return; } selectedPayslipKey=key; const p=allPayslipsForEmployee(v('payslipEmp')).find(x=>x.key===key); h('payslipContent',p?payslipHtml(p):''); renderPayslipList(); }
  function printPayslip(){ if(!selectedPayslipKey) return alert('Select a payslip first.'); const p=allPayslipsForEmployee(v('payslipEmp')).find(x=>x.key===selectedPayslipKey); if(!p) return; if(!p.finalised) return alert('This payslip cannot be printed until the pay has been finalised.'); h('printArea', payslipHtml(p)); window.print(); }
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
  function payslipHtml(p){
    const e=p.employeeSnapshot||emp(p.empId)||{};
    const status=p.finalised?'<div class="payslip-status pay-final">This pay has been finalised</div>':'<div class="payslip-status pay-open">This pay has not yet been finalised</div>';
    const ytd=ytdTotalsForPayslip(p);
    const rows=p.rows.map(r=>`<tr><td>${esc(r.description || 'Additional Day')}</td><td class="right">${Number(r.units||0).toFixed(2)}</td><td class="right">${Number(r.amount||0).toFixed(2)}</td><td>${E.fmtPay(r.startDate)}</td><td>${E.fmtPay(r.endDate)}</td></tr>`).join('');
    const preTaxRows=(p.preTaxDeductions||[]).map(d=>[esc(d.description),E.money(d.amount)]);
    const postTaxRows=(p.postTaxDeductions||[]).map(d=>[esc(d.description),E.money(d.amount)]);
    const preTaxSection=preTaxRows.length?`<div class="section-title">Pre-Tax Deductions</div>${table(['Description','Amount'],preTaxRows)}`:'';
    const postTaxSection=postTaxRows.length?`<div class="section-title">Post-Tax Deductions</div>${table(['Description','Amount'],postTaxRows)}`:'';
    const taxRows=[[p.noTfn?'Marginal Tax - No TFN Provided':'Marginal Tax',E.money(p.marginalTax||0)]];
    if(Math.abs(Number(p.marginalTaxRetro||0))>0.004) taxRows.push([p.noTfnRetro?'Marginal Tax Retro - No TFN Provided':'Marginal Tax Retro',E.money(p.marginalTaxRetro||0)]);
    if(Math.abs(Number(p.stsl||0))>0.004) taxRows.push(['STSL Repayment',E.money(p.stsl||0)]);
    if(Math.abs(Number(p.stslRetro||0))>0.004) taxRows.push(['STSL Repayment Retro',E.money(p.stslRetro||0)]);
    const superRows=[];
    if(Math.abs(Number(p.superCurrent ?? p.superAmt ?? 0))>0.004) superRows.push(['Employer Super Contribution',E.money(p.superCurrent ?? p.superAmt ?? 0)]);
    if(Math.abs(Number(p.superRetro||0))>0.004) superRows.push(['Employer Super Contribution Retro',E.money(p.superRetro||0)]);
    if(!superRows.length) superRows.push(['Employer Super Contribution',E.money(0)]);
    return `<div class="payslip"><h2>Payslip Detail ${p.segmentCount>1?`(${p.segmentIndex} of ${p.segmentCount})`:''}</h2>${status}<div class="payslip-top"><div><strong>Employee Name</strong><br>${esc(E.employeeName(e))}</div><div><strong>Employee ID number</strong><br>${esc(p.empId)}</div><div><strong>Department</strong><br>${esc(e.department||'')}</div><div><strong>Position</strong><br>${esc(p.position||'')}</div><div><strong>Pay Period</strong><br>${E.fmtPay(p.cycle.start)} - ${E.fmtPay(p.cycle.end)}</div><div><strong>Payment Date</strong><br>${E.fmtPay(p.cycle.paymentDate)}</div></div><div class="section-title">Pay Summary</div>${table(['','Gross','Tax','Net'],[['Current',E.money(p.gross),E.money(p.tax),E.money(p.net)],['YTD',E.money(ytd.gross),E.money(ytd.tax),E.money(ytd.net)]])}<div class="section-title">Earnings</div><table><thead><tr><th>Description</th><th>Units</th><th>Amount</th><th>Begin Dt</th><th>End Dt</th></tr></thead><tbody>${rows}<tr><td><strong>Total</strong></td><td class="right"><strong>${Number(p.units||0).toFixed(2)}</strong></td><td class="right"><strong>${Number(p.gross||0).toFixed(2)}</strong></td><td></td><td></td></tr></tbody></table>${preTaxSection}<div class="section-title">Tax</div>${table(['Description','Amount'],taxRows)}${postTaxSection}<div class="section-title">Employer Superannuation</div>${table(['Description','Amount'],superRows)}<div class="section-title">Leave Balance</div>${table(['Description','Balance'],[['Annual Leave Balance (Hours)',Number(p.balances.annual||0).toFixed(2)],['Personal Leave Balance (Hours)',Number(p.balances.personal||0).toFixed(2)],['LSL Accrued Balance (Hours)',Number(p.balances.lslAccrued||0).toFixed(2)],['LSL Entitlement Date',E.fmtPay(p.balances.lslEntitlementDate)]])}</div>`;
  }

  function renderCertification(){ const visible=E.PAY_CYCLES.filter(c=>c.id<=currentCycle().id || E.isFinalised(state,c)); h('certification', `<h2>Certification Report</h2><p class="small-note">Reports are only available for the current/open pay and previous generated pay periods. Future reports are not shown.</p><div class="grid form-grid"><div><label>Pay Cycle</label><select id="certCycle">${visible.map(c=>`<option value="${c.id}" ${c.id===currentCycle().id?'selected':''}>${E.cycleDisplay(c)}</option>`).join('')}</select></div></div><div id="certOutput"></div>`); $('certCycle').addEventListener('change',renderCertOutput); renderCertOutput(); }
  function renderCertOutput(){
    const c=E.cycleById(v('certCycle')||currentCycle().id); const locked=!!state.certifications[String(c.id)];
    const lines=(c.id===currentCycle().id?currentResults():state.payslips.filter(p=>Number(p.cycleId)===Number(c.id)));
    if(!lines.length){ h('certOutput','<p class="small-note">No payslips generated for this pay period.</p>'); return; }
    h('certOutput', table(['Details','Employee','Position','Gross','Tax','Net','Certify'], lines.map(p=>[`<button class="icon-btn" title="View pay breakdown" data-cert-detail="${esc(p.id)}">🔍</button>`,esc(p.employeeName),esc(p.position),E.money(p.gross),E.money(p.tax),E.money(p.net),`<input type="checkbox" class="certLine" data-id="${esc(p.id)}" ${locked?'checked disabled':''}>`])) + `<div class="divider"></div><div class="grid form-grid"><div><label>Name</label><input id="certName" ${locked?'readonly':''} value="${esc(state.certifications[String(c.id)]?.name||'')}"></div><div><label>Position</label><input id="certPosition" ${locked?'readonly':''} value="${esc(state.certifications[String(c.id)]?.position||'')}"></div></div><p><label><input type="checkbox" id="certDeclaration" ${locked?'checked disabled':''}> I certify to the best of my knowledge, this pay is correct</label></p><button id="saveCert" ${locked?'disabled':''}>Save</button>`);
    document.querySelectorAll('[data-cert-detail]').forEach(b=>b.addEventListener('click',()=>openCertificationDetail(c.id,b.dataset.certDetail)));
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
  function saveCertification(cycleId){ const checks=[...document.querySelectorAll('.certLine')]; if(checks.some(c=>!c.checked)) return alert('Please certify each pay line.'); if(!v('certName')||!v('certPosition')) return alert('Enter name and position.'); if(!$('certDeclaration').checked) return alert('Please tick the certification declaration.'); state.certifications[String(cycleId)]={name:v('certName'),position:v('certPosition'),savedAt:new Date().toISOString(),locked:true}; save(); log(`Certification Report saved for ${E.ppeLabel(E.cycleById(cycleId))}`); renderCertification(); }

  function renderAudit(){ h('audit', `<h2>Audit Log</h2>${state.auditLog.map(x=>`<div class="history-item">${esc(x)}</div>`).join('')}`); }
  function renderSettings(){ h('settings', `<h2>Settings</h2><p><strong>Current app version:</strong> v${APP_VERSION}</p><div class="controls"><button id="checkUpdates">Check for Updates</button><button id="changeNotes" class="secondary">Change Notes</button><button id="overnight" class="secondary">Check Overnight Processing</button><button id="finalisePay" class="warning">Finalise Pay</button><button id="checkErrors" class="secondary">Check for Errors</button></div><div class="controls"><button id="publicHolidays" class="secondary">View WA Public Holidays</button></div><div id="settingsOutput" class="small-note"></div>`); $('checkUpdates').addEventListener('click',checkForUpdates); $('changeNotes').addEventListener('click',openChangeNotes); $('overnight').addEventListener('click',()=>checkOvernightProcessing(true)); $('finalisePay').addEventListener('click',openFinalisePay); $('publicHolidays').addEventListener('click',openPublicHolidays); $('checkErrors').addEventListener('click',checkForErrors); }

  function checkForErrors(){
    calculateAllForCurrent();
    const c=currentCycle();
    const warnings=[];
    state.employees.forEach(e=>{
      const active=employeeDisplayStatus(e)!=='Terminated';
      const schedule=E.activeSchedule(state,e.id,c.start);
      if(active && (!schedule || !Object.values(schedule.hoursByDay||{}).some(x=>Number(x)>0))) warnings.push(`${E.employeeName(e)} has a missing or invalid work schedule.`);
      if(active && !(state.taxDetails||[]).some(t=>t.empId===e.id && String(t.taxFileNumber||'').trim())) warnings.push(`${E.employeeName(e)} has no Tax Details/TFN entered.`);
      const bal=E.projectedBalances(state,e,c);
      if(bal.annual<0 || bal.personal<0 || bal.lslAccrued<0) warnings.push(`${E.employeeName(e)} has a negative leave balance.`);
      if(e.type==='Fixed Term' && e.contractEndDate && E.compare(e.contractEndDate,c.end)<=0 && E.compare(e.contractEndDate,c.start)>=0) warnings.push(`${E.employeeName(e)} has a fixed-term contract ending in the current open pay.`);
      if(e.type==='Fixed Term' && e.contractEndDate && E.compare(e.contractEndDate,E.addDays(c.end,28))<=0 && E.compare(e.contractEndDate,c.end)>0) warnings.push(`${E.employeeName(e)} has a fixed-term contract ending soon.`);
    });
    (state.additionalEarnings||[]).filter(a=>a.saved===false).forEach(a=>warnings.push(`${E.employeeName(emp(a.empId)||{})} has unsaved Additional Earnings.`));
    currentResults().forEach(p=>{ if(Number(p.net||0)<0) warnings.push(`${p.employeeName} has negative net pay on ${E.ppeLabel(p.cycle)} (${E.money(p.net)}).`); });
    state.employees.filter(e=>employeeDisplayStatus(e)!=='Terminated').forEach(e=>{ if(!currentResults().some(p=>p.empId===e.id)) warnings.push(`${E.employeeName(e)} has no payable earnings and will not receive a payslip for ${E.ppeLabel(c)}.`); });
    (state.leaveBookings||[]).forEach(l=>{
      const e=emp(l.empId); if(!e) return;
      const validation=E.validateLeaveBooking(Object.assign({},state,{leaveBookings:(state.leaveBookings||[]).filter(x=>x.id!==l.id)}),l.empId,l.type,l.startDate,l.endDate,l.hours,l.id);
      if(!validation.ok) warnings.push(`${E.employeeName(e)} leave booking ${E.fmtPay(l.startDate)} - ${E.fmtPay(l.endDate)}: ${validation.message}`);
    });
    const body=warnings.length?`<p class="small-note">These warnings do not prevent you from finalising pay. They are for review only.</p><ul>${warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul>`:'<p class="success-text"><strong>No errors found</strong></p>';
    modal('Pay Error / Warning Check', body, `<button data-close-modal>Close</button>`);
  }

  async function checkForUpdates(){ h('settingsOutput','Checking for updates...'); try{ const res=await fetch('./latest-version.json?ts='+Date.now()); if(!res.ok) throw new Error('No file'); const latest=await res.json(); h('settingsOutput', latest.version===APP_VERSION?`You are up to date. Current version: v${APP_VERSION}.`:`Update available: v${esc(latest.version)}. Export data before replacing files.`); }catch(e){ h('settingsOutput','Could not check updates. Make sure latest-version.json has been uploaded.'); } }
  const changeNotes=[
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
  function openFinalisePay(){ const c=currentCycle(); confirmModal(`Are you sure you want to finalise the pay for ${E.ppeLabel(c)}?`, 'Yes', ()=>showProcessing('Pay Finalisation in Progress',()=>{ const result=E.finaliseCurrentPay(state); save(); calculateAllForCurrent(); log(`Pay finalised for ${E.ppeLabel(result.finalisedCycle)}. Next pay opened: ${E.ppeLabel(result.nextCycle)}`); renderAll(); })); }
  function showProcessing(title,callback){ logout(); h('processingTitle',title); $('processingScreen').classList.add('open'); setTimeout(()=>{ callback && callback(); $('processingScreen').classList.remove('open'); }, 1600); }

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

  window.PayrollApp = { getState:()=>state, renderAll, calculateAllForCurrent, login };
})();
