#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const DataStore = require('./data-store.js');
const E = require('./payroll-engine.js');
const root = __dirname;

function read(file){ return fs.readFileSync(path.join(root,file),'utf8'); }
function baseState(){ const s = DataStore.emptyState(); s.auditLog=[]; return s; }
function addEmployee(state, overrides={}){
  const e = Object.assign({ id:'000001', firstName:'Test', lastName:'Employee', name:'Test Employee', type:'Permanent', status:'Active', startDate:'2026-05-22', originalStartDate:'2026-05-22', lslServiceDate:'2020-06-01', department:'Payroll', position:'Officer', hourlyRate:40, annualLeaveBalance:150, personalLeaveBalance:100, lslAccruedBalance:20, lslProRataBalance:55, taxFreeThreshold:'Yes', stsl:'No' }, overrides);
  e.name = `${e.firstName} ${e.lastName}`;
  state.employees.push(e);
  state.addressHistory.push({id:'addr1', empId:e.id, effectiveDate:e.startDate, address:'Old Address'});
  return e;
}
function addSchedule(state, empId, hours={1:7.5,2:7.5,3:7.5,4:7.5,5:7.5,6:0,0:0}, effectiveDate='2026-05-22'){
  state.schedules.push({id:`sch_${state.schedules.length+1}`, empId, effectiveDate, hoursByDay:hours});
}
function addRate(state, empId, rate=40, effectiveDate='2026-05-22'){
  state.payRates.push({id:`rate_${state.payRates.length+1}`, empId, effectiveDate, position:'Officer', hourlyRate:rate, changeType:'Permanent'});
}
function totalDesc(payslip, desc){ return payslip.rows.filter(r=>r.description===desc).reduce((s,r)=>s+r.amount,0); }
function unitsDesc(payslip, desc){ return payslip.rows.filter(r=>r.description===desc).reduce((s,r)=>s+r.units,0); }

(function syntaxAndVersion(){
  assert(read('index.html').includes('v1.1.11'), 'index.html version label must show v1.1.11');
  assert(read('data-store.js').includes("APP_VERSION = '1.1.11'"), 'data-store version must be v1.1.11');
  assert(read('app.js').includes("const PASSWORD = '1234'"), 'password should remain 1234');
})();

(function fixedPayCycle(){
  const c = E.cycleById(1);
  assert.strictEqual(c.start, '2026-05-22');
  assert.strictEqual(c.end, '2026-06-04');
  assert.strictEqual(c.paymentDate, '2026-06-04');
  assert.strictEqual(c.closeDate, '2026-05-29');
})();

(function publicHolidayOnlyOnWorkingDay(){
  let s = baseState(); const e = addEmployee(s); addSchedule(s,e.id); addRate(s,e.id,40);
  const p = E.calculatePayslip(s,e.id,1,false);
  assert(totalDesc(p,'Public Holiday') > 0, 'scheduled Monday public holiday should be paid');
  assert.strictEqual(unitsDesc(p,'Public Holiday'), 7.5, 'only scheduled PH hours should pay');

  s = baseState(); const e2 = addEmployee(s,{id:'000002'}); addSchedule(s,e2.id,{1:0,2:7.5,3:7.5,4:7.5,5:7.5,6:0,0:0}); addRate(s,e2.id,40);
  const p2 = E.calculatePayslip(s,e2.id,1,false);
  assert.strictEqual(totalDesc(p2,'Public Holiday'), 0, 'non-working public holiday must not be paid');
})();

(function leaveOnPublicHolidayDoesNotDeductLeave(){
  const s = baseState(); const e = addEmployee(s); addSchedule(s,e.id); addRate(s,e.id,40);
  s.leaveBookings.push({id:'l1', empId:e.id, type:'Annual Leave', startDate:'2026-06-01', endDate:'2026-06-01', status:'Approved'});
  const p = E.calculatePayslip(s,e.id,1,false);
  assert.strictEqual(totalDesc(p,'Annual Leave'), 0, 'public holiday should not be annual leave');
  assert.strictEqual(unitsDesc(p,'Public Holiday'), 7.5, 'public holiday should pay instead');
})();

