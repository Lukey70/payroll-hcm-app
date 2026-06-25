(function(){
  'use strict';

  const PASSWORD = '1234';
  const APP_VERSION = DataStore.APP_VERSION;
  const E = PayrollEngine;
  let state = DataStore.load();
  let activeTab = 'dashboard';
  let leaveMonthOffset = 0;
  let selectedCalendarEmp = '';
  let additionalDraftRows = [];
  let additionalDirty = false;

  const $ = id => document.getElementById(id);
  const qsa = sel => Array.from(document.querySelectorAll(sel));
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const h = (id, html) => { const el=$(id); if(el) el.innerHTML = html; };
  const v = id => $(id)?.value || '';
  const n = id => Number(v(id) || 0);
  const money = value => `$${E.money(value).toLocaleString('en-AU',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const uid = prefix => DataStore.uid(prefix);
  const save = () => DataStore.save(state);
  const currentCycle = () => E.cycleById(state.currentCycleId || 1);
  const empById = id => state.employees.find(e=>e.id===id);
  const fullName = e => E.fullName(e);

  function table(headers, rows){
    return `<table><thead><tr>${headers.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(r=>`<tr>${r.map(c=>`<td>${c ?? ''}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}" class="muted">No records.</td></tr>`}</tbody></table>`;
  }
  function optionEmployees(selected='', activeOnly=false){
    const c = currentCycle();
    const emps = activeOnly ? E.activeEmployees(state, c.end) : state.employees;
    return `<option value="">Choose employee</option>` + emps.map(e=>`<option value="${esc(e.id)}" ${e.id===selected?'selected':''}>${esc(fullName(e))} (${esc(e.id)})</option>`).join('');
  }
  function cycleOptions(selected=state.currentCycleId, allowFuture=1){
    const maxId = Number(state.currentCycleId || 1) + allowFuture;
    return E.PAY_CYCLES.filter(c=>c.id<=maxId).map(c=>`<option value="${c.id}" ${Number(c.id)===Number(selected)?'selected':''}>${esc(E.ppeLabel(c))} — ${esc(E.fmtPay(c.start))} to ${esc(E.fmtPay(c.end))}</option>`).join('');
  }
  function badge(text){
    const cls = text === 'Active' || text === 'Approved' ? 'active' : text === 'Terminated' ? 'term' : 'warn';
    return `<span class="badge ${cls}">${esc(text)}</span>`;
  }
  function toast(message){
    h('toast', esc(message));
    $('toast').classList.add('show');
    setTimeout(()=>$('toast').classList.remove('show'), 2600);
  }
  function modal(title, body, footer){
    h('modalTitle', title);
    h('modalBody', body);
    h('modalFooter', footer || `<button class="secondary" data-close-modal>Close</button>`);
    $('modalBackdrop').classList.add('open');
    qsa('[data-close-modal]').forEach(b=>b.addEventListener('click', closeModal));
  }
  function closeModal(){ $('modalBackdrop').classList.remove('open'); }
  function confirmModal(message, yesText, onYes){
    modal('Confirm', `<p>${esc(message)}</p>`, `<button class="secondary" data-close-modal>Cancel</button><button id="confirmYes" class="danger">${esc(yesText||'Yes')}</button>`);
    $('confirmYes').addEventListener('click', ()=>{ closeModal(); onYes(); });
  }
  function processing(text, doneText, work){
    h('processingText', text);
    $('processing').classList.add('open');
    setTimeout(()=>{
      try{ work(); }
      finally{
        h('processingText', doneText || 'Successful');
        setTimeout(()=>{$('processing').classList.remove('open'); renderAll(); toast(doneText || 'Successful');}, 450);
      }
    }, 300);
  }
  function log(message){ state.auditLog.unshift(`${new Date().toLocaleString('en-AU')} — ${message}`); save(); }

  function initAuth(){
    $('loginButton').addEventListener('click', login);
    $('passwordInput').addEventListener('keydown', e=>{ if(e.key==='Enter') login(); });
    $('logoutButton').addEventListener('click', ()=>{
      $('app').classList.remove('authenticated');
      $('loginScreen').style.display = 'grid';
      $('passwordInput').value = '';
      $('passwordInput').focus();
    });
  }
  function login(){
    if(v('passwordInput') !== PASSWORD){ h('loginError','Incorrect password.'); return; }
    h('loginError','');
    $('loginScreen').style.display = 'none';
    $('app').classList.add('authenticated');
    renderAll();
  }

  const NAV = [
    {id:'dashboard', label:'Dashboard'},
    {label:'Employee Data', children:[
      {id:'personalDetails', label:'Personal Details'},
      {id:'bankDetails', label:'Bank Details'},
      {id:'taxDetails', label:'Tax Details'},
      {id:'superDetails', label:'Super'}
    ]},
    {id:'jobSummary', label:'Job Summary'},
    {id:'additionalEarnings', label:'Additional Earnings'},
    {id:'leave', label:'Leave & Absence'},
    {id:'payslip', label:'Payslip'},
    {id:'certification', label:'Certification Report'},
    {id:'deductions', label:'Deductions'},
    {id:'audit', label:'Audit Log'},
    {id:'settings', label:'Settings'}
  ];
  function renderNav(){
    h('nav', NAV.map(item=>{
      if(item.children){
        return `<div class="nav-section"><button class="nav-parent" data-nav-parent="employeeData">${esc(item.label)} <span>▾</span></button><div id="navChildren_employeeData" class="nav-children open">${item.children.map(c=>`<button class="nav-btn nav-child ${activeTab===c.id?'active':''}" data-tab="${esc(c.id)}">${esc(c.label)}</button>`).join('')}</div></div>`;
      }
      return `<div class="nav-section"><button class="nav-btn ${activeTab===item.id?'active':''}" data-tab="${esc(item.id)}">${esc(item.label)}</button></div>`;
    }).join(''));
    qsa('[data-tab]').forEach(btn=>btn.addEventListener('click', ()=>switchTab(btn.dataset.tab)));
    qsa('[data-nav-parent]').forEach(btn=>btn.addEventListener('click', ()=>{
      const children = $(`navChildren_${btn.dataset.navParent}`);
      children.classList.toggle('open');
    }));
  }
  function switchTab(id){
    if(activeTab === 'payslip' && id !== 'payslip'){
      state.selectedPayslipId = '';
      const out = $('payslipOutput');
      if(out) out.innerHTML = '';
    }
    activeTab = id;
    qsa('.tab').forEach(t=>t.classList.toggle('active', t.id===id));
    renderNav();
    renderCurrentTab();
    const main = $('main');
    if(main) main.scrollTop = 0;
    window.scrollTo({top:0, left:0, behavior:'instant'});
  }

  function updateMetrics(){
    const c = currentCycle();
    const summary = E.summariseCycle(state, c.id);
    h('metricEmployees', String(E.activeEmployees(state, c.end).length));
    h('metricGross', money(summary.gross));
    h('metricRetro', money(summary.retro));
    h('metricPeriod', E.ppeLabel(c));
    const openAlerts = (state.alerts||[]).filter(a=>!a.read);
    const badge = $('alertsBadge');
    badge.textContent = String(openAlerts.length);
    badge.classList.toggle('visible', openAlerts.length>0);
  }
  function renderAlertsDropdown(){
    const alerts = (state.alerts||[]).filter(a=>!a.read);
    h('alertsDropdown', alerts.length ? alerts.map(a=>`<div class="alert-item"><strong>${esc(a.title||'Alert')}</strong><br><small>${esc(a.message||'')}</small></div>`).join('') : `<div class="no-alerts">No New Alerts</div>`);
  }

  function renderAll(){
    save();
    renderNav();
    renderCurrentTab();
    updateMetrics();
    renderAlertsDropdown();
  }
  function renderCurrentTab(){
    const map = {
      dashboard: renderDashboard,
      personalDetails: renderPersonalDetails,
      bankDetails: renderBankDetails,
      taxDetails: renderTaxDetails,
      superDetails: renderSuperDetails,
      jobSummary: renderJobSummary,
      additionalEarnings: renderAdditionalEarnings,
      leave: renderLeave,
      payslip: renderPayslip,
      certification: renderCertification,
      deductions: renderDeductions,
      audit: renderAudit,
      settings: renderSettings
    };
    (map[activeTab] || renderDashboard)();
  }

  function renderDashboard(){
    const c = currentCycle();
    const summary = E.summariseCycle(state, c.id);
    h('dashboard', `
      <div class="tab-card">
        <h2>Dashboard</h2>
        <div class="grid four-grid">
          <p><strong>Current pay:</strong> ${esc(E.ppeLabel(c))}</p>
          <p><strong>Period:</strong> ${esc(E.fmtPay(c.start))} - ${esc(E.fmtPay(c.end))}</p>
          <p><strong>Payment date:</strong> ${esc(E.fmtPay(c.paymentDate))}</p>
          <p><strong>Pay close:</strong> ${esc(E.fmtPay(c.closeDate))}</p>
        </div>
        <div class="pa-summary">
          <div><small>Active Employees</small><strong>${E.activeEmployees(state,c.end).length}</strong></div>
          <div><small>Gross</small><strong>${money(summary.gross)}</strong></div>
          <div><small>Retro/Arrears</small><strong>${money(summary.retro)}</strong></div>
          <div><small>Net</small><strong>${money(summary.net)}</strong></div>
        </div>
        <p class="small-note">First/current pay cycle is fixed to PPE 04/06/2026 and does not move with the browser date.</p>
      </div>
      <div class="tab-card">
        <h3>Recent changes included in this version</h3>
        <ul>
          <li>LSL Entitlement Date appears under Payslip Leave Balance, while Pro-rata LSL is excluded from payslips.</li>
          <li>Address changes are effective-dated and finalised payslips keep their original address snapshot.</li>
          <li>Absence Calendar has an Other Leave key item in dark green after Leave Without Pay and before Public Holiday.</li>
          <li>Payslip content is scoped to the Payslip tab and tabs reset to the top below the fixed bar.</li>
          <li>Print CSS targets one A4 page where possible and removes trailing blank pages.</li>
          <li>Alert bell dropdown has a No New Alerts placeholder and notification badge foundation.</li>
          <li>Employee Data dropdown contains Personal Details, Bank Details, Tax Details and Super.</li>
          <li>Public holidays pay only where the day is a regular/effective-dated working day.</li>
          <li>Retro pay rate changes calculate the difference only and keep separate retro lines per earnings type.</li>
        </ul>
      </div>`);
  }

  function renderPersonalDetails(){
    const rows = state.employees.map(e=>{
      const addr = E.addressFor(state, e.id, currentCycle().paymentDate);
      const schBtn = `<button class="secondary" data-view-sch="${esc(e.id)}" title="View schedule">👁</button>`;
      return [esc(e.id), esc(fullName(e)), esc(e.type), badge(e.status), esc(E.fmtPay(e.startDate)), esc(e.terminationDate ? E.fmtPay(e.terminationDate) : ''), esc(addr), schBtn];
    });
    h('personalDetails', `
      <div class="tab-card">
        <h2>Personal Details</h2>
        <div class="controls"><button id="openAddEmployee">Add New Employee</button><button id="openAddressChange" class="secondary">Update Address</button><button id="openTermination" class="secondary">Process Termination</button><button id="openRehire" class="secondary">Rehire Employee</button><button id="openExtendContract" class="secondary">Extend Contract</button></div>
        ${table(['ID','Employee','Type','Status','Start Date','Termination Date','Current Address','Schedule'], rows)}
      </div>`);
    $('openAddEmployee').addEventListener('click', openAddEmployeeModal);
    $('openAddressChange').addEventListener('click', openAddressChangeModal);
    $('openTermination').addEventListener('click', openTerminationModal);
    $('openRehire').addEventListener('click', openRehireModal);
    $('openExtendContract').addEventListener('click', openExtendContractModal);
    qsa('[data-view-sch]').forEach(b=>b.addEventListener('click',()=>openScheduleModal(b.dataset.viewSch)));
  }

  function openAddEmployeeModal(){
    modal('Add New Employee', `
      <div class="grid form-grid">
        <div><label>Employee ID</label><input id="newEmpId" placeholder="Auto if blank"></div>
        <div><label>First Name</label><input id="newFirst"></div>
        <div><label>Last Name</label><input id="newLast"></div>
        <div><label>Employee Type</label><select id="newType"><option>Permanent</option><option>Fixed Term</option><option>Casual</option></select></div>
        <div><label>Start Date</label><input type="date" id="newStart" value="2026-05-22"></div>
        <div><label>Department</label><input id="newDept" value="Payroll"></div>
        <div><label>Position</label><input id="newPosition" value="Officer"></div>
        <div><label>Hourly Rate</label><input type="number" id="newRate" step="0.01" value="40"></div>
        <div><label>Address</label><input id="newAddress" placeholder="Street, suburb WA"></div>
        <div><label>AL Opening Hours</label><input type="number" id="newAL" step="0.01" value="150"></div>
        <div><label>PL Opening Hours</label><input type="number" id="newPL" step="0.01" value="100"></div>
        <div><label>LSL Accrued Hours</label><input type="number" id="newLSL" step="0.01" value="0"></div>
      </div>
      <h3>Work Schedule</h3>
      <div class="grid form-grid">
        ${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d,i)=>`<div><label>${d}</label><input type="number" id="newDay${i}" step="0.01" value="${i<5?'7.5':'0'}"></div>`).join('')}
      </div>`,
      `<button class="secondary" data-close-modal>Cancel</button><button id="saveNewEmployee">Save Employee</button>`);
    $('saveNewEmployee').addEventListener('click', saveNewEmployee);
  }
  function readModalSchedule(prefix){ return {1:n(`${prefix}Day0`),2:n(`${prefix}Day1`),3:n(`${prefix}Day2`),4:n(`${prefix}Day3`),5:n(`${prefix}Day4`),6:n(`${prefix}Day5`),0:n(`${prefix}Day6`)}; }
  function saveNewEmployee(){
    if(!v('newFirst') || !v('newLast')) return alert('Enter first and last name.');
    const id = v('newEmpId') || String(Date.now()).slice(-6);
    if(empById(id)) return alert('That Employee ID already exists.');
    const e = { id, firstName:v('newFirst'), lastName:v('newLast'), type:v('newType'), status:'Active', startDate:v('newStart'), originalStartDate:v('newStart'), lslServiceDate:v('newStart'), department:v('newDept'), position:v('newPosition'), hourlyRate:n('newRate'), annualLeaveBalance:n('newAL'), personalLeaveBalance:n('newPL'), lslAccruedBalance:n('newLSL'), lslProRataBalance:0, taxFreeThreshold:'Yes', stsl:'No', tfn:'' };
    e.name = fullName(e);
    state.employees.push(e);
    state.addressHistory.push({id:uid('addr'), empId:id, effectiveDate:e.startDate, address:v('newAddress')});
    state.schedules.push({id:uid('sch'), empId:id, effectiveDate:e.startDate, hoursByDay:readModalSchedule('new')});
    state.payRates.push({id:uid('rate'), empId:id, effectiveDate:e.startDate, position:e.position, hourlyRate:e.hourlyRate, changeType:'Commencement'});
    state.jobEvents.push({id:uid('event'), empId:id, type:'Commencement', effectiveDate:e.startDate, details:'Employee commenced and initial personal details, schedule and rate were created.'});
    log(`Employee ${fullName(e)} added.`);
    closeModal(); renderAll();
  }

  function openAddressChangeModal(){
    modal('Update Address', `
      <div class="grid two-grid">
        <div><label>Employee</label><select id="addrEmp">${optionEmployees(state.selectedEmployeeId)}</select></div>
        <div><label>Effective Date</label><input type="date" id="addrDate" value="${esc(currentCycle().paymentDate)}"></div>
      </div>
      <div><label>New Address</label><input id="addrText"></div>
      <p class="small-note">Finalised payslips keep the address snapshot they had when finalised. The new address is used only for current/open and future payslips from the effective date.</p>`,
      `<button class="secondary" data-close-modal>Cancel</button><button id="saveAddress">Save Address</button>`);
    $('addrEmp').addEventListener('change', ()=>{ const emp = empById(v('addrEmp')); $('addrText').value = emp ? E.addressFor(state, emp.id, v('addrDate')) : ''; });
    $('saveAddress').addEventListener('click', ()=>{
      if(!v('addrEmp') || !v('addrDate')) return alert('Choose employee and effective date.');
      state.addressHistory.push({id:uid('addr'), empId:v('addrEmp'), effectiveDate:v('addrDate'), address:v('addrText')});
      state.jobEvents.push({id:uid('event'), empId:v('addrEmp'), type:'Address Change', effectiveDate:v('addrDate'), details:'Effective-dated address change saved.'});
      log('Address change saved. Finalised payslips were not changed.');
      closeModal(); renderAll();
    });
  }

  function openScheduleModal(empId){
    const emp = empById(empId);
    const rows = E.daysBetween('2026-05-18','2026-05-24').map(day=>[new Date(E.parseDate(day)).toLocaleDateString('en-AU',{weekday:'long'}), E.scheduledHoursOn(state, empId, day)]);
    modal(`Current Schedule — ${esc(fullName(emp))}`, table(['Day','Hours'], rows), `<button class="secondary" data-close-modal>Close</button>`);
  }
  function openTerminationModal(){
    modal('Process Termination', `<div class="grid two-grid"><div><label>Employee</label><select id="termEmp">${optionEmployees('',true)}</select></div><div><label>Termination Date</label><input type="date" id="termDate" value="${esc(currentCycle().end)}"></div></div><p class="small-note">Accrued LSL payout will be handled by the payroll engine when termination payout rules are expanded.</p>`, `<button class="secondary" data-close-modal>Cancel</button><button id="saveTerm" class="danger">Terminate</button>`);
    $('saveTerm').addEventListener('click', ()=>{ const e=empById(v('termEmp')); if(!e) return alert('Choose employee.'); e.status='Terminated'; e.terminationDate=v('termDate'); state.jobEvents.push({id:uid('event'),empId:e.id,type:'Termination',effectiveDate:v('termDate'),details:'Termination processed.'}); log(`${fullName(e)} terminated effective ${E.fmtPay(v('termDate'))}.`); closeModal(); renderAll(); });
  }
  function openRehireModal(){
    const terms = state.employees.filter(e=>e.status==='Terminated');
    modal('Rehire Employee', `<div class="grid two-grid"><div><label>Terminated Employee</label><select id="rehireEmp"><option value="">Choose employee</option>${terms.map(e=>`<option value="${esc(e.id)}">${esc(fullName(e))}</option>`).join('')}</select></div><div><label>Rehire Date</label><input type="date" id="rehireDate" value="${esc(currentCycle().start)}"></div></div>`, `<button class="secondary" data-close-modal>Cancel</button><button id="saveRehire">Rehire</button>`);
    $('saveRehire').addEventListener('click', ()=>{ const e=empById(v('rehireEmp')); if(!e) return alert('Choose employee.'); e.status='Active'; e.startDate=v('rehireDate'); e.lslServiceDate=v('rehireDate'); e.terminationDate=''; state.jobEvents.push({id:uid('event'),empId:e.id,type:'Rehire',effectiveDate:v('rehireDate'),details:'Employee rehired; LSL entitlement date recalculated from rehire date.'}); log(`${fullName(e)} rehired.`); closeModal(); renderAll(); });
  }
  function openExtendContractModal(){
    const fixed = state.employees.filter(e=>e.type==='Fixed Term' && e.status!=='Terminated');
    modal('Extend Contract', `<div class="grid two-grid"><div><label>Fixed Term Employee</label><select id="contractEmp"><option value="">Choose employee</option>${fixed.map(e=>`<option value="${esc(e.id)}">${esc(fullName(e))}</option>`).join('')}</select></div><div><label>New Contract End Date</label><input type="date" id="contractDate"></div></div>`, `<button class="secondary" data-close-modal>Cancel</button><button id="saveContract">Save Extension</button>`);
    $('saveContract').addEventListener('click', ()=>{ const e=empById(v('contractEmp')); if(!e) return alert('Choose employee.'); e.contractEndDate=v('contractDate'); state.jobEvents.push({id:uid('event'),empId:e.id,type:'New Fixed Term Contract',effectiveDate:v('contractDate'),details:'Fixed term contract end date updated.'}); log(`${fullName(e)} contract extended.`); closeModal(); renderAll(); });
  }

  function renderBankDetails(){
    h('bankDetails', `<div class="tab-card"><h2>Bank Details</h2><div class="empty">Bank Details tab placeholder. This is intentionally empty for now.</div></div>`);
  }
  function renderSuperDetails(){
    h('superDetails', `<div class="tab-card"><h2>Super</h2><div class="empty">Super tab placeholder. This is intentionally empty for now.</div></div>`);
  }
  function renderTaxDetails(){
    const selected = state.selectedEmployeeId || '';
    const emp = empById(selected);
    h('taxDetails', `<div class="tab-card"><h2>Tax Details</h2><div class="controls"><select id="taxEmp">${optionEmployees(selected)}</select></div>${emp ? `
      <div class="grid form-grid">
        <div><label>TFN</label><input id="taxTfn" value="${esc(emp.tfn||'')}"></div>
        <div><label>Tax-free threshold</label><select id="taxThreshold"><option ${emp.taxFreeThreshold!=='No'?'selected':''}>Yes</option><option ${emp.taxFreeThreshold==='No'?'selected':''}>No</option></select></div>
        <div><label>STSL</label><select id="taxStsl"><option ${emp.stsl!=='Yes'?'selected':''}>No</option><option ${emp.stsl==='Yes'?'selected':''}>Yes</option></select></div>
        <div><label>Marginal Tax</label><select id="taxMarginal"><option ${emp.marginalTax!=='Yes'?'selected':''}>No</option><option ${emp.marginalTax==='Yes'?'selected':''}>Yes</option></select></div>
      </div><div class="controls"><button id="saveTaxDetails">Save Tax Details</button></div>
      <p class="small-note">PAYG source: ${esc(E.PAYG_SOURCE)}. STSL source: ${esc(E.STSL_SOURCE)}.</p>` : `<div class="empty">Choose an employee to view or edit tax details.</div>`}</div>`);
    $('taxEmp').addEventListener('change', ()=>{ state.selectedEmployeeId=v('taxEmp'); renderTaxDetails(); });
    if(emp) $('saveTaxDetails').addEventListener('click', ()=>{ emp.tfn=v('taxTfn'); emp.taxFreeThreshold=v('taxThreshold'); emp.stsl=v('taxStsl'); emp.marginalTax=v('taxMarginal'); state.jobEvents.push({id:uid('event'), empId:emp.id, type:'Tax Details', effectiveDate:currentCycle().paymentDate, details:'Tax details updated.'}); log(`Tax details saved for ${fullName(emp)}.`); renderAll(); });
  }

  function renderJobSummary(){
    const events = [];
    state.employees.forEach(e=>events.push({id:`emp_${e.id}`, empId:e.id, type:'Personal Details', effectiveDate:e.startDate, details:'Employee personal record.'}));
    state.addressHistory.forEach(a=>events.push({id:a.id, empId:a.empId, type:'Address Change', effectiveDate:a.effectiveDate, details:a.address}));
    state.schedules.forEach(s=>events.push({id:s.id, empId:s.empId, type:'Schedule Change', effectiveDate:s.effectiveDate, details:`Weekly hours ${Object.values(s.hoursByDay||{}).reduce((x,y)=>x+Number(y||0),0)}`}));
    state.payRates.forEach(r=>events.push({id:r.id, empId:r.empId, type:'Position/Pay Rate Change', effectiveDate:r.effectiveDate, details:`${r.position || ''} — ${money(r.hourlyRate)}/hr`}));
    state.jobEvents.forEach(j=>events.push(j));
    events.sort((a,b)=>E.cmp(b.effectiveDate,a.effectiveDate));
    const rows = events.map(x=>[esc(E.fmtPay(x.effectiveDate)), esc(fullName(empById(x.empId)||{id:x.empId})), esc(x.type), esc(x.details), x.id.startsWith('emp_') ? '' : `<button class="danger" data-del-event="${esc(x.id)}">Delete</button>`]);
    h('jobSummary', `<div class="tab-card"><h2>Job Summary</h2><p class="small-note">Leave bookings do not appear in Job Summary.</p>${table(['Effective Date','Employee','Entry Type','Details','Action'], rows)}</div>`);
    qsa('[data-del-event]').forEach(b=>b.addEventListener('click',()=>confirmModal('Are you sure you want to delete this entry? This may result in pay recalculations.','Delete',()=>deleteJobEntry(b.dataset.delEvent))));
  }
  function deleteJobEntry(id){
    state.addressHistory = state.addressHistory.filter(x=>x.id!==id);
    state.schedules = state.schedules.filter(x=>x.id!==id);
    state.payRates = state.payRates.filter(x=>x.id!==id);
    state.jobEvents = state.jobEvents.filter(x=>x.id!==id);
    log('Job Summary entry deleted. Recalculation may be required.'); renderAll();
  }

  function renderAdditionalEarnings(){
    const selected = state.selectedEmployeeId || '';
    const cycleId = Number(v('addCycle') || state.currentCycleId || 1);
    const c = E.cycleById(cycleId);
    if(!additionalDirty){ additionalDraftRows = state.additionalEarnings.filter(a=>a.empId===selected && Number(a.cycleId)===Number(c.id)).map(DataStore.clone); }
    h('additionalEarnings', `<div class="tab-card"><h2>Additional Earnings</h2>
      <div class="grid three-grid">
        <div><label>Employee</label><select id="addEmp">${optionEmployees(selected,true)}</select></div>
        <div><label>Pay Period</label><select id="addCycle">${cycleOptions(c.id,1)}</select></div>
        <div><label>&nbsp;</label><button id="addRow">Add Row</button></div>
      </div>
      <div id="additionalRows"></div>
      <div id="additionalNote" class="small-note"></div>
      <div class="controls"><button id="saveAdditional">Save</button></div>
    </div>`);
    $('addEmp').addEventListener('change', ()=>{ if(checkAdditionalLeave()) return; state.selectedEmployeeId=v('addEmp'); additionalDirty=false; renderAdditionalEarnings(); });
    $('addCycle').addEventListener('change', ()=>{ if(checkAdditionalLeave()) return; additionalDirty=false; renderAdditionalEarnings(); });
    $('addRow').addEventListener('click', ()=>{ if(!v('addEmp')) return alert('Choose employee first.'); additionalDraftRows.push({id:uid('add'), empId:v('addEmp'), cycleId:Number(v('addCycle')), earningType:'Additional Day', startDate:c.start, endDate:c.start, hours:0, saved:false}); additionalDirty=true; renderAdditionalRows(); });
    $('saveAdditional').addEventListener('click', saveAdditional);
    renderAdditionalRows();
  }
  function checkAdditionalLeave(){ if(additionalDirty) return !confirm('Are you sure you want to exit without saving?'); return false; }
  function renderAdditionalRows(){
    const rows = additionalDraftRows.map((a,i)=>[`<select data-add="${i}|earningType"><option ${a.earningType==='Additional Day'?'selected':''}>Additional Day</option><option ${a.earningType==='Overtime 1.5'?'selected':''}>Overtime 1.5</option><option ${a.earningType==='Overtime 2.0'?'selected':''}>Overtime 2.0</option></select>`, `<input type="date" value="${esc(a.startDate||'')}" data-add="${i}|startDate">`, `<input type="date" value="${esc(a.endDate||'')}" data-add="${i}|endDate">`, `<input type="number" step="0.01" value="${esc(a.hours||0)}" data-add="${i}|hours">`, `<button class="danger" data-del-add="${esc(a.id)}">Delete</button>`]);
    h('additionalRows', table(['Earnings Type','Start Date','End Date','Hours','Action'], rows));
    h('additionalNote', additionalDirty ? 'Unsaved changes. Additional earnings will not appear on payslips until saved.' : '');
    qsa('[data-add]').forEach(el=>el.addEventListener('change',()=>{ const [idx,field]=el.dataset.add.split('|'); additionalDraftRows[Number(idx)][field]=field==='hours'?Number(el.value||0):el.value; additionalDirty=true; renderAdditionalRows(); }));
    qsa('[data-del-add]').forEach(b=>b.addEventListener('click',()=>{ additionalDraftRows = additionalDraftRows.filter(x=>x.id!==b.dataset.delAdd); additionalDirty=true; renderAdditionalRows(); }));
  }
  function saveAdditional(){
    const empId = v('addEmp'); const cycleId = Number(v('addCycle'));
    if(!empId) return alert('Choose employee first.');
    state.additionalEarnings = state.additionalEarnings.filter(a=>!(a.empId===empId && Number(a.cycleId)===cycleId));
    additionalDraftRows.forEach(a=>state.additionalEarnings.push(Object.assign({}, a, {empId, cycleId, saved:true})));
    additionalDirty = false; log('Additional earnings saved.'); E.calculateCycle(state, state.currentCycleId, [empId]); renderAll();
  }

  function renderLeave(){
    const c = currentCycle();
    if(!selectedCalendarEmp) selectedCalendarEmp = state.selectedEmployeeId || '';
    const base = E.parseDate(c.start); base.setMonth(base.getMonth()+leaveMonthOffset,1);
    const y=base.getFullYear(), m=base.getMonth();
    const first = new Date(y,m,1), last = new Date(y,m+1,0);
    const startPad = first.getDay()===0 ? 6 : first.getDay()-1;
    const days=[];
    for(let i=0;i<startPad;i++) days.push(null);
    for(let d=1; d<=last.getDate(); d++) days.push(E.iso(new Date(y,m,d)));
    h('leave', `<div class="tab-card"><h2>Leave & Absence</h2>
      <div class="controls"><button id="bookLeave">Book Leave</button><button id="viewBalances" class="secondary">Absence Balance</button><button id="filterCalendar" class="secondary">Filter</button></div>
      <div class="controls"><button id="prevMonth" class="secondary">Previous Month</button><strong>${base.toLocaleDateString('en-AU',{month:'long',year:'numeric'})}</strong><button id="nextMonth" class="secondary">Next Month</button></div>
      <div class="controls"><select id="calendarEmp"><option value="">Choose employee for calendar</option>${optionEmployees(selectedCalendarEmp,true).replace('<option value="">Choose employee</option>','')}</select></div>
      ${calendarKey()}
      <div id="calendarGrid" class="calendar">${renderCalendarDays(days)}</div>
    </div>`);
    $('bookLeave').addEventListener('click', openBookLeaveModal);
    $('viewBalances').addEventListener('click', openAbsenceBalanceModal);
    $('filterCalendar').addEventListener('click', ()=>$('calendarEmp').focus());
    $('prevMonth').addEventListener('click', ()=>{ leaveMonthOffset--; renderLeave(); });
    $('nextMonth').addEventListener('click', ()=>{ if(leaveMonthOffset>=12) return alert('Absence Calendar can only navigate up to one year ahead.'); leaveMonthOffset++; renderLeave(); });
    $('calendarEmp').addEventListener('change',()=>{ selectedCalendarEmp=v('calendarEmp'); state.selectedEmployeeId=selectedCalendarEmp; renderLeave(); });
  }
  function calendarKey(){
    return `<div class="key"><span class="key-item"><span class="swatch sw-blue"></span>Annual Leave</span><span class="key-item"><span class="swatch sw-orange"></span>Personal Leave</span><span class="key-item"><span class="swatch sw-purple"></span>Long Service Leave</span><span class="key-item"><span class="swatch sw-grey"></span>Non Rostered Day</span><span class="key-item"><span class="swatch sw-brown"></span>Leave Without Pay</span><span class="key-item"><span class="swatch sw-darkgreen"></span>Other Leave</span><span class="key-item"><span class="swatch sw-red"></span>Public Holiday</span></div>`;
  }
  function renderCalendarDays(days){
    const head = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>`<div class="day-name">${d}</div>`).join('');
    if(!selectedCalendarEmp) return head + `<div class="empty" style="grid-column:1 / -1">Choose an employee to view the absence calendar.</div>`;
    return head + days.map(day=>{
      if(!day) return `<div></div>`;
      const items=[];
      const sched = E.scheduledHoursOn(state, selectedCalendarEmp, day);
      if(sched<=0) items.push({type:'Non Rostered Day', text:'Non Rostered Day'});
      const ph = E.publicHoliday(day);
      if(ph && sched>0) items.push({type:'Public Holiday', text:ph[1]});
      E.leaveBookingsForDate(state, selectedCalendarEmp, day).forEach(l=>items.push({type:E.calendarCategory(l.type), text:l.type || 'Other Leave'}));
      return `<div class="cal-day"><div class="date">${E.parseDate(day).getDate()}</div>${items.map(i=>`<div class="cal-item cal-${esc(i.type).replaceAll(' ','-')}" title="${esc(i.text)}">${esc(i.text)}</div>`).join('')}</div>`;
    }).join('');
  }
  function openBookLeaveModal(){
    modal('Book Leave', `<div class="grid form-grid"><div><label>Employee</label><select id="leaveEmp">${optionEmployees(state.selectedEmployeeId,true)}</select></div><div><label>Leave Type</label><select id="leaveType"><option>Annual Leave</option><option>Personal Leave</option><option>Long Service Leave</option><option>Leave Without Pay</option></select></div><div><label>Start Date</label><input type="date" id="leaveStart" value="${esc(currentCycle().start)}"></div><div><label>End Date</label><input type="date" id="leaveEnd" value="${esc(currentCycle().start)}"></div><div><label>Hours (optional for partial day)</label><input type="number" step="0.01" id="leaveHours"></div></div><p class="small-note">Duration is calculated from scheduled working days only. Public holidays do not deduct leave and pay as Public Holiday if scheduled.</p>`, `<button class="secondary" data-close-modal>Cancel</button><button id="saveLeave">Save Leave</button>`);
    $('saveLeave').addEventListener('click', saveLeave);
  }
  function saveLeave(){
    const empId=v('leaveEmp'); const emp=empById(empId);
    if(!emp) return alert('Choose employee.');
    const start=v('leaveStart'), end=v('leaveEnd');
    if(!start || !end || E.cmp(end,start)<0) return alert('Enter a valid leave date range.');
    if((emp.startDate && E.cmp(start,emp.startDate)<0) || (emp.terminationDate && E.cmp(end,emp.terminationDate)>0)) return alert('Leave cannot be booked outside employment.');
    const overlap = state.leaveBookings.some(l=>l.empId===empId && l.status!=='Declined' && !(E.cmp(end,l.startDate)<0 || E.cmp(start,l.endDate)>0));
    if(overlap) return alert('Overlapping leave bookings are prevented.');
    let total=0;
    E.daysBetween(start,end).forEach(day=>{ if(E.publicHoliday(day)) return; total += E.scheduledHoursOn(state, empId, day); });
    if(Number(v('leaveHours'))>0 && start===end) total = Math.min(total, Number(v('leaveHours')));
    if(total<=0) return alert('This leave booking has 0 scheduled hours and cannot be saved.');
    state.leaveBookings.push({id:uid('leave'), empId, type:v('leaveType'), startDate:start, endDate:end, hours:Number(v('leaveHours')||0), status:'Approved'});
    log(`${v('leaveType')} booked for ${fullName(emp)}.`); closeModal(); renderAll();
  }
  function openAbsenceBalanceModal(){
    const empId = selectedCalendarEmp || state.selectedEmployeeId;
    const emp = empById(empId);
    if(!emp) return alert('Choose an employee first.');
    const p = E.calculatePayslip(state, empId, currentCycle().id, false);
    const b = p?.balances || {annualLeave:emp.annualLeaveBalance, personalLeave:emp.personalLeaveBalance, longServiceLeave:emp.lslAccruedBalance, lslEntitlementDate:E.lslEntitlementDate(emp)};
    modal(`Absence Balance — ${esc(fullName(emp))}`, table(['Balance Type','Hours / Date'], [['Annual Leave', E.round2(b.annualLeave)], ['Personal Leave', E.round2(b.personalLeave)], ['LSL Accrued', E.round2(b.longServiceLeave)], ['LSL Pro-rata', E.round2(emp.lslProRataBalance||0)], ['LSL Entitlement Date', E.fmtPay(b.lslEntitlementDate)]]), `<button class="secondary" data-close-modal>Close</button>`);
  }

  function renderPayslip(){
    const selected = state.selectedEmployeeId || '';
    const pays = state.payslips.filter(p=>!selected || p.empId===selected).sort((a,b)=>E.cmp(b.paymentDate,a.paymentDate));
    const chosen = state.selectedPayslipId ? state.payslips.find(p=>p.id===state.selectedPayslipId) : null;
    h('payslip', `<div class="tab-card"><h2>Payment Advice</h2><div class="controls"><select id="payEmp">${optionEmployees(selected)}</select></div><div class="payslip-list">${pays.map(p=>`<button class="payslip-date ${chosen?.id===p.id?'active':''}" data-open-pay="${esc(p.id)}">${esc(E.fmtPay(p.paymentDate))} — ${esc(p.employeeName)}</button>`).join('') || '<span class="muted">No payslips yet. Calculate pay first.</span>'}</div></div><div id="payslipOutput">${chosen ? renderPaymentAdvice(chosen) : ''}</div>`);
    $('payEmp').addEventListener('change',()=>{ state.selectedEmployeeId=v('payEmp'); state.selectedPayslipId=''; renderPayslip(); });
    qsa('[data-open-pay]').forEach(b=>b.addEventListener('click',()=>{ state.selectedPayslipId = state.selectedPayslipId===b.dataset.openPay ? '' : b.dataset.openPay; renderPayslip(); }));
    const printBtn = $('printPayslip'); if(printBtn) printBtn.addEventListener('click', printSelectedPayslip);
  }
  function renderPaymentAdvice(p){
    const earningsRows = (p.rows||[]).map(r=>[esc(r.description), E.fmtPay(r.from), E.fmtPay(r.to), E.round2(r.units), money(r.rate), money(r.amount)]);
    const dedRows = (p.deductions||[]).map(d=>[esc(d.description), E.fmtPay(d.from), E.fmtPay(d.to), '', '', `-${money(d.amount)}`]);
    return `<div class="print-actions"><button id="printPayslip">Print Payment Advice</button>${p.finalised?'<span class="pill">Finalised</span>':'<span class="pill">Not Finalised</span>'}</div><div class="print-area"><article class="payment-advice">
      <div>
        <div class="pa-header"><div><div class="pa-title">Payment Advice</div><div>Payroll/HCM Demo Employer</div></div><div><strong>${esc(p.employeeName)}</strong><br>${esc(p.addressSnapshot || '')}<br>${esc(p.position || '')}</div></div>
        <div class="pa-summary"><div><small>Pay Period</small><strong>${esc(E.fmtPay(p.periodStart))} - ${esc(E.fmtPay(p.periodEnd))}</strong></div><div><small>Payment Date</small><strong>${esc(E.fmtPay(p.paymentDate))}</strong></div><div><small>Gross</small><strong>${money(p.gross)}</strong></div><div><small>Net</small><strong>${money(p.net)}</strong></div></div>
        <section class="pa-section"><h3>Earnings</h3>${table(['Description','From','To','Units','Rate','Amount'], earningsRows)}</section>
        ${dedRows.length ? `<section class="pa-section"><h3>Deductions</h3>${table(['Description','From','To','Units','Rate','Amount'], dedRows)}</section>` : ''}
        <section class="pa-section"><h3>Tax and Super Summary</h3>${table(['Item','Amount'], [['PAYG Withholding', money(p.payg)], ['STSL', money(p.stsl)], ['Employer Super Contribution', money(p.employerSuper)]])}<p class="small-note">PAYG: ${esc(p.taxSource || E.PAYG_SOURCE)}. STSL: ${esc(p.stslSource || E.STSL_SOURCE)}.</p></section>
      </div>
      <section class="pa-section"><h3>Leave Balance</h3><div class="balance-grid"><div class="balance-cell"><strong>Annual Leave</strong>${E.round2(p.balances?.annualLeave||0)} hours</div><div class="balance-cell"><strong>Personal Leave</strong>${E.round2(p.balances?.personalLeave||0)} hours</div><div class="balance-cell"><strong>Long Service Leave</strong>${E.round2(p.balances?.longServiceLeave||0)} hours</div><div class="balance-cell"><strong>LSL Entitlement Date</strong>${esc(E.fmtPay(p.balances?.lslEntitlementDate))}</div></div></section>
    </article></div>`;
  }
  function printSelectedPayslip(){
    const p = state.payslips.find(x=>x.id===state.selectedPayslipId);
    if(!p) return;
    if(!p.finalised) return modal('Payslip Not Finalised', '<p>Payslips cannot be printed before finalisation.</p>', '<button class="secondary" data-close-modal>Close</button>');
    window.print();
  }

  function renderCertification(){
    const c = currentCycle();
    const slips = state.payslips.filter(p=>Number(p.cycleId)===Number(c.id));
    const locked = !!state.certifications[String(c.id)]?.locked;
    const rows = slips.map(p=>[esc(p.employeeName), money(p.gross), money(p.payg + p.stsl), money(p.net), `<input type="checkbox" class="certLine" ${locked?'checked disabled':''}>`]);
    h('certification', `<div class="tab-card"><h2>Certification Report</h2><p><strong>${esc(E.ppeLabel(c))}</strong> — ${esc(E.fmtPay(c.start))} to ${esc(E.fmtPay(c.end))}</p>${table(['Employee','Gross','Tax','Net','Certify'], rows)}<div class="divider"></div><div class="grid two-grid"><div><label>Name</label><input id="certName" ${locked?'readonly':''} value="${esc(state.certifications[String(c.id)]?.name||'')}"></div><div><label>Position</label><input id="certPosition" ${locked?'readonly':''} value="${esc(state.certifications[String(c.id)]?.position||'')}"></div></div><p><label style="display:flex;gap:8px;align-items:center;text-transform:none;font-size:14px"><input type="checkbox" id="certDeclaration" ${locked?'checked disabled':''} style="width:auto"> I certify to the best of my knowledge, this pay is correct</label></p><button id="saveCertification" ${locked?'disabled':''}>Save</button></div>`);
    if(!locked) $('saveCertification').addEventListener('click',()=>{
      if(qsa('.certLine').some(x=>!x.checked)) return alert('Please certify each pay line.');
      if(!v('certName') || !v('certPosition')) return alert('Enter name and position.');
      if(!$('certDeclaration').checked) return alert('Please tick the certification declaration.');
      state.certifications[String(c.id)] = {name:v('certName'), position:v('certPosition'), savedAt:new Date().toISOString(), locked:true};
      log(`Certification Report saved for ${E.ppeLabel(c)}.`); renderAll();
    });
  }

  function renderDeductions(){
    const selected = state.selectedEmployeeId || '';
    const rows = state.deductions.filter(d=>!selected || d.empId===selected).map(d=>[esc(fullName(empById(d.empId)||{})), esc(d.description), esc(d.type), esc(d.value), esc(E.fmtPay(d.startDate)), esc(E.fmtPay(d.endDate)), `<button class="danger" data-del-ded="${esc(d.id)}">Delete</button>`]);
    h('deductions', `<div class="tab-card"><h2>Deductions</h2><div class="grid form-grid"><div><label>Employee</label><select id="dedEmp">${optionEmployees(selected,true)}</select></div><div><label>Description</label><input id="dedDesc" value="Self-funded Leave"></div><div><label>Type</label><select id="dedType"><option>Percentage</option><option>Fixed Amount</option></select></div><div><label>Value</label><input type="number" step="0.01" id="dedValue" value="0"></div><div><label>Start Date</label><input type="date" id="dedStart" value="${esc(currentCycle().start)}"></div><div><label>End Date</label><input type="date" id="dedEnd"></div></div><div class="controls"><button id="saveDeduction">Save Deduction</button></div>${table(['Employee','Description','Type','Value','Start','End','Action'], rows)}</div>`);
    $('dedEmp').addEventListener('change',()=>{ state.selectedEmployeeId=v('dedEmp'); renderDeductions(); });
    $('saveDeduction').addEventListener('click',()=>{ if(!v('dedEmp')) return alert('Choose employee.'); state.deductions.push({id:uid('ded'), empId:v('dedEmp'), description:v('dedDesc'), type:v('dedType'), value:n('dedValue'), startDate:v('dedStart'), endDate:v('dedEnd'), saved:true}); log('Deduction saved.'); renderAll(); });
    qsa('[data-del-ded]').forEach(b=>b.addEventListener('click',()=>{ state.deductions = state.deductions.filter(d=>d.id!==b.dataset.delDed); log('Deduction deleted.'); renderAll(); }));
  }
  function renderAudit(){ h('audit', `<div class="tab-card"><h2>Audit Log</h2>${state.auditLog.map(x=>`<div class="history-item">${esc(x)}</div>`).join('') || '<div class="empty">No audit entries.</div>'}</div>`); }

  function renderSettings(){
    h('settings', `<div class="tab-card"><h2>Settings</h2><p><strong>Current app version:</strong> v${APP_VERSION}</p><div class="controls"><button id="checkUpdates" class="secondary">Check for Updates</button><button id="finalisePay" class="warning">Finalise Pay</button><button id="overnight" class="secondary">Check Overnight Processing</button><button id="publicHolidays" class="secondary">View WA Public Holidays</button><button id="seedDemo" class="secondary">Create Demo Employee</button><button id="clearData" class="danger">Clear Data</button></div><div id="settingsOutput" class="small-note"></div></div>`);
    $('checkUpdates').addEventListener('click',checkForUpdates);
    $('finalisePay').addEventListener('click',()=>confirmModal(`Finalise ${E.ppeLabel(currentCycle())}? Finalised payslips will be locked and printable.`, 'Finalise', ()=>{ E.finaliseCycle(state,currentCycle().id); log(`${E.ppeLabel(currentCycle())} finalised.`); renderAll(); }));
    $('overnight').addEventListener('click',()=>processing('Overnight Processing in Progress','Overnight Processing Complete',()=>{ E.calculateCycle(state,currentCycle().id); state.lastOvernightDate = E.iso(new Date()); log('Overnight processing checked/run.'); }));
    $('publicHolidays').addEventListener('click',()=>modal('Western Australia Public Holidays', table(['Date','Public Holiday'], E.PUBLIC_HOLIDAYS_WA.map(p=>[E.fmtPay(p[0]), esc(p[1])])), '<button class="secondary" data-close-modal>Close</button>'));
    $('seedDemo').addEventListener('click', seedDemoEmployee);
    $('clearData').addEventListener('click',()=>confirmModal('Clear all app data? Export first if needed.','Clear Data',()=>{ state=DataStore.emptyState(); save(); renderAll(); }));
  }
  async function checkForUpdates(){
    h('settingsOutput','Checking for updates...');
    try{
      const res = await fetch('./latest-version.json?ts='+Date.now());
      if(!res.ok) throw new Error('No version file');
      const latest = await res.json();
      h('settingsOutput', latest.version === APP_VERSION ? `You are up to date. Current version: v${APP_VERSION}.` : `Update available: v${esc(latest.version)}. Export data before replacing files.`);
    }catch(err){ h('settingsOutput','Could not check updates. Make sure latest-version.json has been uploaded.'); }
  }
  function seedDemoEmployee(){
    if(state.employees.length && !confirm('Add another demo employee?')) return;
    const id = String(Date.now()).slice(-6);
    const e = {id, firstName:'Alex', lastName:'Brown', name:'Alex Brown', type:'Permanent', status:'Active', startDate:'2026-05-22', originalStartDate:'2026-05-22', lslServiceDate:'2020-06-01', department:'Payroll', position:'Payroll Officer', hourlyRate:40, annualLeaveBalance:150, personalLeaveBalance:100, lslAccruedBalance:0, lslProRataBalance:50, taxFreeThreshold:'Yes', stsl:'No'};
    state.employees.push(e);
    state.addressHistory.push({id:uid('addr'), empId:id, effectiveDate:e.startDate, address:'1 Payroll Street, East Perth WA'});
    state.schedules.push({id:uid('sch'), empId:id, effectiveDate:e.startDate, hoursByDay:{1:7.5,2:7.5,3:7.5,4:7.5,5:7.5,6:0,0:0}});
    state.payRates.push({id:uid('rate'), empId:id, effectiveDate:e.startDate, position:e.position, hourlyRate:40, changeType:'Commencement'});
    state.jobEvents.push({id:uid('event'), empId:id, type:'Commencement', effectiveDate:e.startDate, details:'Demo employee created.'});
    log('Demo employee created.'); renderAll();
  }

  function openCalculatePayModal(){
    modal('Calculate Pay', `<p>Select an employee to calculate, or choose all active employees.</p><div><label>Employee</label><select id="calcEmp"><option value="ALL">All active employees</option>${E.activeEmployees(state,currentCycle().end).map(e=>`<option value="${esc(e.id)}">${esc(fullName(e))}</option>`).join('')}</select></div>`, `<button class="secondary" data-close-modal>Cancel</button><button id="runCalc">Calculate</button>`);
    $('runCalc').addEventListener('click',()=>{ const emp=v('calcEmp'); closeModal(); processing('Calculating Pay','Pay Run Successful',()=>{ E.calculateCycle(state,currentCycle().id, emp==='ALL'?null:[emp]); log(emp==='ALL'?'Calculated pay for all active employees.':`Calculated pay for ${fullName(empById(emp))}.`); }); });
  }
  function exportData(){
    save();
    const blob = new Blob([DataStore.exportJson(state)], {type:'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `payroll-hcm-data-v${APP_VERSION}.json`; a.click();
    log('Data exported.');
  }
  function importDataFile(file){
    const reader = new FileReader();
    reader.onload = () => {
      try{ state = DataStore.importJson(reader.result); save(); log('Data imported.'); renderAll(); }
      catch(err){ alert('Import failed. Please select a valid payroll app JSON export.'); }
    };
    reader.readAsText(file);
  }

  function attachGlobalEvents(){
    $('calculatePayBtn').addEventListener('click', openCalculatePayModal);
    $('exportDataBtn').addEventListener('click', exportData);
    $('importDataBtn').addEventListener('click', ()=>$('importFile').click());
    $('importFile').addEventListener('change', e=>{ const file=e.target.files[0]; if(file) importDataFile(file); e.target.value=''; });
    $('alertsBell').addEventListener('click', e=>{ e.stopPropagation(); renderAlertsDropdown(); $('alertsDropdown').classList.toggle('open'); });
    document.addEventListener('click', e=>{ if(!$('alertsBell').contains(e.target) && !$('alertsDropdown').contains(e.target)) $('alertsDropdown').classList.remove('open'); });
    $('modalBackdrop').addEventListener('click', e=>{ if(e.target.id==='modalBackdrop') closeModal(); });
  }

  initAuth();
  renderNav();
  attachGlobalEvents();
  updateMetrics();
})();
