#!/usr/bin/env node
'use strict';
process.env.TZ='Australia/Perth';
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const DataStore=require('../data-store.js'),E=require('../payroll-engine.js');
const root=path.join(__dirname,'..');let checks=0;
function test(name,fn){fn();checks++;console.log('PASS: '+name);}
function fixture(){
  const s=DataStore.emptyState();s.currentCycleId=11;
  const e={id:'e140',firstName:'Test',lastName:'Worker',name:'Test Worker',position:'Officer',type:'Permanent',startDate:'2026-10-09',originalStartDate:'2026-10-09',lslServiceDate:'2026-10-09',status:'Active',hourlyRate:40,annualLeaveBalance:0,personalLeaveBalance:0,lslAccruedBalance:0};
  s.employees.push(e);
  s.schedules.push({id:'sched140',empId:e.id,effectiveDate:e.startDate,hoursByDay:{0:0,1:7.5,2:7.5,3:7.5,4:7.5,5:7.5,6:0}});
  s.payRates.push({id:'rate140',empId:e.id,effectiveDate:e.startDate,position:'Officer',hourlyRate:40,changeType:'Permanent'});
  s.taxDetails.push({id:'tax140',empId:e.id,effectiveDate:e.startDate,taxFileNumber:'123456789',taxFreeThreshold:'Yes',stsl:'No'});
  return {s,e,c:E.currentCycle(s)};
}
function accounts(s,e){
  const fund=E.saveSuperFund(s,{fundName:'Example Super',usi:'EXAMPLE01',abn:'12345678901',active:true});
  const superRow=E.saveEmployeeSuper(s,{empId:e.id,effectiveDate:E.currentCycle(s).start,effectiveSequence:0,usi:fund.usi,memberNumber:'000123'});
  const bank=E.saveBankDetails(s,{empId:e.id,effectiveDate:E.currentCycle(s).start,effectiveSequence:0,bsb:'001-002',accountNumber:'00001234',accountName:'Test Worker'});
  return {fund,superRow,bank};
}
function recovery(s,e,id='rec140',openingDebt=150,amount=100){const d={id,empId:e.id,startDate:E.currentCycle(s).start,endDate:'',deductionType:'Recovery Deduction',amount,openingDebt,percentage:'',saved:true};s.deductions.push(d);return d;}
const total=(p,key)=>E.round2(p.reduce((t,x)=>t+Number(x[key]||0),0));
test('current/future cycle boundaries, duplicate sequence, historical read-only and validation',()=>{
  const {s,e,c}=fixture();const {bank,fund}=accounts(s,e);
  assert.strictEqual(bank.bsb,'001002');assert.strictEqual(bank.accountNumber,'00001234');
  const base={empId:e.id,effectiveSequence:1,bsb:'001002',accountNumber:'00001234',accountName:'Test Worker'};
  for(const date of [E.cycleById(10).start,E.addDays(c.start,1),'not-a-date'])assert.throws(()=>E.saveBankDetails(s,{...base,effectiveDate:date}),/first day/);
  for(const seq of [-1,0.5,'',NaN])assert.throws(()=>E.saveBankDetails(s,{...base,effectiveDate:c.start,effectiveSequence:seq}),/Sequence/);
  assert.throws(()=>E.saveBankDetails(s,{...base,effectiveDate:c.start,effectiveSequence:0}),/already exists/);
  for(const field of [{bsb:'12345'},{accountNumber:'12A34'},{accountName:''}])assert.throws(()=>E.saveBankDetails(s,{...base,...field,effectiveDate:c.start}),/six-digit/);
  assert.throws(()=>E.saveEmployeeSuper(s,{empId:e.id,effectiveDate:c.start,effectiveSequence:1,usi:'UNKNOWN',memberNumber:'1'}),/active super fund/);
  assert.throws(()=>E.saveEmployeeSuper(s,{empId:e.id,effectiveDate:c.start,effectiveSequence:1,usi:fund.usi,memberNumber:''}),/Member Number/);
  E.saveBankDetails(s,{...base,effectiveDate:E.cycleById(12).start});
  s.currentCycleId=12;assert.throws(()=>E.saveBankDetails(s,{...bank,accountName:'Changed'}),/read-only/);
  assert.strictEqual(E.activePaymentRecord(s,'bankDetails',e.id,c.start).id,bank.id);
});
test('stable super fund identity, unique USI, inactive/deleted assignment errors and no silent remapping',()=>{
  const {s,e,c}=fixture();const {fund}=accounts(s,e);
  assert.throws(()=>E.saveSuperFund(s,{fundName:'Duplicate',usi:fund.usi,abn:fund.abn}),/already belongs/);
  assert.throws(()=>E.saveSuperFund(s,{fundName:'Bad ABN',usi:'BAD',abn:'123'}),/eleven-digit/);
  const edited=E.saveSuperFund(s,{...fund,fundName:'Renamed Super',usi:'RENAMED01'});
  assert.strictEqual(E.superAccountForCycle(s,e.id,c).fundName,'Renamed Super');
  assert.strictEqual(E.superAccountForCycle(s,e.id,c).usi,'RENAMED01');
  assert.strictEqual(E.paymentDetailErrors(s,c).length,0);
  E.saveSuperFund(s,{...edited,active:false});assert(E.paymentDetailErrors(s,c).some(x=>x.includes('Inactive')));
  assert.throws(()=>E.saveEmployeeSuper(s,{empId:e.id,effectiveDate:c.start,effectiveSequence:1,usi:edited.usi,memberNumber:'1'}),/active super fund/);
  E.deleteSuperFund(s,fund.id);assert(E.paymentDetailErrors(s,c).some(x=>x.includes('Deleted')));
  const replacement=E.saveSuperFund(s,{fundName:'New distinct fund',usi:edited.usi,abn:edited.abn});
  assert.notStrictEqual(replacement.id,fund.id);assert.strictEqual(E.superAccountForCycle(s,e.id,c).fundStatus,'Deleted');
  assert.throws(()=>E.saveSuperFund(s,{...edited,active:true}),/no longer exists/);
});
test('one effective super account; future changes and latest same-day sequence',()=>{
  const {s,e,c}=fixture();const {fund}=accounts(s,e);
  const second=E.saveSuperFund(s,{fundName:'Second Super',usi:'SECOND01',abn:'10987654321'});
  E.saveEmployeeSuper(s,{empId:e.id,effectiveDate:c.start,effectiveSequence:1,usi:second.usi,memberNumber:'000222'});
  E.saveEmployeeSuper(s,{empId:e.id,effectiveDate:E.cycleById(12).start,effectiveSequence:0,usi:fund.usi,memberNumber:'000333'});
  assert.strictEqual(E.superAccountForCycle(s,e.id,c).memberNumber,'000222');
  assert.strictEqual(E.superAccountForCycle(s,e.id,E.cycleById(12)).memberNumber,'000333');
  assert.strictEqual(s.superDetails.length,3);
});
test('missing/incomplete accounts flagged for employees in cycle and paid terminated employees',()=>{
  const {s,e,c}=fixture();assert.strictEqual(E.paymentDetailErrors(s,c).length,2);
  s.employees.push({...e,id:'future',startDate:'2027-01-01',originalStartDate:'2027-01-01'});
  assert.strictEqual(E.paymentDetailErrors(s,c).length,2);
  e.startDate='2026-01-01';e.terminationDate='2026-09-01';e.status='Terminated';e.employmentSegments=[{startDate:'2026-01-01',endDate:'2026-09-01',inclusiveEnd:false}];
  assert.strictEqual(E.paymentDetailErrors(s,c).length,0);
  assert.strictEqual(E.paymentDetailErrors(s,c,[{empId:e.id}]).length,2);
  accounts(s,e);s.bankDetails[0].accountNumber='';s.superDetails[0].memberNumber='';
  assert.strictEqual(E.paymentDetailErrors(s,c,[{empId:e.id}]).length,2);
});
test('all contribution types use one frozen account; separate position disbursements equal their own net',()=>{
  const {s,e,c}=fixture();const {fund}=accounts(s,e);
  s.payRates.push({id:'move140',empId:e.id,effectiveDate:'2026-10-16',position:'Manager',hourlyRate:50,changeType:'Permanent'});
  for(const [id,type,amount] of [['pre','Pre-tax Super Deduction',50],['post','Post-Tax Super Deduction',25]])s.deductions.push({id,empId:e.id,startDate:c.start,endDate:'',deductionType:type,amount,percentage:'',saved:true});
  const preview=E.calculateAll(s,c.id);assert.strictEqual(preview.length,2);
  preview.forEach(p=>{assert(!Object.hasOwn(p,'disbursements'));assert.strictEqual(p.superContributions.account.memberNumber,'000123');});
  const result=E.finaliseCurrentPay(s);assert.strictEqual(result.payslips.length,2);
  result.payslips.forEach(p=>{assert.strictEqual(p.disbursements.length,1);assert.strictEqual(p.disbursements[0].amount,p.net);assert.strictEqual(p.disbursements[0].accountNumber,'00001234');assert.strictEqual(p.superAccountSnapshot.usi,fund.usi);});
  assert.strictEqual(total(result.payslips,'preTaxDeductionTotal'),50);assert.strictEqual(total(result.payslips,'postTaxDeductionTotal'),25);
  const saved=JSON.stringify(result.payslips);const report=JSON.stringify(E.superContributionReport(s,c.id));
  E.saveSuperFund(s,{...fund,fundName:'Changed later',usi:'CHANGED01',active:false});
  E.saveBankDetails(s,{empId:e.id,effectiveDate:E.currentCycle(s).start,effectiveSequence:0,bsb:'333444',accountNumber:'999',accountName:'Different'});
  E.calculateAll(s);assert.strictEqual(JSON.stringify(result.payslips),saved);assert.strictEqual(JSON.stringify(E.superContributionReport(s,c.id)),report);
  const restored=DataStore.migrate(JSON.parse(DataStore.exportJson(s)));assert.strictEqual(JSON.stringify(restored.payslips),saved);
});
test('Recovery Deduction post-tax only, preview idempotence, final cap, auto-stop and ledger exactly once',()=>{
  const {s,e,c}=fixture();accounts(s,e);const d=recovery(s,e);
  const without=JSON.parse(JSON.stringify(s));without.deductions=[];
  const baseline=E.calculateAll(without,c.id),first=E.calculateAll(s,c.id),second=E.calculateAll(s,c.id);
  assert.strictEqual(total(first,'gross'),total(baseline,'gross'));assert.strictEqual(total(first,'tax'),total(baseline,'tax'));assert.strictEqual(total(first,'superAmt'),total(baseline,'superAmt'));
  assert.strictEqual(total(first,'net'),total(baseline,'net')-100);assert.strictEqual(total(first,'net'),total(second,'net'));
  assert.strictEqual(E.recoveryBalance(s,d).remaining,150);assert.strictEqual(s.recoveryRepayments.length,0);
  const final=E.finaliseCurrentPay(s);assert.strictEqual(E.recoveryBalance(s,d).remaining,50);assert.strictEqual(s.recoveryRepayments.length,1);
  E.commitRecoveryRepayments(s,c,final.payslips);assert.strictEqual(s.recoveryRepayments.length,1);
  const next=E.calculateAll(s);assert.strictEqual(total(next,'postTaxDeductionTotal'),50);
  E.finaliseCurrentPay(s);assert.strictEqual(E.recoveryBalance(s,d).remaining,0);assert.strictEqual(s.recoveryRepayments.length,2);
  assert.strictEqual(total(E.calculateAll(s),'postTaxDeductionTotal'),0);
  assert.strictEqual(E.recoveryBalance(s,d,c.id).remaining,150);
});
test('recoveries capped to available net after other obligations, including multiple debts and zero/negative net',()=>{
  const {s,e,c}=fixture();const a=recovery(s,e,'a',10000,10000),b=recovery(s,e,'b',10000,10000);
  s.deductions.push({id:'union',empId:e.id,startDate:c.start,endDate:'',deductionType:'Union Fees',amount:100,percentage:'',saved:true});
  const pay=E.calculateAll(s);assert(total(pay,'net')>=0);assert.strictEqual(total(pay,'net'),0);
  assert(pay.flatMap(p=>p.postTaxDeductions).some(d=>d.id==='union'&&d.amount===100));
  assert.strictEqual(E.recoveryBalance(s,a).remaining,10000);assert.strictEqual(E.recoveryBalance(s,b).remaining,10000);
  s.deductions.find(d=>d.id==='union').amount=10000;const negative=E.calculateAll(s);
  assert(negative.every(p=>!p.postTaxDeductions.some(d=>d.description==='Recovery Deduction')));
  for(const field of [{openingDebt:0},{amount:0},{amount:-1},{openingDebt:NaN},{percentage:1}])assert.throws(()=>E.validateRecoveryDeduction({...a,...field}),/positive/);
});
test('split-position recovery allocation and finalisation repay the debt once per employee',()=>{
  const {s,e,c}=fixture();accounts(s,e);s.payRates.push({id:'split140',empId:e.id,effectiveDate:'2026-10-16',position:'Manager',hourlyRate:50,changeType:'Permanent'});
  const d=recovery(s,e,'split-rec',10000,10000);
  const pays=E.calculateAll(s);assert.strictEqual(pays.length,2);pays.forEach(p=>assert(p.net>=0));
  const amount=total(pays,'postTaxDeductionTotal');const final=E.finaliseCurrentPay(s);
  assert.strictEqual(s.recoveryRepayments.length,1);assert.strictEqual(s.recoveryRepayments[0].amount,amount);assert.strictEqual(E.recoveryBalance(s,d).remaining,E.round2(10000-amount));
  assert.strictEqual(total(final.payslips,'postTaxDeductionTotal'),amount);
});
test('Recovery Deduction future start, expiry and non-taxable earnings budget',()=>{
  const {s,e,c}=fixture();const d=recovery(s,e);d.startDate=E.cycleById(12).start;
  assert.strictEqual(total(E.calculateAll(s),'postTaxDeductionTotal'),0);
  d.startDate=E.cycleById(10).start;d.endDate=E.cycleById(10).end;
  assert.strictEqual(total(E.calculateAll(s),'postTaxDeductionTotal'),0);
  d.startDate=c.start;d.endDate='';d.amount=10000;d.openingDebt=10000;
  s.additionalEarnings.push({id:'reim140',empId:e.id,cycleId:c.id,earningType:'Reimbursement',startDate:c.start,endDate:c.start,amount:100,saved:true});
  const pay=E.calculateAll(s);assert(total(pay,'net')>=0);
});
test('pending leave strictly exceeds 72 hours, notifies once, resets between pending episodes',()=>{
  const {s,e}=fixture();const start='2026-10-01T00:00:00.000Z';
  const l={id:'leave140',empId:e.id,type:'Annual Leave',startDate:'2026-11-01',endDate:'2026-11-02',status:'Awaiting Manager Approval',pendingApprovalSince:start};s.leaveBookings.push(l);
  assert.strictEqual(E.ensurePendingLeaveNotifications(s,'2026-10-04T00:00:00.000Z'),0);
  assert.strictEqual(E.ensurePendingLeaveNotifications(s,'2026-10-04T00:00:00.001Z'),1);
  assert.strictEqual(E.ensurePendingLeaveNotifications(s,'2026-10-05T00:00:00.000Z'),0);
  assert.strictEqual(s.alerts.length,1);assert(s.alerts[0].message.includes('Test Worker'));assert.strictEqual(s.alerts[0].action.tab,'leave');
  s.alerts[0].read=true;assert.strictEqual(E.ensurePendingLeaveNotifications(s,'2026-10-06T00:00:00.000Z'),0);
  l.status='Approved';E.ensurePendingLeaveNotifications(s,'2026-10-06T00:00:00.000Z');assert.strictEqual(l.pendingApprovalSince,'');
  l.status='Awaiting Manager Approval';l.statusHistory=[{status:l.status,changedAt:'2026-10-06T00:00:00.000Z'}];
  assert.strictEqual(E.ensurePendingLeaveNotifications(s,'2026-10-09T00:00:00.001Z'),1);
});
test('legacy pending age starts now unless trustworthy status history exists; denied/approved leave excluded',()=>{
  const {s,e}=fixture();s.leaveBookings.push({id:'unknown',empId:e.id,status:'Awaiting Manager Approval',startDate:'2020-01-01',endDate:'2020-01-02'});
  DataStore.migrate(s);assert(Date.now()-Date.parse(s.leaveBookings[0].pendingApprovalSince)<1000);
  assert.strictEqual(E.ensurePendingLeaveNotifications(s),0);
  s.leaveBookings.push({id:'history',empId:e.id,status:'Awaiting Manager Approval',statusHistory:[{status:'Approved',changedAt:'2026-09-01T00:00:00Z'},{status:'Awaiting Manager Approval',changedAt:'2026-10-01T00:00:00Z'},{status:'Awaiting Manager Approval',changedAt:'2026-10-02T00:00:00Z'}]});
  DataStore.migrate(s);assert.strictEqual(s.leaveBookings[1].pendingApprovalSince,'2026-10-01T00:00:00Z');
  s.leaveBookings.push({id:'approved',status:'Approved',pendingApprovalSince:'2020-01-01'},{id:'denied',status:'Denied',pendingApprovalSince:'2020-01-01'});
  assert.strictEqual(E.ensurePendingLeaveNotifications(s,'2026-10-05T00:00:00Z'),1);
});
// Lightweight event/DOM harness: exercises actual rendering and handlers, not a live browser.
function appFixture(){
  const nodes=new Map(),decode=x=>String(x||'').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
  function element(id,attrs=''){
    const events={};let html='';const e={id,value:decode((attrs.match(/value="([^"]*)"/)||[])[1]),checked:/\bchecked\b/.test(attrs),disabled:/\bdisabled\b/.test(attrs),hidden:/\bhidden\b/.test(attrs),style:{},dataset:{},classList:{add(){},remove(){},toggle(){},contains(){return false;}},addEventListener:(k,f)=>(events[k]||(events[k]=[])).push(f),click(){this.fire('click');},fire(k){if(this.disabled&&k==='click')return;(events[k]||[]).forEach(fn=>fn({target:e}));},setAttribute(){},focus(){},remove(){},appendChild(){}};
    e.querySelectorAll=()=>[];
    Object.defineProperty(e,'innerHTML',{get:()=>html,set:value=>{html=value;parse(value);}});nodes.set(id,e);return e;
  }
  function parse(html){
    for(const m of html.matchAll(/<([\w-]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){
      const e=element(m[3],m[2]);
      if(m[1]==='select'){
        const rest=html.slice(m.index+m[0].length).split('</select>')[0];const opts=[...rest.matchAll(/<option([^>]*)>([\s\S]*?)<\/option>/g)];const selected=opts.find(x=>/\bselected\b/.test(x[1]))||opts[0];
        e.value=selected?decode((selected[1].match(/value="([^"]*)"/)||[])[1]??selected[2]):'';
      }
    }
  }
  parse(fs.readFileSync(path.join(root,'index.html'),'utf8'));
  const document={addEventListener(){},getElementById:id=>nodes.get(id)||null,querySelectorAll:()=>[],querySelector:()=>null,documentElement:{},body:{classList:{add(){},remove(){}}}};
  const window={addEventListener(){},scrollTo(){}};const errors=[],timers=[];
  const context={DataStore,SupportRequests:require('../support-requests'),PayrollEngine:E,document,window,sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},console,Intl,Date,setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},requestAnimationFrame:fn=>fn(),Blob:function(){},URL:{},alert:x=>errors.push(x),confirm:()=>true};
  vm.runInNewContext(fs.readFileSync(path.join(root,'app.js'),'utf8'),context,{filename:'app.js'});
  const app=window.PayrollApp,{s,e,c}=fixture();Object.assign(app.getState(),s);
  return {app,s:app.getState(),e,c,nodes,errors,flush:()=>{let n=0;while(timers.length){assert(n++<100,'Unexpected recurring timer');timers.shift()();}},set:(id,value)=>{assert(nodes.has(id),`Missing UI field ${id}`);nodes.get(id).value=value;},fire:(id,event='click')=>{assert(nodes.has(id),`Missing UI control ${id}`);nodes.get(id).fire(event);}};
}
test('real Bank Details controls: dropdown, plus, default date, validation, save and leading zeros',()=>{
  const {app,s,e,c,nodes,set,fire,errors}=appFixture();app.renderBankDetails();set('bankEmp',e.id);fire('bankEmp','change');fire('bankPlus');
  assert.strictEqual(nodes.get('bankEffectiveDate').value,c.start);assert.strictEqual(nodes.get('bankSequence').value,'0');
  const html=nodes.get('bankDetails').innerHTML;assert(!html.includes('minus'));assert(!html.includes('Delete'));assert(!html.includes('Remove'));
  set('bankBsb','001-002');set('bankAccountNumber','00001234');set('bankAccountName','Test Worker');fire('bankSave');
  assert.strictEqual(errors.length,0);assert.strictEqual(s.bankDetails.length,1);assert.strictEqual(s.bankDetails[0].accountNumber,'00001234');
  fire('bankPlus');assert.strictEqual(nodes.get('bankSequence').value,'1');
  set('bankBsb','123');set('bankAccountNumber','123');set('bankAccountName','X');fire('bankSave');assert.strictEqual(errors.length,1);assert.strictEqual(s.bankDetails.length,1);
});
test('real Settings Super controls: add, save, edit, dropdown label and readonly auto-population',()=>{
  const {app,s,e,c,nodes,set,fire,errors}=appFixture();app.renderSettings();fire('settingsSuper');fire('addSuperFund');
  set('catalogueFundName','Example Super');set('catalogueUsi','EXAMPLE01');set('catalogueAbn','12345678901');fire('saveSuperFund');
  assert.strictEqual(errors.length,0);assert.strictEqual(s.superFunds.length,1);assert(nodes.get('settingsOutput').innerHTML.includes('Example Super - EXAMPLE01'));
  set('catalogueFundName','Renamed');fire('saveSuperFund');assert.strictEqual(s.superFunds.length,1);assert.strictEqual(s.superFunds[0].fundName,'Renamed');
  app.renderSuperDetails();set('superEmp',e.id);fire('superEmp','change');fire('superPlus');
  assert.strictEqual(nodes.get('superEffectiveDate').value,c.start);set('superUsi','EXAMPLE01');fire('superUsi','input');
  assert.strictEqual(nodes.get('superFundName').value,'Renamed');assert.strictEqual(nodes.get('superAbn').value,'12345678901');
  set('superMemberNumber','000123');fire('superSave');assert.strictEqual(errors.length,0);assert.strictEqual(s.superDetails.length,1);
  assert(!nodes.get('superDetails').innerHTML.includes('Delete'));assert(!nodes.get('superDetails').innerHTML.includes('minus'));
});
test('real Recovery Deduction modal fields, fixed amount rules, staged saving and persisted payroll',()=>{
  const {app,s,e,c,nodes,set,fire,errors,flush}=appFixture();
  // renderAll establishes the selected deduction employee via its normal control.
  app.renderAll();set('dedEmp',e.id);fire('dedEmp','change');app.openDeductionModal();
  set('dedType','Recovery Deduction');fire('dedType','change');assert.strictEqual(nodes.get('dedPercentage').disabled,true);assert.strictEqual(nodes.get('dedDebtField').hidden,false);
  set('dedAmount','100');set('dedOpeningDebt','250');app.stageDeduction();assert.strictEqual(errors.length,0);
  assert(nodes.get('deductionsTable').innerHTML.includes('Recovery Deduction'));assert(nodes.get('deductionsTable').innerHTML.includes('Remaining'));
  assert.strictEqual(s.deductions.length,0,'Staging must not update payroll before Save');
  fire('saveDeductionsBtn');flush();assert.strictEqual(s.deductions.length,1);assert.strictEqual(s.deductions[0].openingDebt,250);
  assert.strictEqual(s.deductions[0].saved,true);assert.strictEqual(total(s.payResults[String(c.id)],'postTaxDeductionTotal'),100);
});
test('real fund deletion, inactive/missing errors and historical row UI locking',()=>{
  const {app,s,e,c,nodes,set,fire,errors}=appFixture();const {fund,bank}=accounts(s,e);
  app.renderSettings();fire('settingsSuper');set('superFundSelect',fund.id);fire('superFundSelect','change');
  nodes.get('catalogueActive').checked=false;fire('saveSuperFund');assert.strictEqual(errors.length,0);
  assert(app.checkForErrors().some(w=>w.includes('Inactive')));
  fire('deleteSuperFund');fire('confirmYes');assert.strictEqual(s.superFunds[0].deleted,true);
  assert(app.checkForErrors().some(w=>w.includes('Deleted')));
  app.renderBankDetails();set('bankEmp',e.id);fire('bankEmp','change');s.currentCycleId=12;app.renderBankDetails();
  assert.strictEqual(nodes.get('bankSave').disabled,true);assert.strictEqual(nodes.get('bankAccountNumber').disabled,true);
  fire('bankPlus');assert.strictEqual(nodes.get('bankSave').disabled,false);assert.strictEqual(nodes.get('bankEffectiveDate').value,E.cycleById(12).start);
});
test('real leave status changes restart pending timing only on a new episode',()=>{
  const {app,s,e}=appFixture();s.leaveBookings.push({id:'uiLeave',empId:e.id,type:'Annual Leave',startDate:'2026-11-02',endDate:'2026-11-03',hours:15,status:'Approved'});
  assert.strictEqual(app.setLeaveStatus('uiLeave','Awaiting Manager Approval'),true);
  const l=s.leaveBookings[0],stamp=l.pendingApprovalSince;assert(Number.isFinite(Date.parse(stamp)));
  assert.strictEqual(app.setLeaveStatus('uiLeave','Awaiting Manager Approval'),true);assert.strictEqual(l.pendingApprovalSince,stamp);
  app.setLeaveStatus('uiLeave','Denied');assert.strictEqual(l.pendingApprovalSince,'');
  app.setLeaveStatus('uiLeave','Awaiting Manager Approval');assert(Number.isFinite(Date.parse(l.pendingApprovalSince)));assert.strictEqual(l.pendingApprovalNotifiedSince,'');
});
test('actual payslip HTML hides disbursements until finalised and places them below entitlement date',()=>{
  const {app,s,e,c}=appFixture();accounts(s,e);const preview=E.calculateAll(s,c.id)[0];
  assert(!app.payslipHtml(preview).includes('Disbursement Details'));
  const p=E.finaliseCurrentPay(s).payslips[0],html=app.payslipHtml(p);
  assert(html.indexOf('Disbursement Details')>html.indexOf('LSL Entitlement Date'));
  assert(html.includes('Account Nbr'));assert(html.includes('00001234'));assert(html.includes('001002'));
  const old={...p};delete old.disbursements;delete old.bankAccountSnapshot;delete old.superAccountSnapshot;delete old.superContributions;
  assert(!app.payslipHtml(old).includes('Disbursement Details'));
  const fields=E.paymentPayslipFields(s,e,c,-10,0,[],[],true);assert.deepStrictEqual(fields.disbursements,[]);
});
test('browser script order/version metadata and migration retain all account/ledger fields',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');assert(html.indexOf('payment-details.js')<html.indexOf('payroll-engine.js'));
  assert.strictEqual(require('../latest-version.json').version,DataStore.APP_VERSION);
  const {s,e}=fixture();accounts(s,e);const d=recovery(s,e);E.finaliseCurrentPay(s);
  const copy=DataStore.importJson(DataStore.exportJson(s));
  for(const key of ['superFunds','superDetails','bankDetails','recoveryRepayments'])assert.deepStrictEqual(copy[key],s[key]);
  assert.strictEqual(E.recoveryBalance(copy,d).remaining,E.recoveryBalance(s,d).remaining);
});
test('payslip omits Super Account and labels employer contributions with the frozen fund name',()=>{
  const {app,s,e,c}=appFixture();const {fund}=accounts(s,e);
  const open=E.calculateAll(s,c.id)[0];const before=JSON.stringify(open);
  const html=app.payslipHtml(open);
  assert(html.includes('Employer Super Contribution - Example Super'));
  assert(!html.includes('Super Account'));assert(!html.includes('Member Number'));assert(!html.includes('EXAMPLE01'));assert(!html.includes('12345678901'));
  assert.strictEqual(JSON.stringify(open),before,'Display changes must not change payroll data');
  const final=E.finaliseCurrentPay(s).payslips[0];E.saveSuperFund(s,{...fund,fundName:'Renamed Later'});
  assert(app.payslipHtml(final).includes('Employer Super Contribution - Example Super'));
  assert(!app.payslipHtml(final).includes('Renamed Later'));
  const retro={...final,superRetro:25};assert(app.payslipHtml(retro).includes('Employer Super Contribution Retro - Example Super'));
  const zero={...final,superCurrent:0,superAmt:0,superRetro:0};assert(app.payslipHtml(zero).includes('Employer Super Contribution - Example Super'));
  const legacy={...final};delete legacy.superAccountSnapshot;
  const legacyHtml=app.payslipHtml(legacy);assert(legacyHtml.includes('Employer Super Contribution</td>'));assert(!legacyHtml.includes('Renamed Later'));assert(!legacyHtml.includes(' - undefined'));
  const escaped={...final,superAccountSnapshot:{...final.superAccountSnapshot,fundName:'A & <Super>'}};
  assert(app.payslipHtml(escaped).includes('Employer Super Contribution - A &amp; &lt;Super&gt;'));
});
function casualPayFixture(){
  const {s,e,c}=fixture();e.type='Casual';e.position='Admin Assistant';e.hourlyRate=0;s.schedules[0].hoursByDay={0:0,1:0,2:0,3:0,4:0,5:0,6:0};s.payRates[0].hourlyRate=0;
  s.positions.push({positionNumber:'ADMIN',positionName:'Admin Assistant',hourlyRate:32,active:true},{positionNumber:'CREW',positionName:'Crew Member',hourlyRate:40,active:true});
  function earning(id,date,number,hours){const pos=s.positions.find(p=>p.positionNumber===number);s.additionalEarnings.push({id,empId:e.id,cycleId:c.id,earningType:'Casual Earnings',positionNumber:number,positionName:pos.positionName,casualBaseRate:pos.hourlyRate,casualLoadedRate:pos.hourlyRate*1.25,startDate:date,endDate:date,hours,saved:true});}
  return {s,e,c,earning};
}
test('casual-only combined payslip retains position lines, retro settlement, single recovery/account and final net',()=>{
  const {app}=appFixture(),{s,e,c,earning}=casualPayFixture();accounts(s,e);
  earning('admin-current','2026-10-12','ADMIN',4);earning('crew-current','2026-10-13','CREW',5);earning('admin-retro','2026-10-01','ADMIN',8);
  const debt=recovery(s,e,'combined-recovery',150,100);
  const pays=E.calculateAll(s,c.id);assert.strictEqual(pays.length,1);const p=pays[0];
  assert.strictEqual(p.position,'Casual');assert.strictEqual(p.positionNumber,'');assert.strictEqual(p.casualOnly,true);assert.strictEqual(p.gross,730);
  assert.strictEqual(p.annualAccrual,0);assert.strictEqual(p.personalAccrual,0);assert.strictEqual(p.postTaxDeductionTotal,100);
  assert(p.rows.some(r=>r.description==='Casual Earnings - Admin Assistant'));assert(p.rows.some(r=>r.description==='Casual Earnings - Crew Member'));assert(p.rows.some(r=>r.description==='Casual Earnings - Admin Assistant Retro'));
  assert.deepStrictEqual(p.rows.map(r=>r.startDate),p.rows.map(r=>r.startDate).slice().sort());
  assert.strictEqual(p.tax,E.calculateTaxComponents(s,e,p.rows,c,0).totalTax);
  assert(app.payslipHtml(p).includes('<strong>Position:</strong> Casual'));assert(!app.payslipHtml(p).includes('<strong>Position:</strong> Admin Assistant'));
  const result=E.finaliseCurrentPay(s);assert.strictEqual(result.payslips.length,1);assert.strictEqual(result.payslips[0].disbursements[0].amount,p.net);
  assert.strictEqual(s.recoveryRepayments.length,1);assert.strictEqual(E.recoveryBalance(s,debt).remaining,50);
  assert.strictEqual(E.calculateAll(s).length,0,'Finalised current and retro casual work must not repeat');
});
test('casual-to-permanent and permanent-to-casual periods keep mixed-employment position grouping',()=>{
  for(const direction of ['toPermanent','toCasual']){
    const {s,e,c,earning}=casualPayFixture();
    const first=direction==='toPermanent'?'Casual':'Permanent',last=direction==='toPermanent'?'Permanent':'Casual';
    s.jobDataRows.push({id:'first',empId:e.id,effectiveDate:c.start,effectiveSequence:0,action:'Commencement',reason:`New Hire ${first}`,positionClass:first,positionName:'Officer',positionNumber:'OFF',hourlyRate:40,saved:true},{id:'change',empId:e.id,effectiveDate:'2026-10-16',effectiveSequence:0,action:'Movement',reason:'Employment Change',positionClass:last,positionName:'Officer',positionNumber:'OFF',hourlyRate:40,saved:true});
    const date=direction==='toPermanent'?'2026-10-12':'2026-10-19';earning('mixed-admin',date,'ADMIN',4);earning('mixed-crew',date,'CREW',4);
    const pays=E.calculateAll(s);assert.strictEqual(pays.length,2);assert(pays.every(p=>p.casualOnly===false));
    assert.deepStrictEqual(pays.map(p=>p.position).sort(),['Admin Assistant','Crew Member']);
  }
});
test('draft reimbursement increases net only and excludes PAYG/STSL taxable bases',()=>{
  const {app}=appFixture(),{s,e,c}=fixture();s.taxDetails[0].claimTaxFreeThreshold=true;s.taxDetails[0].stsl=true;
  const baseline=E.calculateAll(s)[0];
  s.additionalEarnings.push({id:'nontax-reimb',empId:e.id,cycleId:c.id,earningType:'Reimbursement',startDate:c.start,endDate:c.start,amount:125.50,saved:true});
  const p=E.calculateAll(s)[0],row=p.rows.find(r=>r.description==='Reimbursement');
  assert.strictEqual(row.nonTaxable,true);assert.strictEqual(p.tax,baseline.tax);assert.strictEqual(p.marginalTax,baseline.marginalTax);assert.strictEqual(p.stsl,baseline.stsl);
  assert.strictEqual(p.taxableCurrentGross,baseline.taxableCurrentGross);assert.strictEqual(p.net,E.round2(baseline.net+125.50));assert.strictEqual(p.superAmt,baseline.superAmt);
  assert(app.payslipHtml(p).includes('Reimbursement (Non-Taxable)'));
});
test('draft reimbursement-only and retro reimbursement adjustments have zero tax',()=>{
  const {app}=appFixture(),{s,e,c}=casualPayFixture();s.taxDetails=[];
  const a={id:'reimb-only',empId:e.id,cycleId:c.id,earningType:'Reimbursement',startDate:c.start,endDate:c.start,amount:100,saved:true};s.additionalEarnings.push(a);
  const p=E.calculateAll(s)[0];assert.strictEqual(p.gross,100);assert.strictEqual(p.net,100);assert.strictEqual(p.tax,0);assert.strictEqual(p.superAmt,0);
  E.finaliseCurrentPay(s);a.amount=150;const retro=E.calculateAll(s)[0];
  assert.strictEqual(retro.gross,50);assert.strictEqual(retro.tax,0);assert.strictEqual(retro.net,50);
  assert(retro.rows.some(r=>r.description==='Reimbursement Retro'&&r.nonTaxable===true));
  assert(app.payslipHtml(retro).includes('Reimbursement (Non-Taxable) Retro'));
  assert.strictEqual(app.payslipDisplayDescription({description:'Reimbursement Retro',kind:'retro',startDate:'2026-06-01'},'2026-07-16'),'Reimbursement (Non-Taxable) Retro PFY');
});
console.log(`PASS: ${checks} feature tests completed. UI tests use an event/DOM harness; live-browser QA is not claimed.`);
