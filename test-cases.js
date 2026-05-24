#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
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


(function testAppVersionAndLoginStrings(){
  const root = __dirname;
  const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
  const app = fs.readFileSync(path.join(root,'app.js'),'utf8');
  const data = fs.readFileSync(path.join(root,'data-store.js'),'utf8');
  assert(html.includes('id="loginButton"'), 'index.html must include the login button');
  assert(app.includes("const PASSWORD = '1234'"), 'login password must be 1234');
  assert(html.includes('v1.1.3'), 'sidebar/version label must show v1.1.3');
  assert(data.includes("APP_VERSION = '1.1.3'"), 'data-store version must be 1.1.3');
})();

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


(function testRetroCutoffPriorProcessingLimit(){
  const state=baseState(); const e=addEmployee(state,{startDate:'2020-01-01',originalStartDate:'2020-01-01',lslServiceDate:'2020-01-01'}); addSchedule(state,e.id,'2020-01-01'); addRate(state,e.id,'2020-01-01','Officer',40);
  const payslips=E.calculateEmployee(state,e.id,1,false);
  const retroRows=payslips.flatMap(p=>p.rows).filter(r=>r.description==='Regular Pay Retro');
  assert(retroRows.length > 0, 'Backdated commencement should still create retro after go-live cut-off');
  assert(retroRows.every(r=>E.compare(r.startDate,E.RETRO_PROCESSING_START)>=0), 'Retro rows must not start before 03/05/2026');
})();

(function testTaxDetailsAndStsl(){
  const state=baseState(); const e=addEmployee(state,{hourlyRate:90}); addSchedule(state,e.id); addRate(state,e.id,'2026-05-22','Officer',90);
  state.taxDetails.push({id:'t1',empId:e.id,effectiveDate:e.startDate,taxFileNumber:'123456789',claimTaxFreeThreshold:true,stsl:true});
  const payslips=E.calculateEmployee(state,e.id,1,false);
  assert(payslips[0].marginalTax > 0, 'Marginal Tax should be calculated');
  assert(payslips[0].stsl > 0, 'STSL repayment should be calculated when STSL is yes and income exceeds threshold');
  assert.strictEqual(E.activeTaxDetails(state,e.id,'2026-06-04').taxFileNumber, '123456789');
})();

(function testPayslipNoLslProrataAndCertificationNoSuper(){
  const app = fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
  const payslipSection = app.slice(app.indexOf('function payslipHtml'), app.indexOf('function renderCertification'));
  assert(!payslipSection.includes("['LSL Pro-rata (Hours)'"), 'Payslip should not show LSL pro-rata');
  assert(payslipSection.includes("['LSL Accrued Balance (Hours)'"), 'Payslip should still show LSL accrued');
  assert(!app.includes("'Gross','Tax','Super','Net','Certify'"), 'Certification report should not contain Super column');
  assert(app.includes('data-tab="taxDetails"') || fs.readFileSync(path.join(__dirname,'index.html'),'utf8').includes('data-tab="taxDetails"'), 'Tax Details tab should exist');
})();



(function testPartialDayLeaveKeepsRegularRemainder(){
  const state=baseState(); const e=addEmployee(state); addSchedule(state,e.id); addRate(state,e.id);
  const result=E.validateLeaveBooking(state,e.id,'Personal Leave','2026-05-25','2026-05-25',4);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.hours, 4, 'Single-day partial leave should save the entered absence duration');
  state.leaveBookings.push({id:'l_partial',empId:e.id,type:'Personal Leave',startDate:'2026-05-25',endDate:'2026-05-25',hours:4,status:'Approved'});
  const payslips=E.calculateEmployee(state,e.id,1,false);
  assert.strictEqual(totalUnitsByDesc(payslips,'Personal Leave'), 4, 'Partial leave should only deduct/pay leave for entered hours');
  assert.strictEqual(totalUnitsByDesc(payslips,'Regular Pay'), 63.5, 'Remaining non-public-holiday scheduled hours should stay as regular pay');
  assert.strictEqual(totalUnitsByDesc(payslips,'Public Holiday'), 7.5, 'Public holiday should still be paid separately');
})();

