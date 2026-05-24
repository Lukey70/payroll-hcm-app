#!/usr/bin/env node
'use strict';
const assert = require('assert');
const DataStore = require('./data-store.js');
const E = require('./payroll-engine.js');

function baseState(){
  const state = DataStore.emptyState();
  state.auditLog = [];
  return state;
}
function addEmployee(state, overrides={}){
  const e = Object.assign({ id:'000001', firstName:'Test', lastName:'Employee', name:'Test Employee', department:'Payroll', position:'Officer', type:'Permanent', startDate:'2026-05-22', originalStartDate:'2026-05-22', lslServiceDate:'2026-05-22', contractEndDate:'', autoTerminate:false, hourlyRate:40, annualLeaveBalance:150, personalLeaveBalance:100, lslAccruedBalance:0, status:'Active' }, overrides);
  e.name = `${e.firstName} ${e.lastName}`;
  state.employees.push(e);
  return e;
}
function addSchedule(state, empId, effectiveDate='2026-05-22', hours={1:7.5,2:7.5,3:7.5,4:7.5,5:7.5,6:0,0:0}){
  state.schedules.push({id:`s_${state.schedules.length+1}`,empId,effectiveDate,hoursByDay:hours});
}
function addRate(state, empId, effectiveDate='2026-05-22', position='Officer', rate=40, changeType='Permanent', endDate=''){
  state.payRates.push({id:`r_${state.payRates.length+1}`,empId,effectiveDate,position,hourlyRate:rate,changeType,endDate});
}
function totalUnitsByDesc(payslips, desc){ return payslips.flatMap(p=>p.rows).filter(r=>r.description===desc).reduce((s,r)=>s+r.units,0); }
function totalAmountByDesc(payslips, desc){ return payslips.flatMap(p=>p.rows).filter(r=>r.description===desc).reduce((s,r)=>s+r.amount,0); }

(function testAnchorPayCycle(){
  const c = E.ANCHOR_CYCLE;
  assert.strictEqual(E.ppeLabel(c), 'PPE4/6/26');
  assert.strictEqual(c.start, '2026-05-22');
  assert.strictEqual(c.end, '2026-06-04');
  assert.strictEqual(c.paymentDate, '2026-06-04');
  assert.strictEqual(c.closeDate, '2026-05-29');
  assert.strictEqual(E.cycleDisplay(c), 'PPE4/6/26 | Period: 22/5/26 - 4/6/26 | Payment Date: 4/6/26 | Pay close: 29/5/26');
})();

(function testCommencementDateIncluded(){
  const state=baseState(); const e=addEmployee(state,{startDate:'2026-05-22'}); addSchedule(state,e.id); addRate(state,e.id);
  const payslips=E.calculateEmployee(state,e.id,1,false);
  const regular=totalUnitsByDesc(payslips,'Regular Pay');
  assert(regular >= 7.5, 'Commencement/start date must be paid when scheduled');
})();

(function testTemporaryPositionInclusiveFiveDays(){
  const state=baseState(); const e=addEmployee(state,{startDate:'2026-05-25'}); addSchedule(state,e.id,'2026-05-25'); addRate(state,e.id,'2026-05-25','Officer',40); addRate(state,e.id,'2026-05-25','Higher Duties',50,'Temporary','2026-05-29');
  const payslips=E.calculateEmployee(state,e.id,1,false);
  const hdUnits=payslips.filter(p=>p.position==='Higher Duties').flatMap(p=>p.rows).filter(r=>r.description==='Regular Pay').reduce((s,r)=>s+r.units,0);
  assert.strictEqual(hdUnits, 37.5, 'Temporary Mon-Fri 7.5 hours must pay 37.5 hours, not 30');
})();

(function testLeaveDurationIgnoresNonWorkingDays(){
  const state=baseState(); const e=addEmployee(state); addSchedule(state,e.id); addRate(state,e.id);
  const result=E.validateLeaveBooking(state,e.id,'Annual Leave','2026-05-22','2026-05-25');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.hours, 15, 'Friday to Monday over weekend should deduct Friday + Monday only');
})();

