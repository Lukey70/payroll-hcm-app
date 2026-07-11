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
  assert(html.includes('v1.1.14'), 'sidebar/version label must show v1.1.14');
  assert(data.includes("APP_VERSION = '1.1.14'"), 'data-store version must be 1.1.14');
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
  e.terminationDate='2026-06-04'; e.status='Terminated';
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
  assert(styles.includes('min-height:282mm!important') && styles.includes('v1.1.14 top-aligned tab layout'), 'v1.1.14 print CSS should enlarge the payslip to fill the A4 page better');
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
console.log('PASS: v1.1.14 Job Data ordering, copy-new-row, saved-row edit, termination effective date and source-of-truth rules are present.');
