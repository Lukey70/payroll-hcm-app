#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
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
  assert(html.includes('v1.1.22'), 'sidebar/version label must show v1.1.22');
  assert(data.includes("APP_VERSION = '1.1.22'"), 'data-store version must be 1.1.22');
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


(function testNoTaxDetailsFallbackAndStslLocationStrings(){
  const state=baseState(); const e=addEmployee(state); addSchedule(state,e.id); addRate(state,e.id);
  const p=E.calculateEmployee(state,e.id,1,false)[0];
  assert.strictEqual(p.marginalTax, 1350, 'No Tax Details at all should withhold 45% of $3000 gross');
  assert.strictEqual(p.noTfn, true, 'Payslip result should flag No TFN Provided only when no Tax Details record exists');
  state.taxDetails.push({id:'tax1',empId:e.id,effectiveDate:e.startDate,taxFileNumber:'',claimTaxFreeThreshold:true,stsl:true});
  const pWithRecord=E.calculateEmployee(state,e.id,1,false)[0];
  assert.strictEqual(pWithRecord.marginalTax, E.lookupFortnightlyPAYG(3000,true), 'A saved Tax Details record should use the uploaded table, even if TFN is blank');
  assert.strictEqual(pWithRecord.noTfn, false, 'No TFN label should not appear just because a saved Tax Details record has a blank TFN');
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

(function testUploadedTaxTablesNearestLowerAndHighIncomeFormula(){
  assert.strictEqual(E.lookupFortnightlyPAYG(3000,true), 598, 'PAYG table should return uploaded tax-free-threshold amount for $3000');
  assert.strictEqual(E.lookupFortnightlyPAYG(3000,false), 818, 'PAYG table should return uploaded no-threshold amount for $3000');
  assert.strictEqual(E.lookupFortnightlyPAYG(3001,true), 598, 'PAYG should use nearest lower table row when exact earnings are not listed');
  assert.strictEqual(E.lookupFortnightlyPAYG(6801,true), Math.round(1926 + 0.39), 'PAYG high-income tax-free-threshold formula should start after $6800');
  assert.strictEqual(E.lookupFortnightlySTSL(3000,true), 50, 'STSL table should return uploaded tax-free-threshold amount for $3000');
  assert.strictEqual(E.lookupFortnightlySTSL(3000,false), 154, 'STSL table should return uploaded no-threshold amount for $3000');
  assert.strictEqual(E.lookupFortnightlySTSL(3001,true), 50, 'STSL should use nearest lower table row when exact earnings are not listed');
  assert.strictEqual(E.lookupFortnightlySTSL(7201,true), Math.round(720 + 0.10), 'STSL high-income formula should start after $7200');
})();


(function testDeductionsPreAndPostTax(){
  const state=baseState(); const e=addEmployee(state); addSchedule(state,e.id); addRate(state,e.id);
  state.taxDetails.push({id:'tax1',empId:e.id,effectiveDate:e.startDate,taxFileNumber:'123456789',claimTaxFreeThreshold:true,stsl:false});
  const noDed=E.calculateEmployee(state,e.id,1,false)[0];
  state.deductions.push({id:'ded1',empId:e.id,startDate:'2026-05-22',endDate:'',deductionType:'Pre-tax Super Deduction',amount:100,percentage:'',saved:true,deleted:false});
  state.deductions.push({id:'ded2',empId:e.id,startDate:'2026-05-22',endDate:'',deductionType:'Post-Tax Super Deduction',amount:'',percentage:5,saved:true,deleted:false});
  const p=E.calculateEmployee(state,e.id,1,false)[0];
  assert.strictEqual(p.preTaxDeductionTotal, 100, 'Fixed pre-tax deduction should appear as the entered dollar amount');
  assert(p.postTaxDeductionTotal > 0, 'Post-tax percentage deduction should calculate to a dollar amount');
  assert(p.tax < noDed.tax, 'Pre-tax deduction should reduce taxable income and tax');
  assert(p.gross === noDed.gross, 'Gross pay should remain unchanged when deductions apply');
  assert(p.net < noDed.net, 'Net pay should reduce by deductions');
})();

(function testDeductionsUiAndWarningsExist(){
  const app = fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
  const html = fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
  assert(html.includes('data-tab="deductions"'), 'Deductions tab should exist in the sidebar');
  assert(app.includes('Add New Deduction'), 'Deductions tab should include Add New Deduction');
  assert(app.includes('Pre-Tax Deductions') && app.includes('Post-Tax Deductions'), 'Payslip should include conditional deduction sections');
  assert(app.includes('Check for Errors') && app.includes('negative net pay'), 'Settings should include Check for Errors and negative net pay warning');
  assert(app.includes('Import Preview'), 'Import should show a preview before replacing data');
  assert(app.includes('Recalculate Balances'), 'Absence Balance should include Recalculate Balances');
})();

(function testAbsenceCalendarFutureYearUi(){
  const app = fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
  assert(app.includes('selectedCalendarYear'), 'Absence Calendar should track the selected calendar year');
  assert(app.includes('Next Year'), 'Absence Calendar should include a Next Year button');
  assert(app.includes('maxYear=defaultYear + 1'), 'Absence Calendar should allow up to one year into the future');
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


(function testV117RetroOvertimeTaxStslAndNoLeaveAccrual(){
  const state=baseState(); const e=addEmployee(state); addSchedule(state,e.id); addRate(state,e.id);
  state.taxDetails.push({id:'tax1',empId:e.id,effectiveDate:e.startDate,taxFileNumber:'123456789',claimTaxFreeThreshold:true,stsl:true});
  const paid=E.calculateEmployee(state,e.id,1,true).map(p=>Object.assign({},p,{finalised:true}));
  state.finalisedCycles['1']={id:1,finalisedAt:'2026-06-04'};
  state.payslips.push(...paid);
  state.currentCycleId=2;
  e.terminationDate='2026-06-05'; e.status='Terminated';
  state.additionalEarnings.push({id:'otretro',empId:e.id,cycleId:1,earningType:'Overtime 2.0',startDate:'2026-05-26',endDate:'2026-05-26',hours:5.5,amount:440,saved:true});
  const next=E.calculateEmployee(state,e.id,2,false);
  const p=next[0];
  assert(p, 'Retro overtime should generate a visible payslip');
  assert(p.rows.some(r=>r.description==='Overtime 2.0 Retro' && Math.abs(r.amount-440)<0.01), 'Retro overtime should appear as Overtime 2.0 Retro');
  assert(p.marginalTaxRetro > 0, 'Retro overtime should attract Marginal Tax Retro');
  assert(p.stslRetro > 0, 'Retro overtime should attract STSL Repayment Retro when STSL is active');
  assert.strictEqual(p.annualAccrual, 0, 'Retro overtime should not accrue annual leave');
  assert.strictEqual(p.personalAccrual, 0, 'Retro overtime should not accrue personal leave');
})();

(function testV117RetroRegularPayRecoveryConsolidatesOnPayslip(){
  const state=baseState(); const e=addEmployee(state); addSchedule(state,e.id); addRate(state,e.id);
  state.taxDetails.push({id:'tax1',empId:e.id,effectiveDate:e.startDate,taxFileNumber:'123456789',claimTaxFreeThreshold:true,stsl:false});
  const paid=E.calculateEmployee(state,e.id,1,true).map(p=>Object.assign({},p,{finalised:true}));
  state.finalisedCycles['1']={id:1,finalisedAt:'2026-06-04'};
  state.payslips.push(...paid);
  state.currentCycleId=2;
  e.terminationDate='2026-06-05'; e.status='Terminated';
  state.leaveBookings.push({id:'plretro',empId:e.id,type:'Personal Leave',startDate:'2026-05-25',endDate:'2026-05-26',hours:15,status:'Approved'});
  const next=E.calculateEmployee(state,e.id,2,false);
  const regRetro=next.flatMap(p=>p.rows||[]).filter(r=>r.description==='Regular Pay Retro');
  assert.strictEqual(regRetro.length, 1, 'Matching retro Regular Pay recoveries should be consolidated into one payslip line');
  assert.strictEqual(Number(regRetro[0].units.toFixed(2)), -15, 'Consolidated Regular Pay recovery should show the total units');
})();

(function testV117UiStringsForDeductionsCertificationPayslipAndLwop(){
  const app = fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
  const styles = fs.readFileSync(path.join(__dirname,'styles.css'),'utf8');
  assert(app.includes('saveDeductionsBtn'), 'Deductions tab should include a bottom-right Save button');
  assert(app.includes('Unsaved changes. Deduction changes will not update Job Summary'), 'Deductions should stage changes until Save is pressed');
  assert(app.includes('data-cert-detail') && app.includes('🔍'), 'Certification Report should include a magnifying glass details button');
  assert(app.includes("This additional day is before the employee's start date and cannot be paid."), 'Additional Day before start date warning should appear at Save');
  assert(app.includes("selectedPayslipKey=''; h('payslipContent','');"), 'Payslip should clear when leaving the Payslip tab');
  assert(app.includes('<span class="lwop">Leave Without Pay</span><span class="otherleave">Other Leave</span><span class="publicholiday">Public Holiday</span>'), 'Other Leave should appear after LWOP and before Public Holiday in the legend');
  assert(styles.includes('--lwop:#7f1d1d') && styles.includes('.cal-day.lwop'), 'LWOP should use a burgundy calendar colour');
})();



(function testV118JobDataPositionsEmployeeSummaryUi(){
  const app = fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
  const html = fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
  const data = fs.readFileSync(path.join(__dirname,'data-store.js'),'utf8');
  assert(html.includes('data-tab="jobData"'), 'Sidebar should include Job Data tab');
  assert(!html.includes('data-tab="changeCentre"'), 'Change Centre should be removed from the sidebar');
  assert(app.includes('Settings') && app.includes('Positions') && app.includes('Position Number'), 'Settings should include Positions management');
  assert(app.includes('JOB_REASON_OPTIONS') && app.includes('Position Refresh') && app.includes('Pay Rate Change'), 'Job Data variation reasons should include new reasons');
  assert(app.includes("table(['ID','First Name','Last Name','Status','Actions']"), 'Employees table should be simplified');
  assert(app.includes('Job Summary is read-only') && app.includes("Effective Sequence','Action','Reason','Position Name','Weekly Hours"), 'Job Summary should be a read-only Job Data list');
  assert(data.includes('positions: []') && data.includes('jobDataRows: []'), 'State should include positions and jobDataRows');
})();

(function testV118JobDataSnapshotAndPositionInactivationRules(){
  const state=baseState(); const e=addEmployee(state,{startDate:'2026-05-22'}); addSchedule(state,e.id); addRate(state,e.id,'2026-05-22','Original',40);
  state.positions.push({id:'p1',positionNumber:'1234',positionName:'Payroll Officer',department:'Human Resources',hourlyRate:40,reportsTo:'',active:true});
  state.jobDataRows.push({id:'jd1',empId:e.id,effectiveDate:'2026-05-22',effectiveSequence:0,action:'Commencement',reason:'New Hire Permanent',positionNumber:'1234',positionName:'Payroll Officer',department:'Human Resources',hourlyRate:40,positionClass:'Permanent',hoursByDay:{1:7.5,2:7.5,3:7.5,4:7.5,5:7.5,6:0,0:0},rateId:'r_jd1',scheduleId:'s_jd1',saved:true});
  state.payRates.push({id:'r_jd1',empId:e.id,changeType:'Permanent',effectiveDate:'2026-05-22',endDate:'',position:'Payroll Officer',hourlyRate:40,jobDataId:'jd1'});
  state.positions[0].hourlyRate=50;
  assert.strictEqual(E.activePayRate(state,e.id,'2026-05-25').hourlyRate,40, 'Editing a position should not change the employee pay rate until a new Job Data row is saved');
  state.jobDataRows.push({id:'jd2',empId:e.id,effectiveDate:'2026-06-05',effectiveSequence:0,action:'Variation',reason:'Pay Rate Change',positionNumber:'1234',positionName:'Payroll Officer',department:'Human Resources',hourlyRate:50,positionClass:'Permanent',hoursByDay:{1:7.5,2:7.5,3:7.5,4:7.5,5:7.5,6:0,0:0},rateId:'r_jd2',scheduleId:'s_jd2',saved:true});
  state.payRates.push({id:'r_jd2',empId:e.id,changeType:'Permanent',effectiveDate:'2026-06-05',endDate:'',position:'Payroll Officer',hourlyRate:50,jobDataId:'jd2'});
  assert.strictEqual(E.activePayRate(state,e.id,'2026-06-05').hourlyRate,50, 'New Job Data row should apply the updated position rate from its effective date');
})();

(function testV118AbsenceBalanceDisplayUsesCommittedBalancesOnly(){
  const state=baseState(); const e=addEmployee(state,{annualLeaveBalance:100,personalLeaveBalance:50}); addSchedule(state,e.id); addRate(state,e.id);
  const c=E.currentCycle(state);
  const committed=E.projectedBalances(state,e,c,false);
  const projected=E.projectedBalances(state,e,c,true);
  assert.strictEqual(committed.annual,100, 'Committed annual leave balance should remain unchanged before finalise');
  assert(projected.annual>committed.annual, 'Projected payslip balance may include current pay accrual separately');
})();


(function testV119JobDataUiAndReasons(){
  const app = fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
  assert(app.includes("'Expiry of Fixed Term'"), 'Termination reasons should include Expiry of Fixed Term');
  assert(app.includes('class="danger" title="Remove row"'), 'Job Data remove/minus button should be red/danger style');
  assert(app.includes('function sortedJobDataRows') && app.includes('E.compare(b.effectiveDate,a.effectiveDate)'), 'Job Data should sort newest to oldest by effective date');
  assert(app.indexOf('<label>Position Number</label>') < app.indexOf('<label>Position Name</label>'), 'Position Number should appear on the same position-details line before Position Name');
  assert(app.indexOf('<label>Position Class</label>') > app.indexOf('<label>Reports To</label>'), 'Position Class should be moved below the position details row');
  assert(app.includes('draft.id=uid(\'jobdata\')') && app.includes('draft.effectiveDate=todayIso()'), 'Adding a row should copy the previous row and default date to today');
})();

(function testV119JobDataOverridesOldChangeCentreRates(){
  const state=baseState(); const e=addEmployee(state,{startDate:'2026-05-22'});
  state.payRates.push({id:'old_cc',empId:e.id,effectiveDate:'2026-05-23',position:'Old Change Centre Rate',hourlyRate:90,changeType:'Permanent'});
  state.schedules.push({id:'old_s',empId:e.id,effectiveDate:'2026-05-23',hoursByDay:{1:1,2:1,3:1,4:1,5:1,6:0,0:0}});
  state.jobDataRows.push({id:'jd1',empId:e.id,effectiveDate:'2026-05-22',effectiveSequence:0,action:'Commencement',reason:'New Hire Permanent',positionNumber:'1234',positionName:'Job Data Position',department:'Operations',hourlyRate:40,positionClass:'Permanent',hoursByDay:{1:7.5,2:7.5,3:7.5,4:7.5,5:7.5,6:0,0:0},rateId:'jd_rate',scheduleId:'jd_sched',saved:true});
  state.payRates.push({id:'jd_rate',empId:e.id,effectiveDate:'2026-05-22',position:'Job Data Position',hourlyRate:40,changeType:'Permanent',jobDataId:'jd1'});
  state.schedules.push({id:'jd_sched',empId:e.id,effectiveDate:'2026-05-22',hoursByDay:{1:7.5,2:7.5,3:7.5,4:7.5,5:7.5,6:0,0:0},jobDataId:'jd1'});
  assert.strictEqual(E.activePayRate(state,e.id,'2026-05-25').hourlyRate,40, 'Saved Job Data should override old Change Centre/pay rate records');
  assert.strictEqual(E.weeklyHoursFromSchedule(E.activeSchedule(state,e.id,'2026-05-25')),37.5, 'Saved Job Data should override old Change Centre/schedule records');
})();

(function testV119TerminationEffectiveDateIsDayAfterLastWorked(){
  const state=baseState(); const e=addEmployee(state,{startDate:'2026-05-22',terminationDate:'2026-05-26',annualLeaveBalance:7.5,lslAccruedBalance:0});
  addSchedule(state,e.id,'2026-05-22'); addRate(state,e.id,'2026-05-22','Officer',40);
  const payslips=E.calculateEmployee(state,e.id,1,false);
  assert.strictEqual(totalUnitsByDesc(payslips,'Regular Pay'),15, 'Termination effective date is day after last working day, so ordinary pay stops before the effective date');
  assert(totalUnitsByDesc(payslips,'Annual Leave Payout') > 7.5, 'Termination payout should include final-period leave accrual when the termination effective date is in the current pay period');
})();


(function testV1111RequestedChanges(){
  const root = __dirname;
  const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
  const app = fs.readFileSync(path.join(root,'app.js'),'utf8');
  const styles = fs.readFileSync(path.join(root,'styles.css'),'utf8');
  const data = fs.readFileSync(path.join(root,'data-store.js'),'utf8');
  assert(html.includes('Employee Data') && html.includes('Personal Details') && html.includes('data-tab="bankDetails"') && html.includes('data-tab="superDetails"'), 'Employee Data dropdown should contain Personal Details, Bank Details, Tax Details and Super');
  assert(html.includes('id="alertsBell"') && html.includes('id="alertsDropdown"') && app.includes('No New Alerts'), 'Top bar alert bell dropdown should exist and show No New Alerts when empty');
  const payslipSection = app.slice(app.indexOf('function payslipHtml'), app.indexOf('function renderCertification'));
  assert(payslipSection.includes("['LSL Entitlement Date'") && !payslipSection.includes("['LSL Pro-rata (Hours)'"), 'Payslip should show LSL Entitlement Date and not LSL pro-rata');
  assert(app.includes('clearOpenPayslip();') && app.includes('window.scrollTo({ top:0'), 'Tab changes should clear payslip content and reset scroll to top');
  assert(styles.includes('page-break-after:auto!important') && styles.includes('body > *:not(#printArea){display:none!important;}'), 'Print CSS should suppress blank pages and print only the payslip area');
  assert(styles.includes('.legend .otherleave') && styles.includes('.cal-day.otherleave'), 'Other Leave dark green styles should exist');
  assert(data.includes('alerts: []'), 'State should include alerts for future workflow items');
})();

(function testV1111AddressEffectiveDateSnapshot(){
  const state=baseState();
  const e=addEmployee(state,{address:'Old Address'}); addSchedule(state,e.id); addRate(state,e.id);
  e.personalDetailsHistory=[{id:'p1',effectiveDate:'2026-05-22',address:'Old Address',email:'',phone:'',dateOfBirth:''},{id:'p2',effectiveDate:'2026-06-05',address:'New Address',email:'',phone:'',dateOfBirth:''}];
  e.address='New Address';
  const p1=E.calculateEmployee(state,e.id,1,false)[0];
  assert.strictEqual(p1.employeeSnapshot.address,'Old Address','Current/open payslip before address effective date should retain old address');
  const p2=E.calculateEmployee(state,e.id,2,false)[0];
  assert.strictEqual(p2.employeeSnapshot.address,'New Address','Future payslip on/after address effective date should use new address');
})();

(function testV1111PublicHolidayAndRetroDifferenceOnly(){
  const state=baseState(); const e=addEmployee(state); addSchedule(state,e.id); addRate(state,e.id,'2026-05-22','Officer',40);
  const original=E.calculateEmployee(state,e.id,1,true).map(p=>Object.assign({},p,{finalised:true}));
  state.finalisedCycles['1']={id:1,finalisedAt:'2026-06-04'}; state.payslips.push(...original); state.currentCycleId=2;
  state.payRates.push({id:'r2',empId:e.id,effectiveDate:'2026-05-22',position:'Officer',hourlyRate:41,changeType:'Permanent'});
  const next=E.calculateEmployee(state,e.id,2,false);
  const regRetroAmount=next.flatMap(p=>p.rows).filter(r=>r.description==='Regular Pay Retro').reduce((s,r)=>s+r.amount,0);
  assert.strictEqual(regRetroAmount,67.5,'Retro pay rate change should pay only the difference for Regular Pay');
  const phRetroAmount=next.flatMap(p=>p.rows).filter(r=>r.description==='Public Holiday Retro').reduce((s,r)=>s+r.amount,0);
  assert.strictEqual(phRetroAmount,7.5,'Retro pay rate change should keep Public Holiday Retro separate');
  const casualState=baseState(); const casual=addEmployee(casualState,{type:'Casual'}); addSchedule(casualState,casual.id); addRate(casualState,casual.id);
  const casualPays=E.calculateEmployee(casualState,casual.id,1,false);
  assert.strictEqual(totalUnitsByDesc(casualPays,'Public Holiday'),0,'Casual employees should not receive automatic public holiday pay when not specifically worked');
})();


(function testV1112RetroPayRateDifferenceOnlyEvenIfPositionChanges(){
  const state=baseState(); const e=addEmployee(state); addSchedule(state,e.id); addRate(state,e.id,'2026-05-22','Officer',40);
  state.taxDetails.push({id:'tax1',empId:e.id,effectiveDate:e.startDate,taxFileNumber:'123456789',claimTaxFreeThreshold:true,stsl:false});
  const original=E.calculateEmployee(state,e.id,1,true).map(p=>Object.assign({},p,{finalised:true}));
  state.finalisedCycles['1']={id:1,finalisedAt:'2026-06-04'}; state.payslips.push(...original); state.currentCycleId=2;
  state.payRates.push({id:'r_new',empId:e.id,effectiveDate:'2026-05-22',position:'Updated Officer',hourlyRate:41,changeType:'Permanent'});
  const next=E.calculateEmployee(state,e.id,2,false);
  const rows=next.flatMap(p=>p.rows||[]);
  const regular=rows.filter(r=>r.description==='Regular Pay Retro');
  assert.strictEqual(regular.length,1,'Backdated pay rate change should consolidate Regular Pay Retro to the difference-only line even if position text changes');
  assert.strictEqual(Number(regular[0].amount.toFixed(2)),67.5,'Regular Pay Retro should be the $1/hour difference for 67.5 regular hours only');
  assert(!regular.some(r=>Math.abs(r.amount)>1000),'Retro pay rate change should not recover and reissue full old/new regular pay amounts');
})();

(function testV1112LeaveAccrualPerPayPeriodNoDoubleAddOnCalculate(){
  const state=baseState(); const e=addEmployee(state,{annualLeaveBalance:100,personalLeaveBalance:50}); addSchedule(state,e.id); addRate(state,e.id);
  const p1=E.calculateEmployee(state,e.id,1,false)[0];
  const p2=E.calculateEmployee(state,e.id,1,false)[0];
  assert.strictEqual(p1.annualAccrual, E.leaveAccrualForOrdinaryHours(e,75).annual, 'Annual Leave accrual should be based on ordinary hours in the pay period');
  assert.strictEqual(p1.personalAccrual, E.leaveAccrualForOrdinaryHours(e,75).personal, 'Personal Leave accrual should be based on ordinary hours in the pay period');
  assert.strictEqual(e.annualLeaveBalance,100,'Calculate Pay should not commit or double-add Annual Leave balance before finalisation');
  assert.strictEqual(e.personalLeaveBalance,50,'Calculate Pay should not commit or double-add Personal Leave balance before finalisation');
  assert.deepStrictEqual({a:p1.annualAccrual,p:p1.personalAccrual},{a:p2.annualAccrual,p:p2.personalAccrual},'Repeated Calculate Pay should produce the same accrual for the period');
})();

(function testV1112CertificationWorkflowAndAlertStrings(){
  const app = fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
  const styles = fs.readFileSync(path.join(__dirname,'styles.css'),'utf8');
  assert(app.includes('function autoSaveCertLine') && app.includes('Certification progress saved'), 'Certification line checkboxes should auto-save progress');
  assert(app.includes('Certification removed:') && app.includes('reconcileCertificationForCycle'), 'Current/open pay changes after certification should uncertify affected lines and create an alert');
  assert(app.includes('Mark as read') && app.includes('markAlertRead'), 'Alerts dropdown should support marking individual alerts as read');
  assert(app.includes('has not yet been completed and is overdue. Please complete this certification report as soon as possible.'), 'Past incomplete certification reports should create daily overdue alerts');
  assert(app.includes('completed previous-period certification reports remain permanently locked') || app.includes('Completed previous-period certification reports remain permanently locked'), 'Change notes should state previous completed reports stay locked');
  assert(styles.includes('min-height:282mm!important') && styles.includes('v1.1.16 top-aligned tab layout'), 'v1.1.18 print CSS should enlarge the payslip to fill the A4 page better');
})();


(function testV1113RequestedChanges(){
  const root = __dirname;
  const app = fs.readFileSync(path.join(root,'app.js'),'utf8');
  const styles = fs.readFileSync(path.join(root,'styles.css'),'utf8');
  assert(styles.includes('main{margin:0 auto;align-self:start;}') && styles.includes('.app-shell{align-items:start;}'), 'Main tab layout should be top-aligned rather than vertically centred');
  assert(styles.includes('width:430px') && styles.includes('alert-action') && app.includes('navigateFromAlert'), 'Alerts dropdown should be larger and alert rows should navigate when clicked');
  assert(styles.includes('padding-left:18mm') && styles.includes('justify-self:end') && styles.includes('font-size:12px!important'), 'Printed payslip should be larger, address shifted right and right-side details aligned right');
})();

(function testV1113RetroRateDisplayUsesNormalRateWherePractical(){
  const state=baseState(); const e=addEmployee(state); addSchedule(state,e.id); addRate(state,e.id,'2026-05-22','Officer',40);
  const original=E.calculateEmployee(state,e.id,1,true).map(p=>Object.assign({},p,{finalised:true}));
  state.finalisedCycles['1']={id:1,finalisedAt:'2026-06-04'}; state.payslips.push(...original); state.currentCycleId=2;
  state.payRates.push({id:'r_new',empId:e.id,effectiveDate:'2026-05-22',position:'Officer',hourlyRate:41,changeType:'Permanent'});
  const rows=E.calculateEmployee(state,e.id,2,false).flatMap(p=>p.rows||[]);
  const regular=rows.find(r=>r.description==='Regular Pay Retro');
  assert(regular, 'Regular Pay Retro should be created for a backdated pay rate change');
  assert.strictEqual(Number(regular.amount.toFixed(2)),67.5,'Retro amount should still be difference-only');
  assert.strictEqual(Number(regular.rate.toFixed(2)),41,'Retro pay rate display should generally keep the applicable normal rate');
  assert(Math.abs(Number(regular.units)-1.6463)<0.0002,'Retro units should represent amount divided by applicable normal rate');
})();



(function testV1114JobDataUnsavedPromptStrings(){
  const app = fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
  assert(app.includes('function jobDataHasUnsavedChanges'), 'Job Data should detect unsaved changes before navigation');
  assert(app.includes('discardJobDataUnsavedChanges'), 'Job Data should be able to discard unsaved changes when the user confirms exit');
  assert(app.includes('function jobDataExitConfirm') && app.includes('id="jobDataExitYes">Yes') && app.includes('id="jobDataExitNo">No'), 'Job Data exit prompt should use exact message with only Yes and No buttons');
  assert(!app.includes('Save changes, then continue leaving the page'), 'Job Data unsaved prompt should not include a Save button flow');
})();

(function testV1114RetroAlreadyPaidDoesNotDuplicateNextPay(){
  const state=baseState(); const e=addEmployee(state); addSchedule(state,e.id); addRate(state,e.id,'2026-05-22','Officer',40);
  const cycle1Paid=E.calculateEmployee(state,e.id,1,true).map(p=>Object.assign({},p,{finalised:true}));
  state.finalisedCycles['1']={id:1,finalisedAt:'2026-06-04'};
  state.payslips.push(...cycle1Paid);
  state.currentCycleId=2;
  state.payRates.push({id:'r_new',empId:e.id,effectiveDate:'2026-05-22',position:'Officer',hourlyRate:41,changeType:'Permanent'});
  const cycle2Paid=E.calculateEmployee(state,e.id,2,true).map(p=>Object.assign({},p,{finalised:true}));
  const cycle2RetroAmount=cycle2Paid.flatMap(p=>p.rows||[]).filter(r=>r.description==='Regular Pay Retro').reduce((sum,r)=>sum+Number(r.amount||0),0);
  assert.strictEqual(Number(cycle2RetroAmount.toFixed(2)),67.5,'Cycle 2 should pay the original backdated Regular Pay Retro difference once');
  state.finalisedCycles['2']={id:2,finalisedAt:'2026-06-18'};
  state.payslips.push(...cycle2Paid);
  state.currentCycleId=3;
  const cycle3=E.calculateEmployee(state,e.id,3,false);
  const cycle3RetroAmount=cycle3.flatMap(p=>p.rows||[]).filter(r=>r.description==='Regular Pay Retro' || r.description==='Public Holiday Retro').reduce((sum,r)=>sum+Number(r.amount||0),0);
  assert.strictEqual(Number(cycle3RetroAmount.toFixed(2)),0,'Retro already paid in the previous finalised pay must not be generated again in the current pay');
})();


(function testV1115DateValidationAndCleanRows(){
  assert.strictEqual(E.fmtPay(''), '', 'Blank dates should render as blank');
  assert.strictEqual(E.fmtLong('not-a-date'), '', 'Invalid dates should render as blank');
  assert.strictEqual(E.parseDate('2026-02-30'), null, 'Impossible calendar dates should be rejected');
  const state=baseState(); const e=addEmployee(state); addSchedule(state,e.id); addRate(state,e.id);
  const rows=E.calculateEmployee(state,e.id,1,false).flatMap(p=>p.rows||[]);
  assert(rows.length>0 && rows.every(r=>!Object.prototype.hasOwnProperty.call(r,'_key')), 'Internal row merge keys must not leak into saved payslip data');
})();

(function testV1115WholeEmployeeTaxDeductionsAndAccrualAcrossMultiplePayslips(){
  const state=baseState(); const e=addEmployee(state,{annualLeaveBalance:0,personalLeaveBalance:0});
  addSchedule(state,e.id);
  addRate(state,e.id,'2026-05-22','Position A',40);
  addRate(state,e.id,'2026-05-29','Position B',50);
  state.taxDetails.push({id:'taxMulti',empId:e.id,effectiveDate:'2026-05-22',taxFileNumber:'123456789',claimTaxFreeThreshold:true,stsl:false});
  state.deductions.push({id:'dedMulti',empId:e.id,startDate:E.cycleById(1).start,endDate:'',deductionType:'Pre-tax Super Deduction',amount:'',percentage:5,saved:true,deleted:false});
  const payslips=E.calculateEmployee(state,e.id,1,false);
  assert.strictEqual(payslips.length,2,'Position/rate changes should create two payslip segments');
  const gross=E.round2(payslips.reduce((sum,p)=>sum+p.gross,0));
  const preTax=E.round2(payslips.reduce((sum,p)=>sum+p.preTaxDeductionTotal,0));
  const tax=E.round2(payslips.reduce((sum,p)=>sum+p.tax,0));
  const expectedPreTax=E.round2(gross*0.05);
  const expectedTax=E.taxForGross(state,e,gross-expectedPreTax,E.cycleById(1).end);
  assert.strictEqual(preTax,expectedPreTax,'Percentage deductions must apply to the whole employee pay, not only the first segment');
  assert.strictEqual(tax,expectedTax,'Tax must be calculated once on total employee pay and allocated across segments');
  const expectedAccrual=E.leaveAccrualForOrdinaryHours(e,payslips[0].ordinaryHours);
  payslips.forEach(p=>{
    assert.strictEqual(p.annualAccrual,expectedAccrual.annual,'Every segment should show the same whole-pay annual leave accrual');
    assert.strictEqual(p.personalAccrual,expectedAccrual.personal,'Every segment should show the same whole-pay personal leave accrual');
  });
})();

(function testV1115DeductionEndDatingMostRecentClosedPeriod(){
  const state=baseState(); const e=addEmployee(state); state.currentCycleId=2;
  const previous=E.cycleById(1), current=E.cycleById(2);
  state.deductions.push({id:'oldDed',empId:e.id,startDate:previous.start,endDate:previous.end,deductionType:'Pre-tax Super Deduction',amount:20,percentage:'',saved:true,deleted:false});
  state.deductions.push({id:'newDed',empId:e.id,startDate:current.start,endDate:'',deductionType:'Pre-tax Super Deduction',amount:25,percentage:'',saved:true,deleted:false});
  const active=E.activeDeductions(state,e,current,'Pre-tax Super Deduction');
  assert.deepStrictEqual(active.map(d=>d.id),['newDed'],'A deduction end-dated in the most recent closed pay must not continue into the current open pay');
  const app=fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
  assert(app.includes("kind==='end' ? Math.max(0,curIdx-1) : curIdx"),'Deduction end-date options should include the most recent closed pay period');
  assert(app.includes('Overlapping ${a.deductionType} records are not allowed'),'Replacement deductions should be protected from overlapping records');
})();

(function testV1115RetroDisplayUsesChangedNormalRateForPartialPeriodRateChange(){
  const state=baseState(); const e=addEmployee(state); addSchedule(state,e.id); addRate(state,e.id,'2026-05-22','Officer',40);
  const paid=E.calculateEmployee(state,e.id,1,true).map(p=>Object.assign({},p,{finalised:true}));
  state.payslips.push(...paid); state.finalisedCycles['1']={id:1,finalisedAt:'2026-06-04'}; state.currentCycleId=2;
  state.payRates.push({id:'partialRate',empId:e.id,effectiveDate:'2026-05-25',position:'Officer',hourlyRate:41,changeType:'Permanent'});
  const retro=E.calculateEmployee(state,e.id,2,false).flatMap(p=>p.rows||[]).filter(r=>r.kind==='retro');
  const regular=retro.find(r=>r.description==='Regular Pay Retro');
  const publicHoliday=retro.find(r=>r.description==='Public Holiday Retro');
  assert(regular && Math.abs(regular.amount-60)<0.01,'Partial-period rate change should pay only the Regular Pay difference');
  assert.strictEqual(regular.rate,41,'Regular Pay Retro should generally retain the changed normal rate');
  assert(publicHoliday && Math.abs(publicHoliday.amount-7.5)<0.01 && publicHoliday.rate===41,'Public Holiday Retro should remain a separate earnings type at the applicable normal rate');
})();

(function testV1115IncrementalRetroTaxUsesPreviouslyPaidRetroAsBase(){
  const state=baseState(); const e=addEmployee(state,{startDate:'2026-05-22'});
  state.taxDetails.push({id:'taxIncremental',empId:e.id,effectiveDate:'2026-05-22',taxFileNumber:'123456789',claimTaxFreeThreshold:true,stsl:false});
  const c1=E.cycleById(1), c2=E.cycleById(2), c3=E.cycleById(3);
  state.payslips.push({id:'original',empId:e.id,cycleId:1,finalised:true,rows:[{description:'Regular Pay',kind:'regular',units:12.5,rate:40,amount:500,startDate:c1.start,endDate:c1.end,ote:true}]});
  state.payslips.push({id:'priorRetro',empId:e.id,cycleId:2,finalised:true,rows:[{description:'Regular Pay Retro',kind:'retro',units:1,rate:50,amount:50,startDate:c1.start,endDate:c1.end,ote:true,accrualUnits:0,balanceUnits:0}]});
  const currentRetro={description:'Regular Pay Retro',kind:'retro',units:4,rate:50,amount:200,startDate:c1.start,endDate:c1.end,ote:true,accrualUnits:0,balanceUnits:0};
  const parts=E.calculateTaxComponents(state,e,[currentRetro],c3,0);
  const expected=E.taxForGross(state,e,750,c1.end)-E.taxForGross(state,e,550,c1.end);
  assert.strictEqual(parts.marginalTaxRetro,expected,'Later retro top-ups must calculate withholding from original pay plus retro already paid');
  assert.notStrictEqual(expected,E.taxForGross(state,e,700,c1.end)-E.taxForGross(state,e,500,c1.end),'Test setup must exercise a nonlinear tax-table difference');
})();

(function testV1115FinalisationCannotDoubleCommitBalances(){
  const state=baseState(); const e=addEmployee(state,{annualLeaveBalance:0,personalLeaveBalance:0}); addSchedule(state,e.id); addRate(state,e.id);
  E.finaliseCurrentPay(state);
  const balances={annual:e.annualLeaveBalance,personal:e.personalLeaveBalance};
  state.currentCycleId=1;
  assert.throws(()=>E.finaliseCurrentPay(state),/already been finalised/,'A finalised pay period must not be finalised a second time');
  assert.deepStrictEqual({annual:e.annualLeaveBalance,personal:e.personalLeaveBalance},balances,'Blocked re-finalisation must not double-add leave accruals');
})();

(function testV1115LeaveCannotBeBookedOnTerminationEffectiveDate(){
  const state=baseState(); const e=addEmployee(state,{terminationDate:'2026-05-26'}); addSchedule(state,e.id); addRate(state,e.id);
  const result=E.validateLeaveBooking(state,e.id,'Annual Leave','2026-05-26','2026-05-26',7.5);
  assert.strictEqual(result.ok,false,'Leave must not be bookable on or after the termination effective date');
  assert(result.message.includes('termination effective date'));
})();

(function testV1115LslEntitlementConversionOccursOnce(){
  const state=baseState(); const e=addEmployee(state,{startDate:'2026-05-22',lslServiceDate:'2016-06-01',lslEntitlementDateOverride:'2026-06-01',lslProRataOverride:100,lslAccruedBalance:10,lslEntitlementConvertedAt:''});
  addSchedule(state,e.id); addRate(state,e.id);
  const before=E.lslBalances(state,e,E.cycleById(1).end);
  assert.strictEqual(before.lslAccrued,undefined);
  assert.strictEqual(before.accrued,110,'Pro-rata LSL should move into accrued LSL at entitlement');
  E.finaliseCurrentPay(state);
  assert.strictEqual(e.lslAccruedBalance,110,'LSL conversion should be committed at finalisation');
  assert(e.lslEntitlementConvertedAt,'LSL conversion should be marked as completed');
  const after=E.lslBalances(state,e,E.cycleById(2).end);
  assert.strictEqual(after.accrued,110,'Converted pro-rata LSL must not be added again in a later pay period');
})();

(function testV1115CertificationAlertCleanupAndSafeDeductionHistoryStrings(){
  const app=fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
  assert(app.includes('function clearCertificationAlerts(cycleId)') && app.includes('clearCertificationAlerts(cycleId);'),'Completing a certification report should clear its outstanding alerts');
  assert(app.includes("return !E.isFinalised(state,currentCycle()) && !!startCycle && Number(startCycle.id)===Number(currentCycle().id)"),'Historical deductions should be end-dated rather than deleted');
  assert(app.includes("finally{ $('processingScreen').classList.remove('open'); }"),'Processing overlay should always close even when an operation fails');
})();


(function testV1115FixedTermExpiryIsInclusiveButManualTerminationIsExclusive(){
  const state=baseState();
  const e=addEmployee(state,{type:'Fixed Term',contractEndDate:'2026-06-02',autoTerminate:true});
  addSchedule(state,e.id); addRate(state,e.id);
  E.autoProcessContractExpiries(state,'2026-06-04');
  assert.strictEqual(e.terminationDate,'2026-06-02','Auto expiry should retain the contract end date for display/history');
  assert.strictEqual(e.terminationReason,'Expiry of Fixed Term');
  assert.strictEqual(E.isEmployedOn(e,'2026-06-02'),true,'A fixed-term employee must remain employed and payable on the inclusive contract end date');
  assert.strictEqual(E.isTerminatedOn(e,'2026-06-02'),false,'Expiry status should not take effect until after the inclusive contract end date');
  assert.strictEqual(E.isTerminatedOn(e,'2026-06-03'),true,'Expiry status should take effect after the contract end date');
  const leave=E.validateLeaveBooking(state,e.id,'LWOP','2026-06-02','2026-06-02',7.5);
  assert.strictEqual(leave.ok,true,'An absence may be booked on the inclusive fixed-term contract end date');
  const pay=E.calculateEmployee(state,e.id,1,false);
  assert(pay.flatMap(p=>p.rows||[]).some(r=>r.description==='Regular Pay' && E.compare(r.startDate,'2026-06-02')<=0 && E.compare(r.endDate,'2026-06-02')>=0),'The scheduled contract end date must still be included in pay');

  const manual=addEmployee(baseState(),{id:'000002',terminationDate:'2026-06-01',terminationReason:'Voluntary - Resignation'});
  assert.strictEqual(E.isEmployedOn(manual,'2026-06-01'),false,'A manually entered termination effective date is the day after the last working day and is exclusive');
  assert.strictEqual(E.isTerminatedOn(manual,'2026-06-01'),true,'Manual termination status should take effect on the termination effective date');
})();;


(function testV1116FinalisedLeavePayoutIsNotRecoveredNextPay(){
  const state=baseState();
  const e=addEmployee(state,{terminationDate:'2026-06-03',terminationReason:'Voluntary Resignation',annualLeaveBalance:40,employmentSegments:[{id:'segOld',startDate:'2026-05-22',endDate:'2026-06-03',inclusiveEnd:false,terminationReason:'Voluntary Resignation'}]});
  addSchedule(state,e.id); addRate(state,e.id);
  const finalised=E.finaliseCurrentPay(state);
  assert(finalised.payslips.flatMap(p=>p.rows||[]).some(r=>r.description==='Annual Leave Payout'&&r.amount>0),'Termination pay should include the leave payout');
  const nextRetro=E.retroRows(state,e,E.cycleById(2));
  assert(!nextRetro.some(r=>/Payout|Cash Out/.test(r.description)||r.amount<0),'A finalised leave payout must not be automatically recovered in the following pay');
})();

(function testV1116RehireStartsNewRetroBaseline(){
  const state=baseState();
  const e=addEmployee(state,{startDate:'2026-05-22',terminationDate:'2026-06-03',terminationReason:'Voluntary Resignation',annualLeaveBalance:20,employmentSegments:[{id:'seg1',startDate:'2026-05-22',endDate:'2026-06-03',inclusiveEnd:false,terminationReason:'Voluntary Resignation'}]});
  addSchedule(state,e.id,'2026-05-22'); addRate(state,e.id,'2026-05-22','Officer',40);
  E.finaliseCurrentPay(state);
  e.startDate='2026-06-05'; e.terminationDate=''; e.terminationReason=''; e.status='Active';
  e.employmentSegments.push({id:'seg2',startDate:'2026-06-05',endDate:'',inclusiveEnd:false,terminationReason:''});
  addSchedule(state,e.id,'2026-06-05'); addRate(state,e.id,'2026-06-05','Officer',40);
  const rows=E.calculateEmployee(state,e.id,2,false).flatMap(p=>p.rows||[]);
  assert(rows.some(r=>r.description==='Regular Pay'&&r.amount>0),'Rehired employee should receive current regular pay');
  assert(!rows.some(r=>r.kind==='retro'&&r.amount<0),'Rehire must not recover regular pay or leave from the previous employment segment');
})();

(function testV1116EffectiveDatedStructuredAddressSnapshots(){
  const state=baseState();
  const e=addEmployee(state,{addressLine:'1 Old Street',townSuburb:'Perth',state:'WA',postcode:'6000',country:'Australia',personalDetailsHistory:[
    {id:'a1',effectiveDate:'2026-05-22',addressLine:'1 Old Street',townSuburb:'Perth',state:'WA',postcode:'6000',country:'Australia'},
    {id:'a2',effectiveDate:'2026-06-05',addressLine:'2 New Road',townSuburb:'Subiaco',state:'WA',postcode:'6008',country:'Australia'}
  ]});
  addSchedule(state,e.id); addRate(state,e.id);
  const oldPay=E.calculateEmployee(state,e.id,1,true)[0];
  const newPay=E.calculateEmployee(state,e.id,2,false)[0];
  assert.strictEqual(oldPay.employeeSnapshot.addressLine,'1 Old Street','Finalised/historical payslip snapshot should use the address effective for that payment date');
  assert.strictEqual(oldPay.employeeSnapshot.townSuburb,'Perth');
  assert.strictEqual(newPay.employeeSnapshot.addressLine,'2 New Road','Current/future payslip should use the new effective-dated address');
  assert.strictEqual(newPay.employeeSnapshot.postcode,'6008');
  const app=fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
  assert(app.includes('Town/Suburb')&&app.includes('newPostcode')&&app.includes("[e.townSuburb,e.state,e.postcode]"),'Personal Details and payslip must use structured address fields and the requested line format');
})();

(function testV1116PersonalLeaveEvidenceValidation(){
  const state=baseState(); const e=addEmployee(state,{startDate:'2026-06-01',employmentSegments:[{id:'seg',startDate:'2026-06-01',endDate:'',inclusiveEnd:false}]});
  addSchedule(state,e.id,'2026-06-01'); addRate(state,e.id,'2026-06-01');
  const without=E.validateLeaveBooking(state,e.id,'Personal Leave','2026-06-08','2026-06-10');
  assert.strictEqual(without.ok,false,'Personal Leave of 3 working days must be blocked without evidence');
  assert(without.message.includes('Evidence must be provided'));
  const withEvidence=E.validateLeaveBooking(state,e.id,'Personal Leave','2026-06-08','2026-06-10',undefined,undefined,{evidenceProvided:true});
  assert.strictEqual(withEvidence.ok,true,'Personal Leave of 3 working days must be allowed when Evidence Provided is selected');
  const twoDays=E.validateLeaveBooking(state,e.id,'Personal Leave','2026-06-08','2026-06-09');
  assert.strictEqual(twoDays.ok,true,'Personal Leave of 2 working days must not require evidence');
})();

(function testV1116OverpaymentAdjustmentNeverAccruesLeave(){
  const state=baseState(); const e=addEmployee(state,{annualLeaveBalance:0,personalLeaveBalance:0}); addSchedule(state,e.id); addRate(state,e.id);
  state.additionalEarnings.push({id:'over',empId:e.id,cycleId:1,earningType:'Overpayment Adjustment',amount:500,saved:true,startDate:E.ANCHOR_CYCLE.start,endDate:E.ANCHOR_CYCLE.end});
  const p=E.calculateEmployee(state,e.id,1,false)[0];
  assert.strictEqual(p.ordinaryHours,75,'Overpayment Adjustment must not increase ordinary/service hours');
  assert.strictEqual(p.annualAccrual,E.leaveAccrualForOrdinaryHours(e,75).annual,'Overpayment Adjustment must not increase Annual Leave accrual');
  assert.strictEqual(p.personalAccrual,E.leaveAccrualForOrdinaryHours(e,75).personal,'Overpayment Adjustment must not increase Personal Leave accrual');
})();

(function testV1116BereavementMaximumFiveWorkingDays(){
  const state=baseState(); const e=addEmployee(state,{startDate:'2026-06-01',employmentSegments:[{id:'seg',startDate:'2026-06-01',endDate:'',inclusiveEnd:false}]});
  addSchedule(state,e.id,'2026-06-01'); addRate(state,e.id,'2026-06-01');
  const five=E.validateLeaveBooking(state,e.id,E.BEREAVEMENT_LEAVE_TYPE,'2026-06-08','2026-06-12');
  assert.strictEqual(five.ok,true,'Bereavement Leave should allow up to 5 scheduled working days');
  const six=E.validateLeaveBooking(state,e.id,E.BEREAVEMENT_LEAVE_TYPE,'2026-06-08','2026-06-15');
  assert.strictEqual(six.ok,false,'Bereavement Leave should block a 6-working-day booking');
  assert(six.message.includes('5 working days'));
})();

(function testV1116FamilyDomesticViolenceLeaveConfidentialNESLogic(){
  const state=baseState(); const e=addEmployee(state,{startDate:'2026-05-22',employmentSegments:[{id:'seg',startDate:'2026-05-22',endDate:'',inclusiveEnd:false}]});
  addSchedule(state,e.id); addRate(state,e.id);
  assert.strictEqual(E.fdvRemainingDays(state,e,'2026-05-26'),10,'FDV leave must be available as 10 days upfront');
  state.leaveBookings.push({id:'fdv1',empId:e.id,type:E.FDV_LEAVE_TYPE,startDate:'2026-05-26',endDate:'2026-05-26',hours:7.5,requestedHours:7.5,confidential:true,status:'Approved'});
  const payRows=E.calculateEmployee(state,e.id,1,false).flatMap(p=>p.rows||[]).filter(r=>r.startDate==='2026-05-26');
  assert(payRows.some(r=>r.description==='Regular Pay'&&r.leaveType===E.FDV_LEAVE_TYPE&&r.confidential),'FDV leave must be retained internally but shown as ordinary earnings on the payslip');
  assert(!payRows.some(r=>r.description===E.FDV_LEAVE_TYPE),'Payslip earnings must not reveal the confidential leave name');

  const entitlementState=baseState(); const e2=addEmployee(entitlementState,{id:'000002',startDate:'2026-06-01',employmentSegments:[{id:'seg2',startDate:'2026-06-01',endDate:'',inclusiveEnd:false}]});
  addSchedule(entitlementState,e2.id,'2026-06-01'); addRate(entitlementState,e2.id,'2026-06-01');
  const ten=E.validateLeaveBooking(entitlementState,e2.id,E.FDV_LEAVE_TYPE,'2026-06-08','2026-06-19');
  assert.strictEqual(ten.ok,true); entitlementState.leaveBookings.push({id:'fdv10',empId:e2.id,type:E.FDV_LEAVE_TYPE,startDate:'2026-06-08',endDate:'2026-06-19',hours:ten.hours,status:'Approved',confidential:true});
  assert.strictEqual(E.fdvRemainingDays(entitlementState,e2,'2026-06-20'),0,'Used FDV leave must reduce the confidential balance');
  assert.strictEqual(E.validateLeaveBooking(entitlementState,e2.id,E.FDV_LEAVE_TYPE,'2026-06-22','2026-06-22').ok,false,'Bookings cannot exceed the remaining FDV entitlement');
  assert.strictEqual(E.fdvRemainingDays(entitlementState,e2,'2027-06-01'),10,'FDV leave must renew to 10 days on the work anniversary and not carry over');

  const casualState=baseState(); const casual=addEmployee(casualState,{id:'000003',type:'Casual',startDate:'2026-05-22',employmentSegments:[{id:'seg3',startDate:'2026-05-22',endDate:'',inclusiveEnd:false}]});
  addSchedule(casualState,casual.id); addRate(casualState,casual.id);
  casualState.leaveBookings.push({id:'cfdv',empId:casual.id,type:E.FDV_LEAVE_TYPE,startDate:'2026-05-26',endDate:'2026-05-26',hours:7.5,requestedHours:7.5,confidential:true,status:'Approved'});
  const casualPay=E.calculateEmployee(casualState,casual.id,1,false)[0];
  assert(casualPay.rows.some(r=>r.leaveType===E.FDV_LEAVE_TYPE&&r.amount>0),'Casual employees must be paid for rostered FDV leave hours');
  assert.strictEqual(casualPay.annualAccrual,0); assert.strictEqual(casualPay.personalAccrual,0);
  const app=fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
  assert(app.includes("title=leave.type==='Family and Domestic Violence Leave'?'Private Leave'")&&app.includes('will not appear on the payslip or Absence Balance'),'Employee-facing calendar and balance displays must preserve FDV confidentiality');
  assert(app.includes("const isRehire=/^Rehire\\b/")&&app.includes("const isNewHire=/^New Hire\\b/"),'Job Data must recognise New Hire and Rehire reasons using valid word-boundary regular expressions');
})();

(function testV1116ExplicitCashOutDeletionCreatesOnlyRequestedRecovery(){
  const state=baseState(); const e=addEmployee(state); addSchedule(state,e.id); addRate(state,e.id);
  state.cashOutRequests.push({id:'cash1',empId:e.id,cycleId:1,effectiveDate:'2026-05-22',leaveType:'Annual Leave',hours:5,saved:true,deleted:false});
  E.finaliseCurrentPay(state);
  const cash=state.cashOutRequests[0]; cash.deleted=true; cash.deletedAtCycleId=2;
  const rows=E.calculateEmployee(state,e.id,2,false).flatMap(p=>p.rows||[]);
  const recoveries=rows.filter(r=>r.description==='Annual Leave Cash Out Recovery');
  assert.strictEqual(recoveries.length,1,'An explicitly deleted finalised cash-out should create one deliberate recovery');
  assert(recoveries[0].amount<0);
  assert(!rows.some(r=>r.kind==='retro'&&/Cash Out/.test(r.description)),'Cash-out correction must not also generate a duplicate retro recovery');
})();


(function testV1116MigrationFromLegacyAddressAndRehireHistory(){
  const legacy={
    version:'1.1.15',
    employees:[{id:'legacy1',firstName:'Legacy',lastName:'Employee',name:'Legacy Employee',startDate:'2026-06-05',originalStartDate:'2026-05-01',terminationDate:'',terminationReason:'',address:'99 Old Format Road',status:'Active'}],
    jobDataRows:[
      {id:'j1',empId:'legacy1',action:'Commencement',effectiveDate:'2026-05-01',saved:true,effectiveSequence:0},
      {id:'j2',empId:'legacy1',action:'Termination',effectiveDate:'2026-06-03',reason:'Voluntary Resignation',saved:true,effectiveSequence:0},
      {id:'j3',empId:'legacy1',action:'Commencement',effectiveDate:'2026-06-05',saved:true,effectiveSequence:0}
    ]
  };
  const migrated=DataStore.migrate(Object.assign(DataStore.emptyState(),legacy));
  const e=migrated.employees[0];
  assert.strictEqual(e.addressLine,'99 Old Format Road','Legacy free-text addresses must migrate to the Address field');
  assert.strictEqual(e.country,'Australia','Legacy addresses should receive the default country');
  assert.strictEqual(e.employmentSegments.length,2,'Legacy rehire history must migrate into separate employment segments');
  assert.strictEqual(e.employmentSegments[0].startDate,'2026-05-01');
  assert.strictEqual(e.employmentSegments[0].endDate,'2026-06-03');
  assert.strictEqual(e.employmentSegments[1].startDate,'2026-06-05');
  assert.strictEqual(e.employmentSegments[1].endDate,'');
})();


(function testV1118ReportsTabAndStatementOfService(){
  const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
  const certIndex=html.indexOf('data-tab="certification"');
  const reportsIndex=html.indexOf('data-tab="reports"');
  const auditIndex=html.indexOf('data-tab="audit"');
  assert(certIndex>=0&&reportsIndex>certIndex&&auditIndex>reportsIndex,'Reports must be positioned between Certification Report and Audit');
  assert(html.includes('id="reports"'),'Reports section must exist');
  assert(app.includes('function statementOfServiceHtml')&&app.includes('Service History:')&&app.includes('Leave Without Pay Taken:'),'Statement of Service generator and required sections must exist');
  assert(app.includes('Print / Save PDF')&&app.includes('Download HTML'),'Statement of Service must support print/PDF and download');
})();


(function testV1118StatementOfServiceGeneratedContent(){
  const appSource=fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
  const documentStub={addEventListener:()=>{},getElementById:()=>null,querySelectorAll:()=>[],querySelector:()=>null,documentElement:{},body:{}};
  const windowStub={addEventListener:()=>{}};
  const sessionStorageStub={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
  const context={DataStore,PayrollEngine:E,document:documentStub,window:windowStub,sessionStorage:sessionStorageStub,console,Intl,Date,setTimeout,clearTimeout,Blob:function(){},URL:{createObjectURL:()=>'',revokeObjectURL:()=>{}},alert:()=>{},confirm:()=>true};
  windowStub.document=documentStub; windowStub.sessionStorage=sessionStorageStub;
  vm.runInNewContext(appSource,context,{filename:'app.js'});
  const app=context.window.PayrollApp;
  assert(app&&typeof app.statementOfServiceHtml==='function','Statement of Service generator must be exposed for verification');
  const state=app.getState();
  state.employees.push({id:'E4038039',firstName:'Courtney',lastName:'De Lange',name:'Courtney De Lange',department:'Clarkson Primary School',position:'Teacher',type:'Permanent',startDate:'2009-01-29',originalStartDate:'2009-01-29',lslServiceDate:'2009-01-29',addressLine:'6 Rooke Way',townSuburb:'Clarkson',state:'WA',postcode:'6030',country:'Australia',personalDetailsHistory:[{id:'pd1',effectiveDate:'2009-01-29',addressLine:'6 Rooke Way',townSuburb:'Clarkson',state:'WA',postcode:'6030',country:'Australia'}],employmentSegments:[{id:'seg1',startDate:'2009-01-29',endDate:'2017-01-27',inclusiveEnd:true},{id:'seg2',startDate:'2022-01-27',endDate:'',inclusiveEnd:false}]});
  state.schedules.push({id:'s1',empId:'E4038039',effectiveDate:'2009-01-29',hoursByDay:{1:7.5,2:7.5,3:7.5,4:7.5,5:7.5,6:0,0:0}});
  state.payRates.push({id:'r1',empId:'E4038039',effectiveDate:'2009-01-29',position:'Teacher',hourlyRate:40,changeType:'Permanent'});
  state.jobDataRows.push({id:'j1',empId:'E4038039',effectiveDate:'2009-01-29',effectiveSequence:0,action:'Commencement',reason:'New Hire Fixed-Term',positionNumber:'1001',positionName:'Teacher - PrePrimary',department:'Quinns North Primary School',hoursByDay:{1:7.5,2:7.5,3:7.5,4:7.5,5:7.5,6:0,0:0},saved:true});
  state.leaveBookings.push({id:'lw1',empId:'E4038039',type:'LWOP',startDate:'2023-09-15',endDate:'2023-09-15',hours:7.5,status:'Approved'});
  const output=app.statementOfServiceHtml('E4038039','2025-10-15',{reference:'D25/1058552',signatory:'Luke McGuiness',signatoryPosition:'Payroll Officer'});
  assert(output.includes('STATEMENT OF SERVICE')&&output.includes('Service History:')&&output.includes('Leave Without Pay Taken:'),'Generated Statement of Service must contain the required sections');
  assert(output.includes('Courtney De Lange')&&output.includes('6 ROOKE WAY')&&output.includes('CLARKSON WA 6030'),'Generated report must use the employee name and structured effective-dated address');
  assert(output.includes('Teacher - PrePrimary')&&output.includes('Quinns North Primary School')&&output.includes('New Hire Fixed-Term'),'Generated report must include service-history details');
  assert(output.includes('15/9/23')&&output.includes('LUKE MCGUINESS')&&output.includes('PAYROLL OFFICER'),'Generated report must include LWOP and signatory details');
  assert(output.includes("McDonald&#39;s California Franchise"),'Generated report must use McDonald\'s California Franchise branding');
  assert(output.includes("commenced service with McDonald&#39;s California Franchise"),'Commencement wording must use the requested company name');
  assert(output.includes('different roles within the company'),'Job-number explanation must refer to the company');
  assert(output.includes('Please contact the Human Resources Department on HR@mcdonaldscf.com'),'Contact wording must use the requested HR email');
  assert(!output.includes('Government of Western Australia')&&!output.includes('Department of Education')&&!output.includes('151 Royal Street'),'Government, Department of Education and company-address branding must be absent from the generated report');
})();

(function testV1119TerminatedEmployeeCanReceiveAdditionalEarnings(){
  const state=baseState();
  const e=addEmployee(state,{terminationDate:'2026-06-04',terminationReason:'Resignation',status:'Terminated'});
  addSchedule(state,e.id); addRate(state,e.id);
  const prior=E.calculateEmployee(state,e.id,1,true).map(p=>Object.assign({},p,{finalised:true}));
  state.payslips=prior; state.finalisedCycles['1']={id:1,finalisedAt:'2026-06-04'}; state.currentCycleId=2;
  state.additionalEarnings.push({id:'term_add_1',empId:e.id,cycleId:2,earningType:'Reimbursement',startDate:'2026-06-10',endDate:'2026-06-10',hours:0,amount:125.50,saved:true});
  state.additionalEarnings.push({id:'term_add_2',empId:e.id,cycleId:2,earningType:'Additional Day',startDate:'2026-06-10',endDate:'2026-06-10',hours:2,amount:80,saved:true});
  const payslips=E.calculateEmployee(state,e.id,2,false);
  assert.strictEqual(payslips.length,1,'A terminated employee with valid Additional Earnings must receive a current-pay payslip');
  assert.strictEqual(totalAmountByDesc(payslips,'Reimbursement'),125.50,'The terminated employee Reimbursement must be paid');
  assert.strictEqual(totalAmountByDesc(payslips,'Additional Day'),80,'Hours-based Additional Earnings must also be payable after termination');
  assert.strictEqual(totalAmountByDesc(payslips,'Regular Pay'),0,'No Regular Pay may be recreated after termination');
  assert.strictEqual(totalAmountByDesc(payslips,'Regular Pay Retro'),0,'Finalised pre-termination Regular Pay must not be recreated as retro');
  assert.strictEqual(totalAmountByDesc(payslips,'Annual Leave Payout'),0,'A prior finalised termination payout must not be repeated in the later Additional Earnings pay');
})();

(function testV1119CurrentAnnualLeaveLoadingStaysOnSamePayslip(){
  const state=baseState(); const e=addEmployee(state); addSchedule(state,e.id); addRate(state,e.id);
  state.leaveBookings.push({id:'al_same_slip',empId:e.id,type:'Annual Leave',startDate:'2026-05-25',endDate:'2026-05-29',hours:37.5,status:'Approved'});
  const payslips=E.calculateEmployee(state,e.id,1,false);
  assert.strictEqual(payslips.length,1,'Current Annual Leave Loading must not create a separate payslip when the job/base rate is the same');
  assert(totalAmountByDesc(payslips,'Annual Leave')>0,'Annual Leave must be present on the payslip');
  assert(totalAmountByDesc(payslips,'Annual Leave Loading')>0,'Annual Leave Loading must be present on the same payslip');
  const descriptions=payslips[0].rows.map(r=>r.description);
  assert(descriptions.includes('Annual Leave')&&descriptions.includes('Annual Leave Loading'),'Annual Leave and Annual Leave Loading must be rows on the same payslip');
})();

(function testV1118PayslipAnnualLeaveRowsAreConsolidated(){
  const appSource=fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
  const documentStub={addEventListener:()=>{},getElementById:()=>null,querySelectorAll:()=>[],querySelector:()=>null,documentElement:{},body:{}};
  const windowStub={addEventListener:()=>{}};
  const sessionStorageStub={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
  const context={DataStore,PayrollEngine:E,document:documentStub,window:windowStub,sessionStorage:sessionStorageStub,console,Intl,Date,setTimeout,clearTimeout,Blob:function(){},URL:{createObjectURL:()=>'',revokeObjectURL:()=>{}},alert:()=>{},confirm:()=>true};
  windowStub.document=documentStub; windowStub.sessionStorage=sessionStorageStub;
  vm.runInNewContext(appSource,context,{filename:'app.js'});
  const app=context.window.PayrollApp;
  assert(app&&typeof app.consolidatePayslipDisplayRows==='function','Payslip display consolidation helper must be exposed for verification');
  const rows=[];
  ['2026-05-25','2026-05-26','2026-05-27','2026-05-28','2026-05-29'].forEach(date=>{
    rows.push({description:'Annual Leave',units:7.5,rate:40,amount:300,startDate:date,endDate:date,position:'Crew Member',kind:'leave',ote:true});
    rows.push({description:'Annual Leave Loading',units:7.5,rate:7,amount:52.5,startDate:date,endDate:date,position:'Crew Member',kind:'leaveLoading',ote:true});
  });
  const grouped=app.consolidatePayslipDisplayRows(rows);
  const annual=grouped.filter(r=>r.description==='Annual Leave');
  const loading=grouped.filter(r=>r.description==='Annual Leave Loading');
  assert.strictEqual(annual.length,1,'Five same-rate Annual Leave days must display as one payslip row');
  assert.strictEqual(loading.length,1,'Five same-rate Annual Leave Loading days must display as one payslip row');
  assert.strictEqual(annual[0].units,37.5); assert.strictEqual(annual[0].amount,1500);
  assert.strictEqual(loading[0].units,37.5); assert.strictEqual(loading[0].amount,262.5);
  assert.strictEqual(annual[0].startDate,'2026-05-25'); assert.strictEqual(annual[0].endDate,'2026-05-29');
  const mixed=app.consolidatePayslipDisplayRows(rows.concat([{description:'Annual Leave',units:7.5,rate:42,amount:315,startDate:'2026-06-01',endDate:'2026-06-01',position:'Crew Member',kind:'leave',ote:true}]));
  assert.strictEqual(mixed.filter(r=>r.description==='Annual Leave').length,2,'Annual Leave at a different rate must remain a separate payslip row');
})();

(function testV1117ReimbursementAmountAndNoLeaveAccrual(){
  const appSource=fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
  assert(appSource.includes("a.earningType==='Reimbursement'")&&appSource.includes('isAmountOnly=isOver||isReimbursement'),'Additional Earnings UI must provide amount-only Reimbursement entry');
  const state=baseState(); const e=addEmployee(state); addSchedule(state,e.id); addRate(state,e.id);
  state.additionalEarnings.push({id:'reimb1',empId:e.id,cycleId:1,earningType:'Reimbursement',startDate:'2026-05-26',endDate:'2026-05-26',hours:99,amount:125.50,saved:true});
  const p=E.calculateEmployee(state,e.id,1,false)[0];
  const row=p.rows.find(r=>r.description==='Reimbursement');
  assert(row,'Reimbursement must flow to the payslip');
  assert.strictEqual(row.amount,125.50,'Reimbursement must use the entered amount');
  assert.strictEqual(row.units,0,'Reimbursement must not create units/hours');
  assert.strictEqual(p.ordinaryHours,75,'Reimbursement must not increase ordinary/service hours');
  assert.strictEqual(p.annualAccrual,E.leaveAccrualForOrdinaryHours(e,75).annual,'Reimbursement must not increase Annual Leave accrual');
  assert.strictEqual(p.personalAccrual,E.leaveAccrualForOrdinaryHours(e,75).personal,'Reimbursement must not increase Personal Leave accrual');
})();

(function testV1117AnnualLeaveLoadingCurrentAndHistoricalRetro(){
  const state=baseState(); const e=addEmployee(state); addSchedule(state,e.id); addRate(state,e.id);
  state.leaveBookings.push({id:'al1',empId:e.id,type:'Annual Leave',startDate:'2026-05-25',endDate:'2026-05-25',hours:7.5,status:'Approved'});
  const current=E.calculateEmployee(state,e.id,1,false);
  assert.strictEqual(totalAmountByDesc(current,'Annual Leave'),300,'Annual Leave must pay at the ordinary rate');
  assert.strictEqual(totalAmountByDesc(current,'Annual Leave Loading'),52.5,'Annual Leave must automatically receive 17.5% loading');
  assert.strictEqual(current[0].ordinaryHours,75,'Annual Leave Loading must not add ordinary/service hours');

  const oldPayslips=E.calculateEmployee(state,e.id,1,true).map(p=>Object.assign({},p,{finalised:true,rows:p.rows.filter(r=>r.description!=='Annual Leave Loading')}));
  state.payslips=oldPayslips; state.finalisedCycles['1']={id:1,finalisedAt:'2026-06-04'}; state.currentCycleId=2;
  const next=E.calculateEmployee(state,e.id,2,false);
  assert.strictEqual(totalAmountByDesc(next,'Annual Leave Loading Retro'),52.5,'Past Annual Leave without loading must create the missing loading as retro in the open pay');

  const cycle2=E.cycleById(2);
  state.payslips=state.payslips.concat(next.map(p=>Object.assign({},p,{finalised:true,cycleId:2,cycle:cycle2})));
  state.finalisedCycles['2']={id:2,finalisedAt:cycle2.end}; state.currentCycleId=3;
  const third=E.calculateEmployee(state,e.id,3,false);
  assert.strictEqual(totalAmountByDesc(third,'Annual Leave Loading Retro'),0,'Finalised Annual Leave Loading Retro must not be paid again');
})();


(function testV1120RetroSettlementCannotOscillateAcrossPays(){
  const state=baseState(); const e=addEmployee(state); addSchedule(state,e.id); addRate(state,e.id);
  // Store three correctly paid/finalised base pays. Two later retro rows cancel each
  // other, but deliberately carry different historical date ranges. v1.1.19 could
  // count the wide positive row against more than one historical pay and regenerate
  // the same 8.29-hour adjustment again.
  for(let id=1; id<=3; id++){
    const c=E.cycleById(id);
    const rows=E.expectedGross(state,e,c).rows.map(r=>Object.assign({},r));
    if(id===2) rows.push({description:'Regular Pay Retro',kind:'retro',units:8.29,rate:40,baseRate:40,amount:331.60,startDate:E.cycleById(1).start,endDate:E.cycleById(2).end,position:'Officer',ote:true,accrualUnits:0,balanceUnits:0});
    if(id===3) rows.push({description:'Regular Pay Retro',kind:'retro',units:-8.29,rate:40,baseRate:40,amount:-331.60,startDate:E.cycleById(1).start,endDate:E.cycleById(1).end,position:'Officer',ote:true,accrualUnits:0,balanceUnits:0});
    state.payslips.push({id:`settled_${id}`,empId:e.id,cycleId:id,finalised:true,rows});
    state.finalisedCycles[String(id)]={id,finalisedAt:c.paymentDate};
  }
  state.currentCycleId=4;
  const retro=E.retroRows(state,e,E.cycleById(4));
  const regularRetro=retro.filter(r=>r.description==='Regular Pay Retro' && Math.abs(Number(r.amount||0))>=0.01);
  assert.strictEqual(regularRetro.length,0,'A finalised +8.29 retro and matching -8.29 recovery must settle to zero and must not be generated again in a later pay');
  const current=E.calculateEmployee(state,e.id,4,false);
  assert.strictEqual(totalAmountByDesc(current,'Regular Pay Retro'),0,'Current pay must not re-pay the already-settled 8.29 Regular Pay Retro');
})();

(function testV1121ResignationReplacesDeletedFixedTermExpiryAndStopsRegularPay(){
  const state=baseState();
  const e=addEmployee(state,{
    type:'Fixed Term',
    startDate:'2026-05-22',
    originalStartDate:'2026-05-22',
    contractEndDate:'2026-06-04',
    autoTerminate:true,
    terminationDate:'2026-06-04',
    terminationReason:'Expiry of Fixed Term',
    status:'Active',
    employmentSegments:[
      {id:'stale_expiry',startDate:'2026-05-22',endDate:'2026-06-04',inclusiveEnd:true,terminationReason:'Expiry of Fixed Term'},
      {id:'stale_open',startDate:'2026-05-22',endDate:'',inclusiveEnd:false,terminationReason:''}
    ]
  });
  state.schedules.push({id:'s_job',empId:e.id,effectiveDate:'2026-05-22',hoursByDay:{1:7.5,2:7.5,3:7.5,4:7.5,5:7.5,6:0,0:0},jobDataId:'jd_start'});
  state.payRates.push({id:'r_job',empId:e.id,effectiveDate:'2026-05-22',position:'Officer',hourlyRate:40,changeType:'Permanent',jobDataId:'jd_start'});
  // The old Expiry of Fixed Term row has been deleted. The saved Job Data now
  // contains the original commencement and an earlier resignation only.
  state.jobDataRows.push(
    {id:'jd_start',empId:e.id,action:'Commencement',reason:'New Hire Fixed-Term',effectiveDate:'2026-05-22',effectiveSequence:0,saved:true},
    {id:'jd_resign',empId:e.id,action:'Termination',reason:'Voluntary Resignation',effectiveDate:'2026-05-25',effectiveSequence:0,saved:true}
  );
  const payslips=E.calculateAll(state,1,false);
  assert.strictEqual(totalUnitsByDesc(payslips,'Regular Pay'),7.5,'Replacing a deleted fixed-term expiry with a 25/05 resignation must pay only the 7.5 scheduled hours before the resignation effective date');
  assert.strictEqual(e.terminationDate,'2026-05-25','Saved resignation must replace the stale fixed-term expiry as the authoritative termination date');
  assert.strictEqual(e.terminationReason,'Voluntary Resignation','Saved resignation reason must replace the stale expiry reason');
  const currentSegments=E.employmentSegments(e).filter(seg=>seg.startDate==='2026-05-22');
  assert.strictEqual(currentSegments.length,1,'Stale duplicate/open current employment segments must be collapsed during Job Data reconciliation');
  assert.strictEqual(currentSegments[0].endDate,'2026-05-25','The reconciled employment segment must stop at the resignation effective date');
  assert.strictEqual(currentSegments[0].inclusiveEnd,false,'Voluntary resignation is an exclusive termination boundary');
  assert.strictEqual(E.isEmployedOn(e,'2026-05-22'),true);
  assert.strictEqual(E.isEmployedOn(e,'2026-05-25'),false,'No Regular Pay may be generated on or after the resignation effective date');
  assert(!(state.jobEvents||[]).some(j=>j.description==='Expiry of Fixed Term'),'Automatic fixed-term processing must not recreate an expiry event when an explicit resignation exists');
})();


(function testV1122RetroPersonalLeaveBalanceDeductsOnce(){
  const state=baseState(); const e=addEmployee(state,{personalLeaveBalance:34}); addSchedule(state,e.id); addRate(state,e.id);
  for(let id=1; id<=2; id++){
    const c=E.cycleById(id);
    const pays=E.calculateEmployee(state,e.id,id,true).map(p=>Object.assign({},p,{finalised:true}));
    state.payslips.push(...pays);
    state.finalisedCycles[String(id)]={id,finalisedAt:c.paymentDate};
  }
  state.currentCycleId=3;
  state.leaveBookings.push({id:'retro_pl',empId:e.id,type:'Personal Leave',startDate:'2026-05-25',endDate:'2026-05-25',hours:7.5,status:'Approved'});
  const pays=E.calculateEmployee(state,e.id,3,false);
  const retroRows=pays.flatMap(p=>p.rows||[]).filter(r=>r.description==='Personal Leave Retro');
  assert.strictEqual(retroRows.length,1,'Retro Personal Leave should consolidate to one row');
  assert.strictEqual(Number(retroRows[0].balanceUnits),7.5,'Retro Personal Leave balance units must be deducted once, not doubled');
  const expected=E.round4(34 + E.leaveAccrualForOrdinaryHours(e,75).personal - 7.5);
  assert.strictEqual(E.round4(pays[0].balances.personal),expected,'Projected Personal Leave balance must only deduct the actual retro leave hours once');
})();

(function testV1122PersonalLeaveRepairCorrectsPreviouslyFinalisedDoubleDeduction(){
  const state=baseState(); const e=addEmployee(state,{personalLeaveBalance:23.3269}); addSchedule(state,e.id); addRate(state,e.id);
  const cycle2=E.cycleById(2), cycle3=E.cycleById(3);
  state.currentCycleId=4;
  state.finalisedCycles['2']={id:2,finalisedAt:cycle2.paymentDate};
  state.finalisedCycles['3']={id:3,finalisedAt:cycle3.paymentDate};
  state.payslips.push({
    id:'good2',empId:e.id,cycleId:2,cycle:cycle2,finalised:true,personalAccrual:E.leaveAccrualForOrdinaryHours(e,75).personal,
    balances:{personal:34},rows:[{description:'Regular Pay',kind:'regular',units:75,amount:3000,rate:40,startDate:cycle2.start,endDate:cycle2.end,ote:true}]
  });
  state.payslips.push({
    id:'bad3',empId:e.id,cycleId:3,cycle:cycle3,finalised:true,personalAccrual:E.leaveAccrualForOrdinaryHours(e,75).personal,
    balances:{personal:23.3269},rows:[
      {description:'Regular Pay',kind:'regular',units:75,amount:3000,rate:40,startDate:cycle3.start,endDate:cycle3.end,ote:true},
      {description:'Personal Leave Retro',kind:'retro',units:7.5,amount:300,rate:40,startDate:'2026-05-25',endDate:'2026-05-25',ote:true,balanceUnits:15,accrualUnits:15}
    ]
  });
  const result=E.repairPersonalLeaveBalances(state);
  const expected=E.round4(34 + E.leaveAccrualForOrdinaryHours(e,75).personal - 7.5);
  assert.strictEqual(E.round4(e.personalLeaveBalance),expected,'One-time repair must restore Personal Leave to the correct balance after a doubled retro deduction');
  assert.strictEqual(result.repaired.length,1,'Affected employee should be recorded as repaired');
  const second=E.repairPersonalLeaveBalances(state);
  assert.strictEqual(second.completedAt,result.completedAt,'Personal Leave repair must be idempotent');
})();

(function testV1122LeaveWithoutPayRetroVisible(){
  const state=baseState(); const e=addEmployee(state); addSchedule(state,e.id); addRate(state,e.id);
  const c1=E.cycleById(1);
  const paid=E.calculateEmployee(state,e.id,1,true).map(p=>Object.assign({},p,{finalised:true}));
  state.payslips.push(...paid); state.finalisedCycles['1']={id:1,finalisedAt:c1.paymentDate}; state.currentCycleId=2;
  state.leaveBookings.push({id:'lwop_retro',empId:e.id,type:'LWOP',startDate:'2026-05-25',endDate:'2026-05-25',hours:7.5,status:'Approved'});
  const current=E.calculateEmployee(state,e.id,2,false);
  assert.strictEqual(totalAmountByDesc(current,'Regular Pay Retro'),-300,'Retro LWOP should recover the previously paid Regular Pay');
  assert.strictEqual(totalUnitsByDesc(current,'Leave Without Pay Retro'),7.5,'Payslip rows must include Leave Without Pay Retro units');
  assert.strictEqual(totalAmountByDesc(current,'Leave Without Pay Retro'),0,'Leave Without Pay Retro is informational and must have zero earnings');
})();


(function testV1122ParentalLeaveUiAndRepairHook(){
  const app=fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
  assert(app.includes('<option>Parental Leave - Paid</option>')&&app.includes('<option>Parental Leave - Unpaid</option>')&&app.includes('<option>Parental Leave - Unpaid Extension</option>'),'Leave booking UI must expose all three parental leave types');
  assert(app.includes('id="parentalPayOption"')&&app.includes('<option>Full Pay</option><option>Half Pay</option>'),'Paid Parental Leave must provide Full Pay and Half Pay options');
  assert(app.includes('E.repairPersonalLeaveBalances(state)'),'App startup/import must invoke the one-time Personal Leave balance repair');
})();

(function testV1122ParentalLeaveRulesAndHalfPay(){
  const state=baseState(); const e=addEmployee(state,{personalLeaveBalance:100}); addSchedule(state,e.id); addRate(state,e.id);
  let full=E.validateLeaveBooking(state,e.id,E.PARENTAL_PAID_LEAVE_TYPE,'2026-06-05','2026-10-08',undefined,undefined,{payOption:'Full Pay'});
  assert.strictEqual(full.ok,true,'18 weeks Paid Parental Leave at full pay should be valid');
  let tooLong=E.validateLeaveBooking(state,e.id,E.PARENTAL_PAID_LEAVE_TYPE,'2026-06-05','2026-10-09',undefined,undefined,{payOption:'Full Pay'});
  assert.strictEqual(tooLong.ok,false,'Paid Parental Leave over 18 weeks at full pay must be blocked');

  const halfState=baseState(); const h=addEmployee(halfState,{id:'H1'}); addSchedule(halfState,h.id); addRate(halfState,h.id);
  let half=E.validateLeaveBooking(halfState,h.id,E.PARENTAL_PAID_LEAVE_TYPE,'2026-06-05','2027-02-11',undefined,undefined,{payOption:'Half Pay'});
  assert.strictEqual(half.ok,true,'36 weeks Paid Parental Leave at half pay should be valid');
  halfState.leaveBookings.push({id:'half',empId:h.id,type:E.PARENTAL_PAID_LEAVE_TYPE,startDate:'2026-06-05',endDate:'2027-02-11',hours:0,payOption:'Half Pay',status:'Approved'});
  const usage=E.parentalLeaveUsage(halfState,h);
  assert.strictEqual(usage.unpaidMaxDays,16*7,'36 weeks at half pay must reduce standard unpaid parental leave maximum to 16 weeks');
  const unpaidTooLong=E.validateLeaveBooking(halfState,h.id,E.PARENTAL_UNPAID_LEAVE_TYPE,'2027-02-12','2027-06-04',undefined,undefined,{});
  assert.strictEqual(unpaidTooLong.ok,false,'Unpaid parental leave over the remaining 16-week maximum must be blocked');

  const payState=baseState(); const pEmp=addEmployee(payState,{id:'P1'}); addSchedule(payState,pEmp.id); addRate(payState,pEmp.id);
  payState.leaveBookings.push({id:'hp',empId:pEmp.id,type:E.PARENTAL_PAID_LEAVE_TYPE,startDate:'2026-05-22',endDate:'2026-06-04',hours:75,payOption:'Half Pay',status:'Approved'});
  const pay=E.calculateEmployee(payState,pEmp.id,1,false);
  assert.strictEqual(totalUnitsByDesc(pay,E.PARENTAL_PAID_LEAVE_TYPE),67.5,'Half-pay parental leave should retain scheduled working hours while a public holiday inside the parental leave period is not paid separately');
  assert.strictEqual(totalAmountByDesc(pay,E.PARENTAL_PAID_LEAVE_TYPE),1350,'Half-pay parental leave should pay 50% of normal earnings for scheduled working hours in the period');

  const extensionState=baseState(); const ex=addEmployee(extensionState,{id:'EX1'}); addSchedule(extensionState,ex.id); addRate(extensionState,ex.id);
  const extensionTooLong=E.validateLeaveBooking(extensionState,ex.id,E.PARENTAL_UNPAID_EXTENSION_TYPE,'2026-06-05','2028-06-05',undefined,undefined,{});
  assert.strictEqual(extensionTooLong.ok,false,'Unpaid parental leave extension must not exceed 2 years in total');
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

console.log('PASS: No Tax Details fallback tax and payslip No TFN label are present');
console.log('PASS: Uploaded tax tables, tax-free-threshold Yes/No and STSL Yes affect pay calculations');
console.log('PASS: Leave Without Pay shows with hours/zero earnings and full-period LWOP suppresses payslip');
console.log('PASS: Zero-net prior-period leave retro replacement remains visible');
console.log('PASS: Additional Earnings Amount and Overpayment Adjustment are calculated correctly');
console.log('PASS: Commencement tax fields, read-only balances, tab order and DOB warning removal are present');

console.log('PASS: Absence Calendar defaults to current year and can navigate up to one year ahead');
console.log('PASS: Deductions, payslip deduction sections, Check for Errors, Import Preview and Recalculate Balances are present and calculated');
console.log('PASS: v1.1.18 audit fixes, deduction end-dating, retro controls, certification workflow, print/navigation and termination semantics are verified.');
console.log('PASS: v1.1.18 leave payout, rehire, structured address, evidence, Overpayment Adjustment, Bereavement Leave and confidential FDV Leave changes are verified.');

console.log('PASS: v1.1.17 Reports, Statement of Service, Reimbursement and Annual Leave Loading changes are verified.');
console.log('PASS: v1.1.18 consolidated Annual Leave payslip rows and McDonald\'s California Franchise Statement of Service changes are verified.');
console.log('PASS: v1.1.19 terminated-employee Additional Earnings and same-payslip Annual Leave Loading behaviour are verified.');
console.log('PASS: v1.1.20 cumulative retro settlement prevents +8.29/-8.29 oscillation across pay periods.');
console.log('PASS: v1.1.21 Job Data reconciliation replaces deleted fixed-term expiry with resignation and stops Regular Pay at the correct boundary.');

console.log('PASS: v1.1.22 retro Personal Leave balance repair, Leave Without Pay Retro payslip display and parental leave rules are verified.');
