(function(){
  'use strict';
  const APP_VERSION = DataStore.APP_VERSION;
  const PASSWORD = '1234';
  let state = DataStore.load();
  let showTerminated = false;
  let leaveMonthOffset = 0;
  let leaveFilterEmp = '';
  let selectedPayslipKey = '';
  let selectedCalendarEmp = '';
  let additionalPeriodOffset = 0;
  let additionalDraftRows = [];
  let additionalDirty = false;
  let taxDirty = false;
  let selectedTaxRecordId = '';
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
  function activeEmployees(){ return state.employees.filter(e=>e.status !== 'Terminated'); }
  function employeeOptions(list=state.employees, blank=true){
    const opts = list.map(e=>`<option value="${esc(e.id)}">${esc(E.employeeName(e))} (${esc(e.id)})</option>`).join('');
    return (blank ? '<option value="">Select employee</option>' : '') + opts;
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
    showTab(tab, btn);
  }
  function showTab(tab, btn){
    document.querySelectorAll('.tab-section').forEach(s=>s.classList.remove('active'));
    $(tab).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
    if(btn) btn.classList.add('active');
    if(tab==='additionalEarnings') loadAdditionalDraft();
    if(tab==='taxDetails') renderTaxDetails();
    if(tab==='certification') renderCertification();
    if(tab==='payslip') renderPayslip();
  }

  function renderAll(){
    renderMetrics(); renderEmployees(); renderChangeCentre(); renderJobSummary(); renderAdditionalEarnings(); renderTaxDetails(); renderLeave(); renderAbsenceBalance(); renderPayslip(); renderCertification(); renderAudit(); renderSettings();
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
    const list = state.employees.filter(e=>showTerminated || e.status !== 'Terminated');
    h('employees', `<h2>Employees</h2><p class="small-note">Employee IDs auto-generate. Fixed-term contract end dates are treated as expected termination dates.</p><div class="controls"><button id="addEmployeeBtn">Add New Employee</button><button id="rehireBtn" class="secondary">Rehire Employee</button><button id="extendContractBtn" class="secondary">Extend Contract</button><button id="terminationBtn" class="secondary">Process Termination</button><button id="toggleTerminatedBtn" class="ghost">${showTerminated?'Hide':'Show'} Terminated Employees</button></div><div id="employeesTable"></div>`);
    h('employeesTable', table(['ID','First Name','Last Name','Type','Department','Position','Start','Termination / Contract End','Rate','Status','Actions'], list.map(e=>[
      esc(e.id), esc(e.firstName||''), esc(e.lastName||''), esc(e.type||''), esc(e.department||''), esc(e.position||''), E.fmtPay(e.startDate), e.status==='Terminated'?`${E.fmtPay(e.terminationDate)}<br>${esc(e.terminationReason||'')}`:(e.type==='Fixed Term'&&e.contractEndDate?`${E.fmtPay(e.contractEndDate)}<br>Expected fixed-term end`:''), E.money(e.hourlyRate), badge(e.status||'Active'), `<button class="icon-btn" data-edit-details="${esc(e.id)}" title="Edit personal details">✏️</button> <button class="icon-btn" data-view-personal="${esc(e.id)}" title="View current personal details">👁️</button> <button class="icon-btn" data-view-schedule="${esc(e.id)}" title="View schedule">📅</button>`
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
  function openAddEmployee(){
    modal('Commence New Employee', `<div class="grid form-grid"><div><label>Employee ID</label><input id="newId" readonly value="${nextEmployeeId()}"></div><div><label>First Name</label><input id="newFirst" autocomplete="given-name"></div><div><label>Last Name</label><input id="newLast" autocomplete="family-name"></div><div><label>Department</label><input id="newDepartment"></div><div><label>Position</label><input id="newPosition"></div><div><label>Employment Type</label><select id="newType"><option value="">Select</option><option>Permanent</option><option>Fixed Term</option><option>Casual</option></select></div><div><label>Start Date</label><input id="newStart" type="date"></div><div><label>Contract End Date</label><input id="newContractEnd" type="date" disabled></div><div><label>Auto Terminate?</label><select id="newAutoTerm" disabled><option value="false">No</option><option value="true">Yes</option></select></div><div><label>Hourly Rate</label><input id="newRate" type="number" step="0.01"></div><div><label>Initial Annual Leave Balance (Hours)</label><input id="newAL" type="number" step="0.01"></div><div><label>Initial Personal Leave Balance (Hours)</label><input id="newPL" type="number" step="0.01"></div><div><label>Initial Accrued LSL Balance (Hours)</label><input id="newLSL" type="number" step="0.01"></div></div><div class="divider"></div><h3>Personal Details</h3><div class="grid form-grid"><div><label>Date of Birth</label><input id="newDOB" type="date"></div><div><label>Email</label><input id="newEmail" type="email" autocomplete="email"></div><div><label>Phone number</label><input id="newPhone" type="tel" autocomplete="tel"></div><div><label>Address</label><input id="newAddress" autocomplete="street-address" placeholder="Start typing address"></div></div><div class="divider"></div><h3>Starting Work Schedule</h3>${scheduleInputs('new')}`, `<button id="saveNewEmployee">Commence Employee</button>`, false);
    $('newType').addEventListener('change',()=>toggleContractFields('newType','newContractEnd','newAutoTerm'));
    $('newDOB').addEventListener('focus',()=>alert('Date of Birth changes should only be processed where data has been input incorrectly'),{once:true});
    $('saveNewEmployee').addEventListener('click', saveNewEmployee);
  }
  function toggleContractFields(typeId,endId,autoId){
    const allowed = v(typeId)==='Fixed Term';
    $(endId).disabled = !allowed; $(autoId).disabled = !allowed;
    if(!allowed){ setv(endId,''); setv(autoId,'false'); }
  }
  function saveNewEmployee(){
    const type = v('newType'); const start = v('newStart'); const sched = getSchedule('new');
    if(!v('newFirst').trim() || !v('newLast').trim()) return alert('Enter first and last name.');
    if(!type) return alert('Select employment type.');
    if(type==='Permanent' && v('newContractEnd')) return alert('Permanent employees cannot have a contract end date.');
    if(!start) return alert('Enter a start date.');
    if(weeklyHours(sched)<=0) return alert('Enter at least one work day/hour.');
    const personal = { id:uid('personal'), effectiveDate:start, dateOfBirth:v('newDOB'), email:v('newEmail'), phone:v('newPhone'), address:v('newAddress') };
    const e = { id:v('newId'), firstName:v('newFirst').trim(), lastName:v('newLast').trim(), name:`${v('newFirst').trim()} ${v('newLast').trim()}`, department:v('newDepartment'), position:v('newPosition'), type, startDate:start, originalStartDate:start, lslServiceDate:start, contractEndDate:type==='Fixed Term'?v('newContractEnd'):'', autoTerminate:type==='Fixed Term'&&v('newAutoTerm')==='true', hourlyRate:Number(v('newRate')||0), annualLeaveBalance:Number(v('newAL')||0), personalLeaveBalance:Number(v('newPL')||0), lslAccruedBalance:Number(v('newLSL')||0), dateOfBirth:personal.dateOfBirth, email:personal.email, phone:personal.phone, address:personal.address, personalDetailsHistory:[personal], status:'Active' };
    state.employees.push(e);
    const rateId=uid('rate'), schedId=uid('schedule');
    state.payRates.push({ id:rateId, empId:e.id, changeType:'Permanent', effectiveDate:start, endDate:'', position:e.position, hourlyRate:e.hourlyRate });
    state.schedules.push({ id:schedId, empId:e.id, effectiveDate:start, hoursByDay:sched });
    addJobEvent(e.id,'Commencement',start,'Employee commenced','employee',e.id);
    addJobEvent(e.id,'Position/Pay Rate',start,`${e.position} — ${E.money(e.hourlyRate)}`,'rate',rateId);
    addJobEvent(e.id,'Schedule',start,`Starting schedule ${weeklyHours(sched).toFixed(2)} hours/week`,'schedule',schedId);
    addJobEvent(e.id,'Personal Details',start,'Personal details recorded','employee',e.id);
    save(); closeModal(); calculateAllForCurrent(); log(`Employee commenced: ${E.employeeName(e)}`); renderAll();
  }
  function addJobEvent(empId,type,effectiveDate,description,refKind,refId){ state.jobEvents.push({ id:uid('job'), empId, type, effectiveDate, description, refKind, refId }); }

  function openEditEmployeeDetails(empId){
    const e=emp(empId); if(!e) return;
    modal('Edit Employee Details', `<input id="editDetailsId" type="hidden" value="${esc(empId)}"><div class="grid form-grid"><div><label>Effective Date of Change</label><input id="editDetailsEffective" type="date" value="${esc(todayIso())}"></div><div><label>First Name</label><input id="editFirst" value="${esc(e.firstName||'')}" autocomplete="given-name"></div><div><label>Last Name</label><input id="editLast" value="${esc(e.lastName||'')}" autocomplete="family-name"></div><div><label>Date of Birth</label><input id="editDOB" type="date" value="${esc(e.dateOfBirth||'')}"></div><div><label>Email</label><input id="editEmail" type="email" value="${esc(e.email||'')}" autocomplete="email"></div><div><label>Phone number</label><input id="editPhone" type="tel" value="${esc(e.phone||'')}" autocomplete="tel"></div><div><label>Address</label><input id="editAddress" value="${esc(e.address||'')}" autocomplete="street-address"></div></div>`, `<button id="saveDetails">Save Details</button>`, true);
    $('editDOB').addEventListener('focus',()=>alert('Date of Birth changes should only be processed where data has been input incorrectly'),{once:true});
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
    const terms = state.employees.filter(e=>e.status==='Terminated');
    modal('Rehire Employee', `<div class="grid form-grid"><div><label>Terminated Employee</label><select id="rehireEmp">${employeeOptions(terms)}</select></div><div><label>Employee ID</label><input id="rehireId" readonly></div><div><label>First Name</label><input id="rehireFirst" readonly></div><div><label>Last Name</label><input id="rehireLast" readonly></div><div><label>New Start Date</label><input id="rehireStart" type="date"></div><div><label>Department</label><input id="rehireDept"></div><div><label>Position</label><input id="rehirePosition"></div><div><label>Hourly Rate</label><input id="rehireRate" type="number" step="0.01"></div></div><div class="divider"></div><h3>New Work Schedule</h3>${scheduleInputs('rehire')}`, `<button id="saveRehire">Rehire Employee</button>`, false);
    const populate=()=>{ const e=emp(v('rehireEmp'))||{}; setv('rehireId',e.id); setv('rehireFirst',e.firstName); setv('rehireLast',e.lastName); setv('rehireDept',e.department); setv('rehirePosition',e.position); setv('rehireRate',e.hourlyRate); };
    $('rehireEmp').addEventListener('change',populate); populate(); $('saveRehire').addEventListener('click',saveRehire);
  }
  function saveRehire(){ const e=emp(v('rehireEmp')); if(!e) return alert('Select a terminated employee.'); const start=v('rehireStart'); const sched=getSchedule('rehire'); if(!start) return alert('Enter a new start date.'); if(weeklyHours(sched)<=0) return alert('Enter a work schedule.'); const oldTerm=e.terminationDate; e.status='Active'; e.startDate=start; e.lslServiceDate=start; e.terminationDate=''; e.terminationReason=''; e.department=v('rehireDept')||e.department; e.position=v('rehirePosition')||e.position; e.hourlyRate=Number(v('rehireRate')||e.hourlyRate||0); const rateId=uid('rate'), schedId=uid('schedule'); state.payRates.push({id:rateId,empId:e.id,changeType:'Permanent',effectiveDate:start,endDate:'',position:e.position,hourlyRate:e.hourlyRate}); state.schedules.push({id:schedId,empId:e.id,effectiveDate:start,hoursByDay:sched}); addJobEvent(e.id,'Rehire',start,`Employee rehired. Previous termination ${E.fmtPay(oldTerm)}`,'employee',e.id); addJobEvent(e.id,'Position/Pay Rate',start,`${e.position} — ${E.money(e.hourlyRate)}`,'rate',rateId); addJobEvent(e.id,'Schedule',start,`Rehire schedule ${weeklyHours(sched).toFixed(2)} hours/week`,'schedule',schedId); save(); closeModal(); calculateAllForCurrent(); log(`Employee rehired: ${E.employeeName(e)}`); renderAll(); toast("Employee's personal and tax details may have changed since last employment. Please update if necessary", 15000); }
  function openExtendContract(){ const fixed=state.employees.filter(e=>e.type==='Fixed Term'); modal('Extend Contract', `<div class="grid form-grid"><div><label>Fixed-Term Employee</label><select id="extendEmp">${employeeOptions(fixed)}</select></div><div><label>New Contract End Date</label><input id="extendEnd" type="date"></div></div>`, `<button id="saveExtend">Save Contract Extension</button>`, true); $('saveExtend').addEventListener('click',()=>{ const e=emp(v('extendEmp')); if(!e) return alert('Select a fixed-term employee.'); if(!v('extendEnd')) return alert('Enter a new contract end date.'); const old=e.contractEndDate; e.contractEndDate=v('extendEnd'); e.status='Active'; e.terminationDate=''; e.terminationReason=''; addJobEvent(e.id,'New Fixed Term Contract',v('extendEnd'),`Contract extended from ${E.fmtPay(old)} to ${E.fmtPay(v('extendEnd'))}`,'employee',e.id); save(); closeModal(); log(`Contract extended for ${E.employeeName(e)}`); renderAll(); }); }
  function openTermination(){ modal('Process Termination', `<div class="grid form-grid"><div><label>Employee</label><select id="termEmp">${employeeOptions(activeEmployees())}</select></div><div><label>Last Working Date</label><input id="termDate" type="date"></div><div><label>Reason for Termination</label><select id="termReason"><option>Voluntary - Resignation</option><option>Voluntary - Retirement</option></select></div></div>`, `<button id="saveTermination" class="danger">Terminate Employee</button>`, true); $('saveTermination').addEventListener('click',()=>{ const e=emp(v('termEmp')); if(!e) return alert('Select employee.'); if(!v('termDate')) return alert('Enter last working date.'); e.status='Terminated'; e.terminationDate=v('termDate'); e.terminationReason=v('termReason'); addJobEvent(e.id,'Termination',e.terminationDate,e.terminationReason,'employee',e.id); save(); closeModal(); calculateAllForCurrent(); log(`Termination processed for ${E.employeeName(e)}`); renderAll(); }); }

  function renderChangeCentre(){
    h('changeCentre', `<h2>Change Centre</h2><p class="small-note">Use this tab for master data, position/pay and work schedule changes. Backdated changes will calculate retro when required.</p><h3>Employee master change</h3><div class="grid form-grid"><div><label>Employee</label><select id="editEmp">${employeeOptions()}</select></div><div><label>Start Date</label><input id="editStart" type="date"></div><div><label>Employment Type</label><select id="editType"><option>Permanent</option><option>Fixed Term</option><option>Casual</option></select></div><div><label>Contract End Date</label><input id="editContractEnd" type="date"></div><div><label>Auto Terminate?</label><select id="editAutoTerm"><option value="false">No</option><option value="true">Yes</option></select></div><div><label>Status</label><select id="editStatus"><option>Active</option><option>Terminated</option></select></div></div><div class="controls" style="margin-top:14px"><button id="saveMasterChange">Save Master Change</button></div><div class="divider"></div><h3>Position / pay rate change</h3><div class="grid form-grid"><div><label>Employee</label><select id="rateEmp">${employeeOptions()}</select></div><div><label>Change Type</label><select id="rateType"><option>Permanent</option><option>Temporary</option></select></div><div><label>Effective Date</label><input id="rateStart" type="date"></div><div><label>Temporary End Date</label><input id="rateEnd" type="date" disabled></div><div><label>New Position</label><input id="ratePosition"></div><div><label>New Hourly Rate</label><input id="rateAmount" type="number" step="0.01"></div></div><div class="controls" style="margin-top:14px"><button id="saveRateChange">Add Position/Pay Change</button></div><div class="divider"></div><h3>Work schedule change</h3><div class="grid form-grid"><div><label>Employee</label><select id="schedEmp">${employeeOptions()}</select></div><div><label>Effective Date</label><input id="schedStart" type="date"></div></div>${scheduleInputs('sched')}<div class="controls" style="margin-top:14px"><button id="saveScheduleChange">Add Schedule Change</button></div>`);
    $('rateType').addEventListener('change',()=>{ $('rateEnd').disabled = v('rateType') !== 'Temporary'; if(v('rateType')!=='Temporary') setv('rateEnd',''); });
    $('editType').addEventListener('change',()=>toggleContractFields('editType','editContractEnd','editAutoTerm'));
    $('saveMasterChange').addEventListener('click',saveMasterChange); $('saveRateChange').addEventListener('click',saveRateChange); $('saveScheduleChange').addEventListener('click',saveScheduleChange);
  }
  function saveMasterChange(){ const e=emp(v('editEmp')); if(!e) return alert('Select employee.'); const type=v('editType'); if(type==='Permanent'&&v('editContractEnd')) return alert('Permanent employees cannot have a contract end date.'); e.startDate=v('editStart')||e.startDate; e.type=type; e.contractEndDate=type==='Fixed Term'?v('editContractEnd'):''; e.autoTerminate=type==='Fixed Term'&&v('editAutoTerm')==='true'; e.status=v('editStatus'); addJobEvent(e.id,'Master Change',e.startDate,`Employment/status updated to ${e.type}/${e.status}`,'employee',e.id); save(); calculateAllForCurrent(); log('Employee master updated'); renderAll(); }
  function saveRateChange(){ const empId=v('rateEmp'); if(!empId || !v('rateStart') || !v('ratePosition') || !v('rateAmount')) return alert('Complete all pay change fields.'); if(v('rateType')==='Temporary' && !v('rateEnd')) return alert('Temporary changes require an end date.'); const id=uid('rate'); state.payRates.push({id,empId,changeType:v('rateType'),effectiveDate:v('rateStart'),endDate:v('rateType')==='Temporary'?v('rateEnd'):'',position:v('ratePosition'),hourlyRate:Number(v('rateAmount'))}); addJobEvent(empId,'Position/Pay Rate',v('rateStart'),`${v('rateType')} — ${v('ratePosition')} — ${E.money(v('rateAmount'))}`,'rate',id); save(); calculateAllForCurrent(); log('Position/pay rate change added'); renderAll(); }
  function saveScheduleChange(){ const empId=v('schedEmp'); const sched=getSchedule('sched'); if(!empId || !v('schedStart') || weeklyHours(sched)<=0) return alert('Complete employee, effective date and schedule hours.'); const id=uid('schedule'); state.schedules.push({id,empId,effectiveDate:v('schedStart'),hoursByDay:sched}); addJobEvent(empId,'Schedule',v('schedStart'),`Schedule changed to ${weeklyHours(sched).toFixed(2)} hours/week`,'schedule',id); save(); calculateAllForCurrent(); log('Schedule change added'); renderAll(); }

  function renderJobSummary(){
    h('jobSummary', `<h2>Job Summary</h2><p class="small-note">Shows employee/job record changes only. Leave bookings are not shown here.</p><div class="grid form-grid"><div><label>Employee</label><select id="jobEmp">${employeeOptions()}</select></div></div><div id="jobOutput"></div>`);
    $('jobEmp').addEventListener('change',renderJobOutput); renderJobOutput();
  }
  function renderJobOutput(){ const id=v('jobEmp'); if(!id){ h('jobOutput','<p class="small-note">Select an employee.</p>'); return; } const rows=[]; state.jobEvents.filter(x=>x.empId===id).forEach(x=>rows.push({kind:x.refKind||'event',id:x.refId||x.id,effectiveDate:x.effectiveDate,type:x.type,description:x.description,eventId:x.id})); state.payRates.filter(x=>x.empId===id&&!rows.some(r=>r.id===x.id)).forEach(x=>rows.push({kind:'rate',id:x.id,effectiveDate:x.effectiveDate,type:'Position/Pay Rate',description:`${x.changeType} — ${x.position} — ${E.money(x.hourlyRate)}`})); state.schedules.filter(x=>x.empId===id&&!rows.some(r=>r.id===x.id)).forEach(x=>rows.push({kind:'schedule',id:x.id,effectiveDate:x.effectiveDate,type:'Schedule',description:`${weeklyHours(x.hoursByDay).toFixed(2)} hours/week`})); rows.sort((a,b)=>E.compare(b.effectiveDate,a.effectiveDate)); h('jobOutput', table(['Effective Date','Type','Description','Action'], rows.map(r=>[E.fmtPay(r.effectiveDate),esc(r.type),esc(r.description),`<button class="danger" data-del-job="${esc(r.kind)}|${esc(r.id)}|${esc(r.eventId||'')}">Delete</button>`]))); document.querySelectorAll('[data-del-job]').forEach(b=>b.addEventListener('click',()=>{ const [kind,id,eventId]=b.dataset.delJob.split('|'); confirmModal('Are you sure you want to delete this entry? This may result in pay recalculations','Yes',()=>deleteJobEntry(kind,id,eventId)); })); }
  function deleteJobEntry(kind,id,eventId){ if(kind==='rate') state.payRates=state.payRates.filter(x=>x.id!==id); if(kind==='schedule') state.schedules=state.schedules.filter(x=>x.id!==id); if(eventId) state.jobEvents=state.jobEvents.filter(x=>x.id!==eventId); state.jobEvents=state.jobEvents.filter(x=>x.refId!==id); save(); calculateAllForCurrent(); log('Job Summary entry deleted. Recalculation applied.'); renderAll(); }

  function renderAdditionalEarnings(){
    h('additionalEarnings', `<h2>Additional Earnings</h2><p id="additionalNote" class="small-note"></p><div class="grid form-grid"><div><label>Employee</label><select id="addEmp">${employeeOptions(activeEmployees())}</select></div><div><label>Pay Period</label><input id="addPeriod" readonly></div></div><div class="controls" style="margin-top:14px"><button id="addPrev" class="secondary">← Previous Pay</button><button id="addNext" class="secondary">Next Pay →</button><button id="addRow">+ Add Row</button></div><div id="addRows"></div><div class="save-row"><button id="saveAdditional">Save</button></div>`);
    $('addEmp').addEventListener('change',loadAdditionalDraft); $('addPrev').addEventListener('click',()=>moveAdditionalPeriod(-1)); $('addNext').addEventListener('click',()=>moveAdditionalPeriod(1)); $('addRow').addEventListener('click',addAdditionalRow); $('saveAdditional').addEventListener('click',saveAdditional); loadAdditionalDraft();
  }
  function additionalCycle(){ const currentIndex=E.PAY_CYCLES.findIndex(c=>c.id===currentCycle().id); const idx=Math.min(currentIndex+1,Math.max(0,currentIndex+additionalPeriodOffset)); return E.PAY_CYCLES[idx] || currentCycle(); }
  function moveAdditionalPeriod(n){ const currentIndex=E.PAY_CYCLES.findIndex(c=>c.id===currentCycle().id); const nextOffset=additionalPeriodOffset+n; const idx=currentIndex+nextOffset; if(idx<0 || idx>currentIndex+1) return; additionalPeriodOffset=nextOffset; loadAdditionalDraft(); }
  function loadAdditionalDraft(){ const c=additionalCycle(); if($('addPeriod')) setv('addPeriod',E.cycleDisplay(c)); const empId=v('addEmp'); additionalDraftRows=empId?state.additionalEarnings.filter(a=>a.empId===empId&&Number(a.cycleId)===Number(c.id)&&a.saved!==false).map(a=>DataStore.clone(a)):[]; additionalDirty=false; renderAdditionalRows(); }
  function markAdditionalDirty(){ additionalDirty=true; h('additionalNote','Unsaved changes. Additional earnings will not appear on payslips until saved.'); }
  function addAdditionalRow(){ if(!v('addEmp')) return alert('Select an employee first.'); const c=additionalCycle(); additionalDraftRows.push({id:uid('add'),empId:v('addEmp'),cycleId:c.id,earningType:'Additional Day',startDate:c.start,endDate:c.start,hours:0,saved:false}); markAdditionalDirty(); renderAdditionalRows(); }
  function renderAdditionalRows(){ if(!$('addRows')) return; h('additionalNote', additionalDirty?'Unsaved changes. Additional earnings will not appear on payslips until saved.':''); const rows=additionalDraftRows.map((a,i)=>[`<select data-add-field="${i}|earningType"><option ${a.earningType==='Additional Day'?'selected':''}>Additional Day</option><option ${a.earningType==='Overtime 1.5'?'selected':''}>Overtime 1.5</option><option ${a.earningType==='Overtime 2.0'?'selected':''}>Overtime 2.0</option></select>`,`<input type="date" value="${esc(a.startDate||'')}" data-add-field="${i}|startDate">`,`<input type="date" value="${esc(a.endDate||'')}" data-add-field="${i}|endDate">`,`<input type="number" step="0.01" value="${esc(a.hours||0)}" data-add-field="${i}|hours">`,`<button class="danger" data-del-add="${esc(a.id)}">Delete</button>`]); h('addRows', table(['Earnings Type','Start Date','End Date','Hours','Delete'], rows)); document.querySelectorAll('[data-add-field]').forEach(el=>el.addEventListener('change',()=>{ const [i,field]=el.dataset.addField.split('|'); additionalDraftRows[Number(i)][field]=field==='hours'?Number(el.value||0):el.value; if(field==='startDate' && !additionalDraftRows[Number(i)].endDate) additionalDraftRows[Number(i)].endDate=el.value; markAdditionalDirty(); renderAdditionalRows(); })); document.querySelectorAll('[data-del-add]').forEach(b=>b.addEventListener('click',()=>confirmModal('Are you sure you want to delete this entry? This may result in pay recalculations','Yes',()=>{ additionalDraftRows=additionalDraftRows.filter(a=>a.id!==b.dataset.delAdd); markAdditionalDirty(); renderAdditionalRows(); }))); }
  function saveAdditional(){ const empId=v('addEmp'); if(!empId) return alert('Select an employee first.'); const c=additionalCycle(); loadingModal('Saving Additional Earnings','Save Successful',()=>{ state.additionalEarnings=state.additionalEarnings.filter(a=>!(a.empId===empId&&Number(a.cycleId)===Number(c.id))); additionalDraftRows.forEach(a=>state.additionalEarnings.push(Object.assign({},a,{empId,cycleId:c.id,saved:true}))); additionalDirty=false; save(); calculateAllForCurrent(); renderAll(); },700); }

  function taxRecordsForEmp(empId){ return (state.taxDetails||[]).filter(t=>t.empId===empId).sort((a,b)=>E.compare(b.effectiveDate,a.effectiveDate)); }
  function currentTaxRecord(empId){
    const rows=taxRecordsForEmp(empId);
    return rows.filter(t=>E.compare(t.effectiveDate,currentCycle().end)<=0).sort((a,b)=>E.compare(b.effectiveDate,a.effectiveDate))[0] || rows[0] || null;
  }
  function defaultTaxRecord(empId, future=false){
    const e=emp(empId)||{};
    return { id:future?`new_${Date.now()}`:'new_initial', empId, effectiveDate:future?E.addDays(currentCycle().end,1):(e.startDate||currentCycle().start), taxFileNumber:'', claimTaxFreeThreshold:true, stsl:false };
  }
  function renderTaxDetails(){
    h('taxDetails', `<h2>Tax Details</h2><p class="small-note">Tax details are effective-dated. TFNs are masked by default and only reveal while the eye button is held.</p><div class="grid form-grid"><div><label>Employee</label><select id="taxEmp">${employeeOptions()}</select></div></div><div id="taxDetailsBody"></div>`);
    $('taxEmp').addEventListener('change',()=>{ selectedTaxRecordId=''; taxDirty=false; renderTaxDetailsBody(); });
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
    h('leave', `<h2>Leave</h2><div class="controls"><button id="bookLeaveBtn">Book Leave</button><button id="absenceCalendarBtn" class="purple">Absence Calendar</button><button id="filterLeaveBtn" class="teal">Filter</button></div><br><br><div class="controls"><button id="prevMonth" class="secondary">Previous Month</button><strong>${base.toLocaleDateString('en-AU',{month:'long',year:'numeric'})}</strong><button id="nextMonth" class="secondary">Next Month</button>${leaveFilterEmp?`<span class="badge badge-info">Filtered: ${esc(E.employeeName(emp(leaveFilterEmp)))}</span>`:''}</div><div id="leaveList"></div>`);
    h('leaveList', table(['Employee','Type','Start','End','Hours','Status','Action'], list.map(l=>[esc(E.employeeName(emp(l.empId)||{})),esc(l.type),E.fmtPay(l.startDate),E.fmtPay(l.endDate),Number(l.hours||0).toFixed(2),badge(l.status||'Approved'),`<button class="danger" data-del-leave="${esc(l.id)}">Delete</button>`])));
    $('bookLeaveBtn').addEventListener('click',openLeaveModal); $('absenceCalendarBtn').addEventListener('click',openCalendarSelect); $('filterLeaveBtn').addEventListener('click',openLeaveFilter); $('prevMonth').addEventListener('click',()=>{leaveMonthOffset--;renderLeave();}); $('nextMonth').addEventListener('click',()=>{leaveMonthOffset++;renderLeave();}); document.querySelectorAll('[data-del-leave]').forEach(b=>b.addEventListener('click',()=>confirmModal('Are you sure you want to delete this leave entry','Yes',()=>{ state.leaveBookings=state.leaveBookings.filter(l=>l.id!==b.dataset.delLeave); save(); calculateAllForCurrent(); log('Leave entry deleted. Recalculation applied.'); renderAll(); })));
  }
  function openLeaveModal(){ modal('Book Leave', `<div class="grid form-grid"><div><label>Employee</label><select id="leaveEmp">${employeeOptions(activeEmployees())}</select></div><div><label>Leave Type</label><select id="leaveType"><option>Annual Leave</option><option>Personal Leave</option><option>Long Service Leave</option><option>LWOP</option></select></div><div><label>Start Date</label><input id="leaveStart" type="date"></div><div><label>End Date</label><input id="leaveEnd" type="date"></div><div><label>Absence Duration (Hours)</label><input id="leaveDuration" readonly value="0.00"></div></div><p class="small-note">Only scheduled work days deduct leave credits. Public holidays and non-rostered days count as 0 hours.</p>`, `<button id="saveLeave">Book Leave</button>`, true); ['leaveEmp','leaveType','leaveStart','leaveEnd'].forEach(id=>$(id).addEventListener('change',updateLeaveDuration)); $('leaveStart').addEventListener('change',()=>{ if(!v('leaveEnd')) setv('leaveEnd',v('leaveStart')); updateLeaveDuration(); }); $('saveLeave').addEventListener('click',saveLeave); }
  function updateLeaveDuration(){ const result=E.validateLeaveBooking(state,v('leaveEmp'),v('leaveType'),v('leaveStart'),v('leaveEnd')); setv('leaveDuration', result.hours ? Number(result.hours).toFixed(2) : '0.00'); }
  function saveLeave(){ const result=E.validateLeaveBooking(state,v('leaveEmp'),v('leaveType'),v('leaveStart'),v('leaveEnd')); if(!result.ok) return alert(result.message); state.leaveBookings.push({ id:uid('leave'), empId:v('leaveEmp'), type:v('leaveType'), startDate:v('leaveStart'), endDate:v('leaveEnd'), hours:result.hours, status:'Approved' }); save(); closeModal(); calculateAllForCurrent(); log(`${v('leaveType')} booked`); renderAll(); }
  function openLeaveFilter(){ modal('Filter Leave', `<label>Employee</label><select id="filterEmp">${employeeOptions()}</select>`, `<button id="applyFilter" class="teal">Apply Filter</button><button id="clearFilter" class="secondary">Clear Filter</button>`, true); $('applyFilter').addEventListener('click',()=>{ leaveFilterEmp=v('filterEmp'); closeModal(); renderLeave(); }); $('clearFilter').addEventListener('click',()=>{ leaveFilterEmp=''; closeModal(); renderLeave(); }); }
  function openCalendarSelect(){ modal('Select Employee', `<label>Employee</label><select id="calendarEmp">${employeeOptions()}</select>`, `<button id="openCalendar">Open Calendar</button>`, true); $('openCalendar').addEventListener('click',()=>{ selectedCalendarEmp=v('calendarEmp'); if(!selectedCalendarEmp) return alert('Select an employee.'); closeModal(); openAbsenceCalendar(); }); }
  function openAbsenceCalendar(){
    const e=emp(selectedCalendarEmp); if(!e) return;
    const year=E.parseDate(currentCycle().start).getFullYear();
    let body=`<p><strong>${esc(E.employeeName(e))}</strong></p><div class="legend"><span class="annual">Annual Leave</span><span class="personal">Personal Leave</span><span class="lsl">Long Service Leave</span><span class="publicholiday">Public Holiday</span><span class="nonrostered">Non Rostered Day</span></div><div class="calendar">`;
    for(let m=0;m<12;m++){
      const first=new Date(year,m,1); const last=new Date(year,m+1,0);
      body+=`<div class="month"><h4>${first.toLocaleDateString('en-AU',{month:'long'})}</h4><div class="month-grid">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<div class="cal-head">${d}</div>`).join('')}`;
      for(let i=0;i<first.getDay();i++) body+='<div class="cal-day blank"></div>';
      for(let day=1;day<=last.getDate();day++){
        const d=E.iso(new Date(year,m,day));
        const sched=E.activeSchedule(state,e.id,d);
        const hrs=Number((sched&&sched.hoursByDay&&sched.hoursByDay[E.parseDate(d).getDay()])||0);
        const leave=state.leaveBookings.find(l=>l.empId===e.id&&E.between(d,l.startDate,l.endDate));
        let cls=hrs<=0?'nonrostered':''; let title=hrs<=0?'Non Rostered Day':'';
        if(leave){ cls=leave.type==='Annual Leave'?'annual':leave.type==='Personal Leave'?'personal':leave.type==='Long Service Leave'?'lsl':''; title=leave.type; }
        if(E.isPublicHoliday(d)){ cls='publicholiday'; title=E.publicHolidayName(d)+(leave?` — ${leave.type} booking excluded from leave credits`:'' ); }
        body+=`<div class="cal-day ${cls}" title="${esc(title)}"><strong>${day}</strong></div>`;
      }
      body+='</div></div>';
    }
    body+='</div>'; modal('Absence Calendar', body, '', false);
  }

  function renderAbsenceBalance(){ h('absenceBalance', `<h2>Absence Balance</h2><div class="grid form-grid"><div><label>Employee</label><select id="absenceEmp">${employeeOptions()}</select></div></div><div id="absenceOutput"></div>`); $('absenceEmp').addEventListener('change',renderAbsenceOutput); renderAbsenceOutput(); }
  function renderAbsenceOutput(){ const e=emp(v('absenceEmp')); if(!e){ h('absenceOutput','<p class="small-note">Select an employee.</p>'); return; } const b=E.projectedBalances(state,e,currentCycle()); h('absenceOutput', table(['Balance','Hours / Date'], [['Annual Leave Balance (Hours)',b.annual.toFixed(2)],['Personal Leave Balance (Hours)',b.personal.toFixed(2)],['LSL Accrued Balance (Hours)',b.lslAccrued.toFixed(2)],['LSL Pro-rata (Hours)',b.lslProRata.toFixed(2)],['LSL Entitlement Date',E.fmtPay(b.lslEntitlementDate)]])); }

  function allPayslipsForEmployee(empId){ const current=currentResults().filter(p=>p.empId===empId).map(p=>Object.assign({},p,{key:`open_${p.id}`})); const hist=state.payslips.filter(p=>p.empId===empId).map(p=>Object.assign({},p,{key:`hist_${p.id}`})); return current.concat(hist).sort((a,b)=>E.compare(b.cycle.end,a.cycle.end)||b.segmentIndex-a.segmentIndex); }
  function renderPayslip(){ h('payslip', `<h2>Payslip Detail</h2><p class="small-note">Select an employee, then choose a payslip date. Click the same payslip again to close it.</p><div class="grid form-grid no-print"><div><label>Employee</label><select id="payslipEmp">${employeeOptions()}</select></div><div style="align-self:end"><button id="printPayslip">Print Payslip</button></div></div><div id="payslipList" class="payslip-list"></div><div id="payslipContent"></div>`); $('payslipEmp').addEventListener('change',()=>{ selectedPayslipKey=''; renderPayslipList(); }); $('printPayslip').addEventListener('click',printPayslip); renderPayslipList(); }
  function renderPayslipList(){ const id=v('payslipEmp'); if(!id){ h('payslipList',''); h('payslipContent',''); return; } const list=allPayslipsForEmployee(id); if(!list.length){ h('payslipList','<p class="small-note">No payslips available for this employee.</p>'); h('payslipContent',''); return; } h('payslipList', list.map(p=>`<button type="button" style="color:#000" class="${selectedPayslipKey===p.key?'active':''}" data-open-payslip="${esc(p.key)}">${E.ppeLabel(p.cycle)} — ${E.fmtPay(p.cycle.end)} — ${esc(p.position||'')} — ${p.finalised?'Finalised':'Open'} — Net ${E.money(p.net)}</button>`).join('')); document.querySelectorAll('[data-open-payslip]').forEach(b=>b.addEventListener('click',()=>togglePayslip(b.dataset.openPayslip))); }
  function togglePayslip(key){ if(selectedPayslipKey===key){ selectedPayslipKey=''; h('payslipContent',''); renderPayslipList(); return; } selectedPayslipKey=key; const p=allPayslipsForEmployee(v('payslipEmp')).find(x=>x.key===key); h('payslipContent',p?payslipHtml(p):''); renderPayslipList(); }
  function printPayslip(){ if(!selectedPayslipKey) return alert('Select a payslip first.'); const p=allPayslipsForEmployee(v('payslipEmp')).find(x=>x.key===selectedPayslipKey); if(!p) return; if(!p.finalised) return alert('This payslip cannot be printed until the pay has been finalised.'); h('printArea', payslipHtml(p)); window.print(); }
  function payslipHtml(p){
    const e=p.employeeSnapshot||emp(p.empId)||{};
    const status=p.finalised?'<div class="payslip-status pay-final">This pay has been finalised</div>':'<div class="payslip-status pay-open">This pay has not yet been finalised</div>';
    const ytd=state.payslips.filter(x=>x.empId===p.empId&&E.compare(x.cycle.end,p.cycle.end)<=0).reduce((s,x)=>s+Number(x.gross||0),0)+(p.finalised?0:p.gross);
    const ytdTax=state.payslips.filter(x=>x.empId===p.empId&&E.compare(x.cycle.end,p.cycle.end)<=0).reduce((s,x)=>s+Number(x.tax||0),0)+(p.finalised?0:p.tax);
    const rows=p.rows.map(r=>`<tr><td>${esc(r.description)}</td><td class="right">${Number(r.units||0).toFixed(2)}</td><td class="right">${Number(r.amount||0).toFixed(2)}</td><td>${E.fmtPay(r.startDate)}</td><td>${E.fmtPay(r.endDate)}</td></tr>`).join('');
    const taxRows=[['Marginal Tax',E.money(p.marginalTax||0)]];
    if(Math.abs(Number(p.marginalTaxRetro||0))>0.004) taxRows.push(['Marginal Tax Retro',E.money(p.marginalTaxRetro||0)]);
    if(Math.abs(Number(p.stsl||0))>0.004) taxRows.push(['STSL Repayment',E.money(p.stsl||0)]);
    if(Math.abs(Number(p.stslRetro||0))>0.004) taxRows.push(['STSL Repayment Retro',E.money(p.stslRetro||0)]);
    return `<div class="payslip"><h2>Payslip Detail ${p.segmentCount>1?`(${p.segmentIndex} of ${p.segmentCount})`:''}</h2>${status}<div class="payslip-top"><div><strong>Employee Name</strong><br>${esc(E.employeeName(e))}</div><div><strong>Employee ID number</strong><br>${esc(p.empId)}</div><div><strong>Department</strong><br>${esc(e.department||'')}</div><div><strong>Position</strong><br>${esc(p.position||'')}</div><div><strong>Pay Period</strong><br>${E.fmtPay(p.cycle.start)} - ${E.fmtPay(p.cycle.end)}</div><div><strong>Payment Date</strong><br>${E.fmtPay(p.cycle.paymentDate)}</div></div><div class="section-title">Pay Summary</div>${table(['','Current','YTD'],[['Gross',E.money(p.gross),E.money(ytd)],['Tax',E.money(p.tax),E.money(ytdTax)],['Net',E.money(p.net),E.money(ytd-ytdTax)]])}<div class="section-title">Earnings</div><table><thead><tr><th>Description</th><th>Units</th><th>Amount</th><th>Begin Dt</th><th>End Dt</th></tr></thead><tbody>${rows}<tr><td><strong>Total</strong></td><td class="right"><strong>${Number(p.units||0).toFixed(2)}</strong></td><td class="right"><strong>${Number(p.gross||0).toFixed(2)}</strong></td><td></td><td></td></tr></tbody></table><div class="section-title">Tax</div>${table(['Description','Amount'],taxRows)}<div class="section-title">Employer Superannuation</div>${table(['Description','Amount'],[['Employer Super Contribution',E.money(p.superAmt)]])}<div class="section-title">Leave Balance</div>${table(['Description','Balance'],[['Annual Leave Balance (Hours)',Number(p.balances.annual||0).toFixed(2)],['Personal Leave Balance (Hours)',Number(p.balances.personal||0).toFixed(2)],['LSL Accrued Balance (Hours)',Number(p.balances.lslAccrued||0).toFixed(2)],['LSL Entitlement Date',E.fmtPay(p.balances.lslEntitlementDate)]])}</div>`;
  }

  function renderCertification(){ const visible=E.PAY_CYCLES.filter(c=>c.id<=currentCycle().id || E.isFinalised(state,c)); h('certification', `<h2>Certification Report</h2><p class="small-note">Reports are only available for the current/open pay and previous generated pay periods. Future reports are not shown.</p><div class="grid form-grid"><div><label>Pay Cycle</label><select id="certCycle">${visible.map(c=>`<option value="${c.id}" ${c.id===currentCycle().id?'selected':''}>${E.cycleDisplay(c)}</option>`).join('')}</select></div></div><div id="certOutput"></div>`); $('certCycle').addEventListener('change',renderCertOutput); renderCertOutput(); }
  function renderCertOutput(){ const c=E.cycleById(v('certCycle')||currentCycle().id); const locked=!!state.certifications[String(c.id)]; const lines=(c.id===currentCycle().id?currentResults():state.payslips.filter(p=>Number(p.cycleId)===Number(c.id))); if(!lines.length){ h('certOutput','<p class="small-note">No payslips generated for this pay period.</p>'); return; } h('certOutput', table(['Employee','Position','Gross','Tax','Net','Certify'], lines.map(p=>[esc(p.employeeName),esc(p.position),E.money(p.gross),E.money(p.tax),E.money(p.net),`<input type="checkbox" class="certLine" data-id="${esc(p.id)}" ${locked?'checked disabled':''}>`])) + `<div class="divider"></div><div class="grid form-grid"><div><label>Name</label><input id="certName" ${locked?'readonly':''} value="${esc(state.certifications[String(c.id)]?.name||'')}"></div><div><label>Position</label><input id="certPosition" ${locked?'readonly':''} value="${esc(state.certifications[String(c.id)]?.position||'')}"></div></div><p><label><input type="checkbox" id="certDeclaration" ${locked?'checked disabled':''}> I certify to the best of my knowledge, this pay is correct</label></p><button id="saveCert" ${locked?'disabled':''}>Save</button>`); if(!locked) $('saveCert').addEventListener('click',()=>saveCertification(c.id)); }
  function saveCertification(cycleId){ const checks=[...document.querySelectorAll('.certLine')]; if(checks.some(c=>!c.checked)) return alert('Please certify each pay line.'); if(!v('certName')||!v('certPosition')) return alert('Enter name and position.'); if(!$('certDeclaration').checked) return alert('Please tick the certification declaration.'); state.certifications[String(cycleId)]={name:v('certName'),position:v('certPosition'),savedAt:new Date().toISOString(),locked:true}; save(); log(`Certification Report saved for ${E.ppeLabel(E.cycleById(cycleId))}`); renderCertification(); }

  function renderAudit(){ h('audit', `<h2>Audit Log</h2>${state.auditLog.map(x=>`<div class="history-item">${esc(x)}</div>`).join('')}`); }
  function renderSettings(){ h('settings', `<h2>Settings</h2><p><strong>Current app version:</strong> v${APP_VERSION}</p><div class="controls"><button id="checkUpdates">Check for Updates</button><button id="changeNotes" class="secondary">Change Notes</button><button id="overnight" class="secondary">Check Overnight Processing</button><button id="finalisePay" class="warning">Finalise Pay</button></div><div class="controls"><button id="publicHolidays" class="secondary">View WA Public Holidays</button></div><div id="settingsOutput" class="small-note"></div>`); $('checkUpdates').addEventListener('click',checkForUpdates); $('changeNotes').addEventListener('click',openChangeNotes); $('overnight').addEventListener('click',()=>checkOvernightProcessing(true)); $('finalisePay').addEventListener('click',openFinalisePay); $('publicHolidays').addEventListener('click',openPublicHolidays); }
  async function checkForUpdates(){ h('settingsOutput','Checking for updates...'); try{ const res=await fetch('./latest-version.json?ts='+Date.now()); if(!res.ok) throw new Error('No file'); const latest=await res.json(); h('settingsOutput', latest.version===APP_VERSION?`You are up to date. Current version: v${APP_VERSION}.`:`Update available: v${esc(latest.version)}. Export data before replacing files.`); }catch(e){ h('settingsOutput','Could not check updates. Make sure latest-version.json has been uploaded.'); } }
  const changeNotes=[{version:'v1.1.1',notes:['Added retro prior-processing cut-off of 03/05/2026 while preserving older service and commencement dates.','Added Tax Details tab with effective-dated TFN, tax-free-threshold and STSL records, masked TFN reveal-on-hold, save/unsaved warning logic and payslip tax/STSL lines.','Added personal details capture on commencement and effective-dated personal details updates/viewing from Employees.','Removed LSL pro-rata from payslips while keeping LSL accrued and LSL entitlement date.','Removed Super from Certification Report and placed View WA Public Holidays on a new Settings line.','Added public holidays to the Absence Calendar key and calendar display.','Added rehire reminder toast for personal and tax details.']},{version:'v1.1.0',notes:['Restructured into separate GitHub Pages files: index.html, styles.css, app.js, payroll-engine.js, data-store.js and test-cases.js.','Locked first pay cycle to PPE4/6/26, Period 22/5/26 - 4/6/26, Payment Date 4/6/26, Pay close 29/5/26.','Added repeatable test cases for pay cycle, inclusive dates, retro, login/version strings and dropdown assumptions.','Kept employee-selected Calculate Pay, Additional Earnings, Certification Report, Leave, Absence Calendar, Rehire, Extend Contract and manual Finalise Pay.']},{version:'v1.0.11',notes:['Emergency rebuild for login/version issues.']},{version:'v1.0.10',notes:['Attempted pay-cycle and retro fixes. Replaced by structured v1.1.0 project.']},{version:'v1.0.9',notes:['Added Additional Earnings, Rehire Employee, Extend Contract and Certification Report concepts.']}];
  function openChangeNotes(){ modal('Change Notes', changeNotes.map(n=>`<div class="history-item"><strong>${esc(n.version)}</strong><ul>${n.notes.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`).join(''), '', false); }
  function openPublicHolidays(){ modal('Western Australia Public Holidays', table(['Date','Public Holiday'], E.PUBLIC_HOLIDAYS_WA.map(p=>[E.fmtPay(p[0]),esc(p[1])])), '', false); }
  function checkOvernightProcessing(manual){ const today=todayIso(); if(manual && state.lastOvernightDate===today) return alert('Overnight processing has already been checked today.'); if(manual && !confirm('If overnight processing should have run, do you want to run it now?')) return; state.lastOvernightDate=today; calculateAllForCurrent(); save(); if(manual) showProcessing('Overnight Processing in Progress',()=>{ log('Overnight processing checked/run. Pay was calculated but not finalised.'); renderAll(); }); }
  function openFinalisePay(){ const c=currentCycle(); confirmModal(`Are you sure you want to finalise the pay for ${E.ppeLabel(c)}?`, 'Yes', ()=>showProcessing('Pay Finalisation in Progress',()=>{ const result=E.finaliseCurrentPay(state); save(); calculateAllForCurrent(); log(`Pay finalised for ${E.ppeLabel(result.finalisedCycle)}. Next pay opened: ${E.ppeLabel(result.nextCycle)}`); renderAll(); })); }
  function showProcessing(title,callback){ logout(); h('processingTitle',title); $('processingScreen').classList.add('open'); setTimeout(()=>{ callback && callback(); $('processingScreen').classList.remove('open'); }, 1600); }

  function openCalculateModal(){ modal('Calculate Pay', `<label>Select Employee</label><select id="calcEmp">${employeeOptions(activeEmployees())}</select>`, `<button id="calcCancel" class="secondary" data-close-modal>Cancel</button><button id="calcRun">Calculate</button>`, true); $('calcRun').addEventListener('click',()=>{ const id=v('calcEmp'); if(!id) return alert('Select an employee.'); closeModal(); loadingModal('Calculate Pay','Pay Run Successful',()=>{ calculateOne(id); log(`Calculate Pay run for ${E.employeeName(emp(id))}`); renderAll(); },800); }); }

  function exportData(){ save(); const blob=new Blob([DataStore.exportJson(state)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='payroll-app-data.json'; a.click(); log('Data exported'); }
  function importData(event){ const file=event.target.files[0]; if(!file) return; const reader=new FileReader(); reader.onload=()=>{ try{ state=DataStore.importJson(reader.result); save(); calculateAllForCurrent(); renderAll(); log('Data imported'); }catch(err){ alert('Import failed. Please select a valid payroll-app-data.json file.'); } }; reader.readAsText(file); event.target.value=''; }
  function todayIso(){ const d=new Date(); return E.iso(new Date(d.getFullYear(),d.getMonth(),d.getDate())); }

  window.PayrollApp = { getState:()=>state, renderAll, calculateAllForCurrent, login };
})();
