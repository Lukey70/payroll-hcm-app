'use strict';
const assert=require('assert'),D=require('../data-store'),E=require('../payroll-engine'),S=E.selfService,O=E.operations,T=require('../support-requests').create(E,S),{fixture}=require('./self-service-v121.test');
const day='2026-10-24',clone=x=>JSON.parse(JSON.stringify(x));let checks=0;
function test(name,fn){fn();checks++;console.log('PASS: '+name);}
const input=(extra={})=>({managerId:'manager',delegateId:'otherManager',startDate:day,endDate:'2026-10-30',reason:'Annual leave coverage',...extra});
const leave=(s,date='2026-10-19')=>S.submitLeave(s,'worker',{type:'Annual Leave',startDate:date,endDate:date},'ess',day);
function debt(s,id='debt',opening=150,amount=100){const d={id,empId:'worker',startDate:E.currentCycle(s).start,endDate:'',deductionType:'Recovery Deduction',openingDebt:opening,amount,saved:true};s.deductions.push(d);return d;}
test('search covers case numbers, subjects, descriptions and messages with access filters applied first',()=>{
 const s=fixture(),c=T.submit(s,'worker',{subject:'Travel claim',description:'Receipt for train journey'},'ess',day),hidden=T.submit(s,'outsider',{subject:'Private receipt',description:'Confidential train journey'},'ess',day);
 T.message(s,'worker',c.id,'Uncommon reimbursement wording',[],'own',day);
 for(const q of [c.number.toLowerCase(),'TRAVEL','train journey','  reimbursement wording  '])assert(T.list(s,'worker','own',{search:q},day).some(x=>x.id===c.id));
 assert(!T.list(s,'worker','own',{search:'Confidential'},day).length);assert(T.list(s,'payroll','payroll',{search:'Confidential'},day).some(x=>x.id===hidden.id));
 assert(!T.list(s,'payroll','payroll',{search:'wording',mine:true},day).length);T.assign(s,'payroll',c.id,'payroll',day);assert.equal(T.list(s,'payroll','payroll',{search:'wording',mine:true},day).length,1);
 c.status='Resolved';c.resolvedAt=new Date().toISOString();assert(!T.list(s,'worker','own',{search:'wording'},day).length);assert.equal(T.list(s,'worker','own',{search:'wording',resolved:true},day).length,1);
});
test('delegation grants pending approval authority without direct-report, financial or booking access',()=>{
 const s=fixture(),l=leave(s);S.saveDelegation(s,'payroll',input(),day);
 assert.deepEqual(S.managerFor(s,'worker',day).managerIds,['manager']);assert.deepEqual(S.approvalManagerFor(s,'worker',day).managerIds,['manager','otherManager']);
 assert.equal(S.requests(s,'otherManager','approvals',day)[0].id,l.id);assert(!S.requests(s,'otherManager','mss',day).some(x=>x.id===l.id));
 assert.deepEqual(S.directReports(s,'otherManager',day).map(e=>e.id),['outsider']);
 assert.throws(()=>S.assertScope(s,'otherManager','worker','mss',day),/access/);assert.throws(()=>S.submitLeave(s,'otherManager',{empId:'worker',type:'LWOP',startDate:'2026-10-20',endDate:'2026-10-20'},'mss',day),/access/);
 assert(S.alertsFor(s,'otherManager',day).some(a=>a.key==='leave-submit:'+l.id));
 S.decide(s,'otherManager',l.id,'Approved','Covering manager approved',day);assert.equal(l.decidedBy,'otherManager');assert(!S.requests(s,'otherManager','approvals',day).length);assert.throws(()=>S.decide(s,'manager',l.id,'Approved','',day),/Only pending/);
});
test('delegation dates are inclusive; future, expired and revoked authority fails closed',()=>{
 const s=fixture(),l=leave(s),r=S.saveDelegation(s,'payroll',input({startDate:'2026-10-25',endDate:'2026-10-26'}),day);
 assert(!S.requests(s,'otherManager','approvals',day).length);assert.equal(S.requests(s,'otherManager','approvals','2026-10-25').length,1);assert.equal(S.requests(s,'otherManager','approvals','2026-10-26').length,1);assert(!S.requests(s,'otherManager','approvals','2026-10-27').length);
 S.syncNotifications(s,'2026-10-25');assert(S.alertsFor(s,'otherManager','2026-10-25').some(a=>a.key==='leave-submit:'+l.id));S.syncNotifications(s,'2026-10-27');assert(!S.alertsFor(s,'otherManager','2026-10-27').some(a=>a.key==='leave-submit:'+l.id));
 S.revokeDelegation(s,'payroll',r.id,day);assert.throws(()=>S.decide(s,'otherManager',l.id,'Approved','','2026-10-25'),/access/);assert(s.auditLog.some(x=>x.includes('Ended manager delegation')));
});
test('delegation validation rejects unauthorized, self, bad dates, overlap and circular assignments',()=>{
 const s=fixture();for(const id of ['worker','manager'])assert.throws(()=>S.saveDelegation(s,id,input(),day),/Payroll Management/);
 for(const extra of [{delegateId:'manager'},{delegateId:'worker'},{startDate:'2026-02-30'},{startDate:'2026-10-23'},{endDate:'2026-10-23'},{reason:' '},{reason:'x'.repeat(2001)}])assert.throws(()=>S.saveDelegation(s,'payroll',input(extra),day));
 const r=S.saveDelegation(s,'payroll',input(),day);assert.throws(()=>S.saveDelegation(s,'payroll',input(),day),/already has/);assert.throws(()=>S.saveDelegation(s,'payroll',input({managerId:'otherManager',delegateId:'manager'}),day),/circular/);assert.throws(()=>S.revokeDelegation(s,'manager',r.id,day),/Payroll Management/);
 assert.equal(s.managerDelegations.length,1);
 const mid=fixture(),base=mid.jobDataRows.find(j=>j.empId==='otherManager');mid.jobDataRows.push({...base,id:'non-manager',action:'Movement',effectiveDate:'2026-10-25',positionNumber:'STAFF'},{...base,id:'manager-return',action:'Movement',effectiveDate:'2026-10-27'});
 assert.throws(()=>S.saveDelegation(mid,'payroll',input(),day),/throughout/);
});
test('delegation does not chain, allow self-approval or survive manager access loss / reporting movement',()=>{
 const s=fixture();s.positions.find(p=>p.positionNumber==='PAY').accessManagerSelfService=true;
 S.saveDelegation(s,'payroll',input(),day);S.saveDelegation(s,'payroll',input({managerId:'otherManager',delegateId:'payroll'}),day);
 assert(!S.approvalManagerFor(s,'worker',day).managerIds.includes('payroll'));
 s.jobDataRows.find(j=>j.empId==='otherManager').reportsTo='MGR';assert(!S.approvalManagerFor(s,'otherManager',day).managerIds.includes('otherManager'));
 s.positions.find(p=>p.positionNumber==='MGR2').accessManagerSelfService=false;assert(!S.approvalManagerFor(s,'worker',day).managerIds.includes('otherManager'));
 s.positions.find(p=>p.positionNumber==='MGR2').accessManagerSelfService=true;s.jobDataRows.push({...s.jobDataRows.find(j=>j.empId==='worker'),id:'acting',effectiveDate:day,effectiveSequence:1,action:'Movement',reason:'Acting Higher Level',reportsTo:'PAY',endDate:'2026-10-30'});
 assert(!S.requests(s,'otherManager','approvals',day).length);assert.deepEqual(S.approvalManagerFor(s,'worker',day).managerIds,['payroll']);
});
test('delegates can view pending evidence and approve timesheets without changing pay',()=>{
 const s=fixture(),l=leave(s);l.attachments=[{name:'evidence.txt',size:1,data:'data:text/plain;base64,QQ=='}];S.saveDelegation(s,'payroll',input(),day);
 assert.equal(O.leaveFiles(s,'otherManager',l.id,'approvals',day).length,1);assert.throws(()=>O.leaveFiles(s,'otherManager',l.id,'mss',day),/access/);
 const before=JSON.stringify(E.calculateAll(s)),t=O.saveTimesheet(s,'worker',{cycleId:11,days:[{date:'2026-10-13',blocks:[{start:'08:00',finish:'16:00'}]}]},true,day);
 assert(t.approverIds.includes('otherManager'));assert(O.timesheets(s,'otherManager','mss',day,true).some(x=>x.id===t.id));assert(!O.timesheets(s,'otherManager','mss',day).some(x=>x.id===t.id));
 O.approveTimesheet(s,'otherManager',t.id,'Approved','',day);assert.equal(t.decidedBy,'otherManager');assert.equal(JSON.stringify(E.calculateAll(s)),before);
 S.decide(s,'manager',l.id,'Approved','',day);assert.throws(()=>O.leaveFiles(s,'otherManager',l.id,'approvals',day),/no longer/);
});
test('existing pending timesheet notification routing updates when coverage starts and ends',()=>{
 const s=fixture(),t=O.saveTimesheet(s,'worker',{cycleId:11,days:[{date:'2026-10-13',blocks:[{start:'08:00',finish:'16:00'}]}]},true,day);
 S.saveDelegation(s,'payroll',input({startDate:'2026-10-25',endDate:'2026-10-26'}),day);S.syncNotifications(s,'2026-10-25');assert(t.approverIds.includes('otherManager'));assert(S.alertsFor(s,'otherManager','2026-10-25').some(a=>a.action?.timesheetId===t.id));
 S.syncNotifications(s,'2026-10-27');assert(!t.approverIds.includes('otherManager'));assert.throws(()=>O.approveTimesheet(s,'otherManager',t.id,'Approved','','2026-10-27'),/access/);
});
test('negative net warning includes shortfall, deductions and recovery detail, including terminated staff',()=>{
 const s=fixture(),c=E.currentCycle(s);s.employees.find(e=>e.id==='worker').status='Terminated';const rows=O.negativeNetErrors(s,[{empId:'worker',cycle:c,net:-250,preTaxDeductionTotal:100,postTaxDeductionTotal:300,rows:[{description:'Personal Leave Overuse Recovery',amount:-50}]},{empId:'outsider',cycle:c,net:0},{empId:'payroll',cycle:c,net:-0.001}]);assert.equal(rows.length,1);assert(rows[0].message.includes('Shortfall: $250.00'));assert(rows[0].message.includes('earnings recoveries: $50.00'));assert.equal(rows[0].empId,'worker');
});
test('recovery completion fires only after final repayment, to Payroll, once and with correct statement link',()=>{
 const s=fixture(),d=debt(s);E.calculateAll(s);assert(!s.alerts.some(a=>a.type==='Recovery Complete'));E.finaliseCurrentPay(s);assert.equal(E.recoveryBalance(s,d).remaining,50);assert(!s.alerts.some(a=>a.type==='Recovery Complete'));
 const result=E.finaliseCurrentPay(s),alerts=s.alerts.filter(a=>a.type==='Recovery Complete');assert.equal(alerts.length,1);assert.equal(E.recoveryBalance(s,d).remaining,0);assert.deepEqual(alerts[0].recipientIds,['payroll']);assert.equal(alerts[0].action.report,'recovery');assert.equal(alerts[0].action.empId,'worker');assert(alerts[0].message.includes('$150.00 repaid'));assert(!S.alertsFor(s,'worker',day).some(a=>a.type==='Recovery Complete'));
 E.commitRecoveryRepayments(s,result.finalisedCycle,result.payslips);E.calculateAll(s);E.finaliseCurrentPay(s);assert.equal(s.alerts.filter(a=>a.type==='Recovery Complete').length,1);
 const restored=D.migrate(JSON.parse(D.exportJson(s)));assert.equal(restored.alerts.filter(a=>a.type==='Recovery Complete').length,1);assert.equal(E.recoveryBalance(restored,d).remaining,0);
});
test('separate recoveries and multiple position payslips settle once per debt',()=>{
 const s=fixture();debt(s,'one',25,100);debt(s,'two',30,100);s.positions.push({positionNumber:'SECOND',positionName:'Second position',active:true,hourlyRate:50});s.jobDataRows.push({...s.jobDataRows.find(j=>j.empId==='worker'),id:'movejob',effectiveDate:'2026-10-16',action:'Movement',reason:'Promotion',positionNumber:'SECOND',positionName:'Second position',hourlyRate:50});s.payRates.push({id:'move',jobDataId:'movejob',empId:'worker',effectiveDate:'2026-10-16',position:'Second position',hourlyRate:50,changeType:'Permanent'});const r=E.finaliseCurrentPay(s);assert(r.payslips.filter(p=>p.empId==='worker').length>=2);assert.equal(s.alerts.filter(a=>a.type==='Recovery Complete').length,2);assert.equal(s.recoveryRepayments.length,2);
});
test('delegation persistence and legacy migration preserve history without adding pay holds',()=>{
 const s=fixture();S.saveDelegation(s,'payroll',input(),day);const restored=D.migrate(JSON.parse(D.exportJson(s)));assert.deepEqual(restored.managerDelegations,s.managerDelegations);assert.equal(S.requests(restored,'otherManager','approvals',day).length,0);delete restored.managerDelegations;assert.deepEqual(D.migrate(restored).managerDelegations,[]);assert(!Object.hasOwn(restored,'payHolds'));
});
console.log('PASS: '+checks+' support search, delegated approval, negative net and recovery notification groups.');