(function testOverlappingLeavePrevented(){
  const state=baseState(); const e=addEmployee(state); addSchedule(state,e.id); addRate(state,e.id);
  state.leaveBookings.push({id:'l1',empId:e.id,type:'Personal Leave',startDate:'2026-05-25',endDate:'2026-05-25',hours:7.5,status:'Approved'});
  const result=E.validateLeaveBooking(state,e.id,'Annual Leave','2026-05-25','2026-05-25');
  assert.strictEqual(result.ok, false, 'Overlapping leave should be prevented');
  assert(result.message.includes('overlaps'), 'Overlap warning should explain that the date is already booked');
})();

(function testAdditionalEarningsStayOnSamePayslip(){
  const state=baseState(); const e=addEmployee(state); addSchedule(state,e.id); addRate(state,e.id);
  state.additionalEarnings.push({id:'a1',empId:e.id,cycleId:1,earningType:'Overtime 1.5',startDate:'2026-05-26',endDate:'2026-05-26',hours:2,saved:true});
  const payslips=E.calculateEmployee(state,e.id,1,false);
  assert.strictEqual(payslips.length, 1, 'Current-pay overtime should stay on the same payslip when there is no position split');
  assert.strictEqual(totalUnitsByDesc(payslips,'Overtime 1.5'), 2);
})();

(function testSuperRateIs12PercentOfOTEAndOvertimeExcluded(){
  const state=baseState(); const e=addEmployee(state); addSchedule(state,e.id); addRate(state,e.id);
  state.additionalEarnings.push({id:'a1',empId:e.id,cycleId:1,earningType:'Overtime 1.5',startDate:'2026-05-26',endDate:'2026-05-26',hours:2,saved:true});
  const p=E.calculateEmployee(state,e.id,1,false)[0];
  assert.strictEqual(E.SUPER_RATE, 0.12, 'SG rate should be 12%');
  assert.strictEqual(p.superCurrent, 360, 'Super should be 12% of ordinary time earnings and exclude overtime');
})();

(function testPriorFinalisedLeaveRetroReplacementRows(){
  const state=baseState(); const e=addEmployee(state); addSchedule(state,e.id); addRate(state,e.id);
  state.finalisedCycles['1']=true;
  const paid=E.calculateEmployee(state,e.id,1,true);
  state.payslips.push(...paid.map(p=>Object.assign({},p,{finalised:true})));
  state.currentCycleId=2;
  state.leaveBookings.push({id:'l_retro',empId:e.id,type:'Annual Leave',startDate:'2026-05-25',endDate:'2026-05-25',hours:7.5,status:'Approved'});
  const next=E.calculateEmployee(state,e.id,2,false);
  assert(next.flatMap(p=>p.rows).some(r=>r.description==='Regular Pay Retro' && r.amount < 0), 'Leave booked into finalised pay should reverse regular pay as Regular Pay Retro');
  assert(next.flatMap(p=>p.rows).some(r=>r.description==='Annual Leave Retro' && r.amount > 0), 'Leave booked into finalised pay should add Annual Leave Retro');
})();

(function testPriorFinalisedAdditionalEarningsRetroDescription(){
  const state=baseState(); const e=addEmployee(state); addSchedule(state,e.id); addRate(state,e.id);
  state.finalisedCycles['1']=true;
  const paid=E.calculateEmployee(state,e.id,1,true);
  state.payslips.push(...paid.map(p=>Object.assign({},p,{finalised:true})));
  state.currentCycleId=2;
  state.additionalEarnings.push({id:'a_retro',empId:e.id,cycleId:1,earningType:'Additional Day',startDate:'2026-05-26',endDate:'2026-05-26',hours:2,saved:true});
  const next=E.calculateEmployee(state,e.id,2,false);
  assert(next.flatMap(p=>p.rows).some(r=>r.description==='Additional Day Retro' && r.amount > 0), 'Prior-pay additional earnings should appear as Additional Day Retro in the current open pay');
})();