(function payslipLeaveBalanceHasLslEntitlementButNoProRata(){
  const s = baseState(); const e = addEmployee(s); addSchedule(s,e.id); addRate(s,e.id,40);
  const p = E.calculatePayslip(s,e.id,1,false);
  assert.strictEqual(p.balances.lslEntitlementDate, '2027-06-01');
  assert(Object.prototype.hasOwnProperty.call(p.balances,'longServiceLeave'), 'payslip balances should include LSL accrued/entitled balance');
  assert(!Object.prototype.hasOwnProperty.call(p.balances,'lslProRataBalance'), 'payslip balances must not include pro-rata LSL');
  assert(read('app.js').includes('LSL Entitlement Date'), 'Payment advice should render LSL Entitlement Date');
})();

(function addressIsEffectiveDatedAndFinalisedPayslipFrozen(){
  const s = baseState(); const e = addEmployee(s); addSchedule(s,e.id); addRate(s,e.id,40);
  E.finaliseCycle(s,1);
  const finalised = s.payslips.find(p=>p.empId===e.id && p.cycleId===1);
  assert.strictEqual(finalised.addressSnapshot, 'Old Address');
  s.addressHistory.push({id:'addr2', empId:e.id, effectiveDate:'2026-05-22', address:'New Address'});
  const stillFinal = s.payslips.find(p=>p.empId===e.id && p.cycleId===1);
  assert.strictEqual(stillFinal.addressSnapshot, 'Old Address', 'finalised payslip must retain original address snapshot');
  assert.strictEqual(E.addressFor(s,e.id,'2026-06-05'), 'New Address', 'current/future address should use effective-dated new address');
})();

(function retroRateChangePaysDifferenceOnlyByEarningType(){
  const s = baseState(); const e = addEmployee(s); addSchedule(s,e.id); addRate(s,e.id,40);
  E.finaliseCycle(s,1);
  s.payRates.push({id:'rate2', empId:e.id, effectiveDate:'2026-05-22', position:'Officer', hourlyRate:45, changeType:'Permanent'});
  stateCurrentCycle(s,2);
  E.calculateCycle(s,2,[e.id]);
  const p = s.payslips.find(x=>x.empId===e.id && x.cycleId===2);
  const regRetro = totalDesc(p,'Regular Pay Retro');
  const phRetro = totalDesc(p,'Public Holiday Retro');
  assert(regRetro > 0, 'regular pay retro line should exist');
  assert(phRetro > 0, 'public holiday retro line should exist separately');
  assert(!p.rows.some(r=>r.description==='Regular Pay' && r.amount<0), 'should not recover full old regular pay as a negative full reversal');
  assert.strictEqual(E.money(regRetro + phRetro), E.money(75*5), 'retro should equal difference only across original hours');
})();
function stateCurrentCycle(s,id){ s.currentCycleId = id; }

(function otherLeaveKeyAndFallback(){
  assert.strictEqual(E.calendarCategory('Compassionate Leave'), 'Other Leave');
  const css = read('styles.css');
  const app = read('app.js');
  assert(css.includes('.cal-Other-Leave{background:#0b6b3a}'), 'Other Leave must be dark green');
  const keyStart = app.indexOf('function calendarKey');
  const keyBlock = app.slice(keyStart, app.indexOf('function renderCalendarDays'));
  assert(keyBlock.indexOf('Leave Without Pay') < keyBlock.indexOf('Other Leave') && keyBlock.indexOf('Other Leave') < keyBlock.indexOf('Public Holiday'), 'Other Leave key order should be after LWOP and before Public Holiday');
})();

(function alertsAndEmployeeDataNavigation(){
  const app = read('app.js');
  assert(app.includes('No New Alerts'), 'alert dropdown should display No New Alerts when empty');
  assert(app.includes("label:'Employee Data'"), 'Employee Data dropdown must exist');
  assert(app.includes("label:'Personal Details'"), 'Employees tab should be renamed Personal Details');
  assert(app.includes("label:'Bank Details'") && app.includes("label:'Tax Details'") && app.includes("label:'Super'"), 'Employee Data child tabs must exist');
})();

(function payslipClearTopAndPrintCss(){
  const app = read('app.js');
  const css = read('styles.css');
  assert(app.includes("activeTab === 'payslip' && id !== 'payslip'"), 'payslip should clear when leaving payslip tab');
  assert(app.includes('window.scrollTo({top:0'), 'tabs should reset to top');
  assert(css.includes('@media print'), 'print CSS must exist');
  assert(css.includes('.print-area'), 'print should target selected payslip only');
  assert(css.includes('min-height:270mm'), 'payslip should use more of the A4 page');
})();

console.log('All v1.1.11 tests passed.');
