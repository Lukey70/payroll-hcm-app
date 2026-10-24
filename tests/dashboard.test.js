'use strict';
const assert=require('assert'),E=require('../payroll-engine'),F=require('../payroll-features').create(E),{fixture,uiFixture}=require('./self-service-v121.test');
const TODAY='2026-10-24';let count=0;function test(name,fn){fn();count++;console.log('PASS: '+name);}
const job=(id,date,action,reason,extra={})=>({id,empId:'worker',effectiveDate:date,action,reason,saved:true,...extra});
test('upcoming changes include today and day 30, exclude past/out-of-range, drafts and orphan records, and sort by date',()=>{
 const s=fixture();s.jobDataRows.push(job('return','2026-11-23','Movement','Return from Temp Assignment'),job('today',TODAY,'Commencement','Rehire Permanent'),job('past','2026-10-23','Termination','Voluntary Resignation'),job('outside','2026-11-24','Termination','Voluntary Resignation'),job('draft','2026-10-28','Commencement','New Hire Permanent',{saved:false}),job('orphan','2026-10-28','Commencement','New Hire Permanent',{empId:'missing'}));
 const rows=F.upcomingEmployeeChanges(s,TODAY);assert.deepStrictEqual(rows.map(r=>r.rowId),['today','return']);assert.equal(rows[1].type,'Return from temporary assignment');
});
test('Job Data effective sequences produce one event and unprocessed support templates do not become employee changes',()=>{
 const s=fixture();s.jobDataRows.push(job('first','2026-10-28','Termination','Dismissal',{effectiveSequence:0}),job('latest','2026-10-28','Termination','Redundant',{effectiveSequence:1}));s.supportRequests.push({requestType:'Commencement',template:{effectiveDate:'2026-10-30'},status:'New'});
 const before=JSON.stringify(s),rows=F.upcomingEmployeeChanges(s,TODAY);assert.equal(rows.length,1);assert.equal(rows[0].rowId,'latest');assert(rows[0].detail.includes('Redundant'));assert(rows[0].detail.includes('27/10/26'));assert.equal(JSON.stringify(s),before);
});
test('contract expiry uses the last contract day, avoids duplication and ignores obsolete expiry following permanency',()=>{
 const s=fixture(),e=s.employees.find(e=>e.id==='worker');e.type='Fixed Term';e.contractEndDate='2026-10-30';s.jobDataRows.find(j=>j.empId==='worker').positionClass='Fixed-Term';s.jobDataRows.push(job('expiry','2026-10-31','Termination','Expiry of Fixed Term'));
 let rows=F.upcomingEmployeeChanges(s,TODAY);assert.equal(rows.length,1);assert.equal(rows[0].type,'Contract expiry');assert.equal(rows[0].date,'2026-10-30');
 s.jobDataRows.push(job('permanent','2026-10-28','Variation','Permanency Confirmed',{positionClass:'Permanent'}));assert.equal(F.upcomingEmployeeChanges(s,TODAY).length,0);
});
test('legacy future starts, terminations and inclusive fixed-term expiries appear without Job Data rows',()=>{
 const s=fixture();s.employees.push({id:'new',firstName:'New',lastName:'Person',startDate:'2026-10-25'},{id:'fixed',firstName:'Fixed',lastName:'Person',type:'Fixed Term',startDate:'2026-01-01',contractEndDate:'2026-11-01'},{id:'exit',firstName:'Exit',lastName:'Person',startDate:'2026-01-01',terminationDate:'2026-11-02',terminationReason:'Ill Health'});
 const rows=F.upcomingEmployeeChanges(s,TODAY);assert.deepStrictEqual(rows.map(r=>[r.empId,r.type,r.date]),[['new','Commencement','2026-10-25'],['fixed','Contract expiry','2026-11-01'],['exit','Termination','2026-11-02']]);
});
function cases(f){f.s.supportRequests.push(...[['new','New',''],['mine','Open','payroll'],['wait','Awaiting Info','payroll'],['other','Open','manager'],['done','Resolved','payroll'],['closed','Closed','']].map(([id,status,assignedTo])=>({id,number:id,subject:id,raisedBy:'worker',raisedFor:'worker',status,assignedTo,createdAt:'2026-10-24T08:00:00Z',updatedAt:'2026-10-24T08:00:00Z',messages:[],history:[]})));}
test('dashboard counts and links select exact unassigned, assigned-to-me and Awaiting Info lists',()=>{
 const f=uiFixture();cases(f);f.login('payroll');f.app.openPayrollManagement();let html=f.html('dashboardSupport');assert(html.includes('Unassigned'));assert(html.includes('<strong>1</strong>'));assert(html.includes('<strong>2</strong>'));
 for(const [filter,visible,hidden]of [['unassigned',['new'],['mine','wait','other','done','closed']],['mine',['mine','wait'],['new','other','done','closed']],['awaiting',['wait'],['new','mine','other','done','closed']]]){
  f.app.showTab('dashboard');f.choose('data-dashboard-support',filter);html=f.html('support');for(const id of visible)assert(html.includes('data-support-case="'+id+'"'));for(const id of hidden)assert(!html.includes('data-support-case="'+id+'"'));
 }
 assert.deepStrictEqual(f.errors,[]);
});
test('upcoming employee links open the correct Job Data row and dashboard updates when returning',()=>{
 const f=uiFixture();cases(f);f.s.jobDataRows.push(job('future-return','2026-11-01','Movement','Return from Temp Assignment',{positionNumber:'STAFF',positionName:'Officer',positionClass:'Permanent',hoursByDay:{1:7.5}}));f.login('payroll');f.app.openPayrollManagement();assert(f.html('dashboardChanges').includes('Return from temporary assignment'));f.choose('data-dashboard-change','0');assert(f.html('jobData').includes('worker Test'));assert.equal(f.nodes.get('jdEffectiveDate').value,'2026-11-01');
 f.app.showTab('dashboard');f.s.supportRequests.find(c=>c.id==='wait').status='Open';f.app.showTab('dashboard');assert(f.html('dashboardSupport').includes('<strong>0</strong>'));assert.deepStrictEqual(f.errors,[]);
});
console.log('PASS: '+count+' dashboard feature groups.');