(function testPayslipSummaryAndSuperRetroTextInApp(){
  const app = fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
  assert(app.includes("['','Gross','Tax','Net']"), 'Payslip Pay Summary should have Gross, Tax and Net columns');
  assert(app.includes("['Current'"), 'Payslip Pay Summary should use Current as a row');
  assert(app.includes('Employer Super Contribution Retro'), 'Payslip should include Employer Super Contribution Retro row when applicable');
  assert(app.includes('financialYearBounds'), 'Payslip YTD should use financial-year logic');
})();


(function testNoTfnTaxAndStslLocationStrings(){
  const state=baseState(); const e=addEmployee(state); addSchedule(state,e.id); addRate(state,e.id);
  state.taxDetails.push({id:'tax1',empId:e.id,effectiveDate:e.startDate,taxFileNumber:'',claimTaxFreeThreshold:true,stsl:true});
  const p=E.calculateEmployee(state,e.id,1,false)[0];
  assert.strictEqual(p.marginalTax, 1350, 'No TFN should withhold 45% of $3000 gross');
  assert.strictEqual(p.noTfn, true, 'Payslip result should flag No TFN Provided');
  const app = fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
  assert(app.includes('Marginal Tax - No TFN Provided'), 'Payslip Tax section should label No TFN Provided');
  assert(app.includes('STSL Repayment'), 'STSL repayment should be rendered in the Tax section');
})();

(function testTaxThresholdAndStslEffectiveDetails(){
  const state=baseState(); const e=addEmployee(state); addSchedule(state,e.id); addRate(state,e.id);
  state.taxDetails.push({id:'tax1',empId:e.id,effectiveDate:e.startDate,taxFileNumber:'123456789',claimTaxFreeThreshold:true,stsl:false});
  const withThreshold=E.calculateEmployee(state,e.id,1,false)[0];
  state.taxDetails[0].claimTaxFreeThreshold=false;
  state.taxDetails[0].stsl=true;
  const noThresholdStsl=E.calculateEmployee(state,e.id,1,false)[0];
  assert(noThresholdStsl.marginalTax > withThreshold.marginalTax, 'Tax-free threshold No should calculate more tax than Yes');
  assert(noThresholdStsl.stsl > 0, 'STSL should calculate when STSL is Yes and a TFN exists');
})();

(function testLeaveWithoutPayDisplayedButFullPeriodSuppressed(){
  const state=baseState(); const e=addEmployee(state); addSchedule(state,e.id); addRate(state,e.id);
  state.leaveBookings.push({id:'lwop',empId:e.id,type:'LWOP',startDate:'2026-05-25',endDate:'2026-05-25',hours:7.5,status:'Approved'});
  const p=E.calculateEmployee(state,e.id,1,false)[0];
  assert(p.rows.some(r=>r.description==='Leave Without Pay' && r.units===7.5 && r.amount===0), 'LWOP should appear under Earnings with hours and zero amount');
  const state2=baseState(); const e2=addEmployee(state2); addSchedule(state2,e2.id,'2026-05-22',{1:0,2:7.5,3:7.5,4:7.5,5:7.5,6:0,0:0}); addRate(state2,e2.id);
  state2.leaveBookings.push({id:'lwopfull',empId:e2.id,type:'LWOP',startDate:'2026-05-22',endDate:'2026-06-04',hours:75,status:'Approved'});
  assert.strictEqual(E.calculateEmployee(state2,e2.id,1,false).length, 0, 'Full-period LWOP with no payable earnings should not generate a payslip');
})();