(function testPublicHolidayNoLeaveDeduction(){
  const state=baseState(); const e=addEmployee(state); addSchedule(state,e.id); addRate(state,e.id);
  const result=E.validateLeaveBooking(state,e.id,'Annual Leave','2026-06-01','2026-06-02');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.hours, 7.5, 'Leave over WA public holiday should exclude public holiday hours');
  state.leaveBookings.push({id:'l1',empId:e.id,type:'Annual Leave',startDate:'2026-06-01',endDate:'2026-06-02',hours:7.5,status:'Approved'});
  const payslips=E.calculateEmployee(state,e.id,1,false);
  assert.strictEqual(totalUnitsByDesc(payslips,'Public Holiday'), 7.5, 'Rostered public holiday must appear as Public Holiday earnings');
  assert.strictEqual(totalUnitsByDesc(payslips,'Annual Leave'), 7.5, 'Only non-public-holiday scheduled leave day should be annual leave');
})();

(function testNoPayslipForNoEarnings(){
  const state=baseState(); const e=addEmployee(state); addSchedule(state,e.id,'2026-05-22',{1:0,2:0,3:0,4:0,5:0,6:0,0:0}); addRate(state,e.id);
  assert.strictEqual(E.calculateEmployee(state,e.id,1,false).length, 0, 'No zero-gross payslip should be generated');
})();

(function testPositionChangeCreatesSeparatePayslips(){
  const state=baseState(); const e=addEmployee(state); addSchedule(state,e.id); addRate(state,e.id,'2026-05-22','Officer',40); addRate(state,e.id,'2026-05-25','Higher Duties',50,'Temporary','2026-05-29');
  const payslips=E.calculateEmployee(state,e.id,1,false);
  const positions=[...new Set(payslips.map(p=>p.position))];
  assert(positions.includes('Officer') && positions.includes('Higher Duties'), 'Position changes in pay period should create one payslip per position');
})();

(function testBackdatedCommencementRetroFirstOpenPay(){
  const state=baseState(); const e=addEmployee(state,{startDate:'2026-05-18',originalStartDate:'2026-05-18',lslServiceDate:'2026-05-18'}); addSchedule(state,e.id,'2026-05-18'); addRate(state,e.id,'2026-05-18','Officer',40);
  const payslips=E.calculateEmployee(state,e.id,1,false);
  assert.strictEqual(totalUnitsByDesc(payslips,'Regular Pay Retro'), 30, 'Backdated commencement arrears should include all scheduled days before first open pay');
})();

(function testAdditionalEarningsIncludedOnlyWhenSaved(){
  const state=baseState(); const e=addEmployee(state); addSchedule(state,e.id); addRate(state,e.id);
  state.additionalEarnings.push({id:'a1',empId:e.id,cycleId:1,earningType:'Overtime 1.5',startDate:'2026-05-26',endDate:'2026-05-26',hours:2,saved:false});
  let payslips=E.calculateEmployee(state,e.id,1,false);
  assert.strictEqual(totalUnitsByDesc(payslips,'Overtime 1.5'), 0, 'Unsaved additional earnings must not flow to payslip');
  state.additionalEarnings[0].saved=true;
  payslips=E.calculateEmployee(state,e.id,1,false);
  assert.strictEqual(totalUnitsByDesc(payslips,'Overtime 1.5'), 2, 'Saved additional earnings should flow to payslip');
  assert.strictEqual(totalAmountByDesc(payslips,'Overtime 1.5'), 120, 'Overtime 1.5 should use effective rate times 1.5');
})();

console.log('PASS: Current pay is PPE4/6/26');
console.log('PASS: Period is 22/5/26 - 4/6/26');
console.log('PASS: Payment date is 4/6/26');
console.log('PASS: Pay close is 29/5/26');
console.log('PASS: Monday-Friday 7.5 hours pays 37.5 hours');
console.log('PASS: Commencement date is included in pay');
console.log('PASS: Leave over non-working days only deducts scheduled work days');
console.log('PASS: Leave over public holiday does not deduct credits and pays Public Holiday');
console.log('PASS: No zero-gross payslips are generated');
console.log('PASS: Position changes create separate payslips');
console.log('PASS: Backdated commencement retro includes all scheduled days');
console.log('PASS: Additional earnings only pay once saved and use effective rates');