(function testZeroNetPriorLeaveRetroStillVisible(){
  const state=baseState(); const e=addEmployee(state); addSchedule(state,e.id); addRate(state,e.id);
  state.taxDetails.push({id:'tax1',empId:e.id,effectiveDate:e.startDate,taxFileNumber:'123456789',claimTaxFreeThreshold:true,stsl:false});
  state.finalisedCycles['1']=true;
  const paid=E.calculateEmployee(state,e.id,1,true);
  state.payslips.push(...paid.map(p=>Object.assign({},p,{finalised:true})));
  state.currentCycleId=2;
  state.leaveBookings.push({id:'l_retro',empId:e.id,type:'Annual Leave',startDate:'2026-05-25',endDate:'2026-05-25',hours:7.5,status:'Approved'});
  // Make the employee inactive for the current cycle so the only output is zero-net leave replacement retro.
  e.terminationDate='2026-06-04'; e.status='Terminated';
  const next=E.calculateEmployee(state,e.id,2,false);
  assert(next.length >= 1, 'Zero-net leave retro replacement should still produce a visible current payslip entry');
  assert(next.flatMap(p=>p.rows).some(r=>r.description==='Annual Leave Retro'), 'Annual Leave Retro row should be visible');
})();

(function testAdditionalEarningsAmountAndOverpayment(){
  const state=baseState(); const e=addEmployee(state); addSchedule(state,e.id); addRate(state,e.id);
  state.additionalEarnings.push({id:'add1',empId:e.id,cycleId:1,earningType:'Additional Day',startDate:'2026-05-26',endDate:'2026-05-26',hours:2,saved:true});
  state.additionalEarnings.push({id:'op1',empId:e.id,cycleId:1,earningType:'Overpayment Adjustment',startDate:'2026-05-22',endDate:'2026-06-04',hours:0,amount:-50,saved:true});
  const p=E.calculateEmployee(state,e.id,1,false)[0];
  assert(p.rows.some(r=>r.description==='Additional Day' && r.amount===80), 'Additional Earnings amount should calculate from rate x hours');
  assert(p.rows.some(r=>r.description==='Overpayment Adjustment' && r.units===0 && r.amount===-50 && r.ote===false), 'Overpayment Adjustment should use zero hours and entered amount');
})();

(function testCommencementTaxAndReadonlyBalanceUiStrings(){
  const app = fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
  const html = fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
  assert(html.indexOf('Tax Details') < html.indexOf('Additional Earnings'), 'Tax Details tab should be above Additional Earnings');
  assert(app.includes('newTaxFileNumber'), 'Commencement popup should include Tax File Number');
  assert(app.includes('state.taxDetails.push'), 'Commencement should save initial tax details');
  assert(app.includes('readonly class="readonly" value="0.00"'), 'Commencement/rehire leave balances should be read-only');
  assert(!app.includes('Date of Birth changes should only be processed'), 'Date of Birth warning should be removed');
})();

console.log('PASS: Login button/password strings and app version are present');
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
console.log('PASS: Retro prior-processing cut-off prevents payments before 03/05/2026');
console.log('PASS: Tax Details, Marginal Tax and STSL calculations are present');
console.log('PASS: Payslip removes LSL pro-rata and Certification Report removes Super');
console.log('PASS: Partial-day leave deducts only entered hours and pays the remaining day as Regular Pay');
console.log('PASS: Overlapping leave bookings are prevented');
console.log('PASS: Current-pay additional earnings stay on the same payslip');
console.log('PASS: SG rate is 12% of ordinary time earnings and excludes overtime');
console.log('PASS: Prior-pay leave creates Regular Pay Retro and leave Retro replacement rows');
console.log('PASS: Prior-pay additional earnings use the original earnings type plus Retro');
console.log('PASS: Payslip summary, YTD financial-year logic and Employer Super Contribution Retro are present');

console.log('PASS: No TFN fallback tax and payslip No TFN label are present');
console.log('PASS: Tax-free-threshold Yes/No and STSL Yes affect pay calculations');
console.log('PASS: Leave Without Pay shows with hours/zero earnings and full-period LWOP suppresses payslip');
console.log('PASS: Zero-net prior-period leave retro replacement remains visible');
console.log('PASS: Additional Earnings Amount and Overpayment Adjustment are calculated correctly');
console.log('PASS: Commencement tax fields, read-only balances, tab order and DOB warning removal are present');
