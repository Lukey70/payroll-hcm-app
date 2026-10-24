'use strict';
process.env.TZ='Australia/Perth';
const assert=require('assert'),fs=require('fs'),path=require('path'),D=require('../data-store'),E=require('../payroll-engine'),S=E.selfService,T=require('../support-requests').create(E,S),{fixture,uiFixture,DATE}=require('./self-service-v121.test');
let count=0;const input={subject:'Support query',description:'Please check'},file={name:'document.txt',size:3,data:'data:text/plain;base64,YWJj'};
async function test(name,fn){await fn();count++;console.log('PASS: '+name);}
function reader(f){f.context.FileReader=class{readAsDataURL(file){this.result=file.data;this.onload();}};}
async function run(){
await test('Payroll on-behalf submission requires both selections and records real creator separately',()=>{
 const s=fixture();for(const values of [{},{raisedBy:'worker'},{raisedFor:'worker'}])assert.throws(()=>T.submit(s,'payroll',{...input,...values},'payroll',DATE),/Select|Choose/);
 assert.throws(()=>T.submit(s,'worker',{...input,raisedBy:'outsider',raisedFor:'worker'},'payroll',DATE),/Payroll/);
 const c=T.submit(s,'payroll',{...input,raisedBy:'worker',raisedFor:'outsider',attachments:[file]},'payroll',DATE);assert.equal(c.raisedBy,'worker');assert.equal(c.raisedFor,'outsider');assert.equal(c.createdBy,'payroll');assert.deepStrictEqual(c.attachments,[file]);
 assert(S.alertsFor(s,'worker',DATE).some(a=>a.message.includes('submitted to Payroll')));assert(!S.alertsFor(s,'payroll',DATE).some(a=>a.message.includes('submitted to Payroll')));
 assert.equal(T.list(s,'worker','own',{},DATE)[0],c);assert.equal(T.list(s,'outsider','own',{},DATE).length,0);
});
await test('submission documents validated before sequence/case/receipt mutation and included in backup',()=>{
 const s=fixture();assert.throws(()=>T.submit(s,'worker',{...input,attachments:[{...file,size:4}]},'ess',DATE),/size/);assert.equal(s.supportRequests.length,0);assert.equal(s.supportSequence,0);assert.equal(s.alerts.length,0);
 const c=T.submit(s,'worker',{...input,attachments:[file]},'ess',DATE);assert.deepStrictEqual(D.importJson(D.exportJson(s)).supportRequests[0].attachments,[file]);
 const big={name:'large.bin',size:1024*1024,data:'data:application/octet-stream;base64,'+Buffer.alloc(1024*1024).toString('base64')};
 T.message(s,'worker',c.id,'File',[big],'own',DATE);assert.throws(()=>T.message(s,'worker',c.id,'Another',[big],'own',DATE),/2 MB/);assert.equal(c.messages.length,1);
});
await test('reopen requires owner/reason, retains assignment/history, logs message and clears closure countdown',()=>{
 const s=fixture(),c=T.submit(s,'worker',input,'ess',DATE);T.assign(s,'payroll',c.id,'payroll',DATE);T.status(s,'payroll',c.id,'Resolved','First resolution',DATE);
 assert.throws(()=>T.reopen(s,'outsider',c.id,'Still broken',DATE),/access/);assert.throws(()=>T.reopen(s,'worker',c.id,' ',DATE),/explaining/);assert.equal(c.status,'Resolved');
 T.reopen(s,'worker',c.id,'The problem continues',DATE);assert.equal(c.status,'Open');assert.equal(c.assignedTo,'payroll');assert.equal(c.resolvedAt,'');assert.equal(c.messages.at(-1).text,'The problem continues');assert.equal(c.messages.at(-1).kind,'Reopened');assert.equal(c.resolutions[0].notes,'First resolution');assert(c.history.some(h=>h.action==='Reopened'));
 assert.equal(T.closeDue(s,Date.now()+30*86400000),0);assert(S.alertsFor(s,'payroll',DATE).some(a=>a.key==='support-message:'+c.messages.at(-1).id));
 T.status(s,'payroll',c.id,'Resolved','Second resolution',DATE);assert.equal(c.resolutions.length,2);assert.equal(c.resolutionNotes,'Second resolution');
});
await test('closed and stale resolved cases cannot reopen; unassigned reopened case sends no message alert',()=>{
 const s=fixture(),c=T.submit(s,'worker',input,'ess',DATE);T.status(s,'payroll',c.id,'Resolved','Done',DATE);T.reopen(s,'worker',c.id,'Recheck',DATE);assert(!S.alertsFor(s,'payroll',DATE).some(a=>a.key?.startsWith('support-message:')));
 T.status(s,'payroll',c.id,'Resolved','Done again',DATE);c.resolvedAt=new Date(Date.now()-14*86400000-1).toISOString();assert.throws(()=>T.reopen(s,'worker',c.id,'Late reply',DATE),/Closed/);assert.equal(c.status,'Closed');assert.equal(c.messages.length,1);
 assert.throws(()=>T.reopen(s,'worker',c.id,'Again',DATE),/Closed/);
});
await test('messages notify only assignee for employee replies, raiser for Payroll replies, none if unassigned',()=>{
 const s=fixture(),c=T.submit(s,'worker',input,'ess',DATE);s.alerts=[];T.message(s,'worker',c.id,'Unassigned',[],'own',DATE);assert.equal(s.alerts.length,0);
 T.assign(s,'payroll',c.id,'payroll',DATE);const reply=T.message(s,'worker',c.id,'Assigned',[],'own',DATE);assert.deepStrictEqual(s.alerts.find(a=>a.key==='support-message:'+reply.id).recipientIds,['payroll']);
 const response=T.message(s,'payroll',c.id,'Employee reply',[],'payroll',DATE);assert.deepStrictEqual(s.alerts.find(a=>a.key==='support-message:'+response.id).recipientIds,['worker']);assert(!S.alertsFor(s,'otherManager',DATE).length);
});
await test('all eligible payroll officers open every case regardless of assignee; ESS remains own-only',()=>{
 const s=fixture();s.positions.find(p=>p.positionNumber==='MGR2').accessPayrollManagement=true;const c=T.submit(s,'worker',input,'ess',DATE);T.assign(s,'payroll',c.id,'payroll',DATE);
 assert.equal(T.get(s,'otherManager',c.id,'payroll',DATE),c);assert.throws(()=>T.get(s,'otherManager',c.id,'own',DATE),/access/);assert.throws(()=>T.get(s,'manager',c.id,'payroll',DATE),/Payroll/);
});
await test('UI submission attaches documents; Payroll on-behalf dropdowns start blank and retain failed form',async()=>{
 const f=uiFixture();reader(f);f.login('payroll');f.app.mountSupport('support',{mode:'payroll'});assert(f.html('support').includes('Raise Support Request'));await f.click('supportNew');assert.equal(f.nodes.get('supportRaisedBy').value,'');assert.equal(f.nodes.get('supportRaisedFor').value,'');
 f.set('supportSubject','On behalf');f.set('supportDescription','Review documents');await f.click('supportSubmit');assert.equal(f.s.supportRequests.length,0);assert(f.nodes.has('supportSubmit'));
 f.set('supportRaisedBy','worker');f.set('supportRaisedFor','outsider');f.nodes.get('supportNewFiles').files=[file];await f.click('supportSubmit');assert.equal(f.s.supportRequests[0].attachments.length,1);assert(f.html('support').includes('Submitted Documents'));assert(f.html('support').includes('document.txt'));
});
await test('submission attachment read failure/storage failure creates neither request nor receipt',async()=>{
 const f=uiFixture();reader(f);f.login('worker');f.app.openSelfService('ess');await f.choose('data-ss-tile','support');await f.click('supportNew');f.set('supportSubject','Test');f.set('supportDescription','Test');f.nodes.get('supportNewFiles').files=[file];
 f.context.FileReader=class{readAsDataURL(){this.onerror();}};await f.click('supportSubmit');assert.equal(f.s.supportRequests.length,0);assert(!f.nodes.get('supportSubmit').disabled);
 reader(f);f.context.DataStore.save=()=>false;await f.click('supportSubmit');assert.equal(f.s.supportRequests.length,0);assert.equal(f.s.supportSequence,0);assert(!f.s.alerts.some(a=>a.type==='Support Request'));
});
await test('delayed document read cancels submission after leaving the form',async()=>{
 const f=uiFixture();let complete;f.context.FileReader=class{readAsDataURL(){complete=()=>{this.result=file.data;this.onload();};}};f.login('worker');f.app.openSelfService('ess');await f.choose('data-ss-tile','support');await f.click('supportNew');f.set('supportSubject','Delayed');f.set('supportDescription','Delayed');f.nodes.get('supportNewFiles').files=[file];const pending=f.click('supportSubmit');await f.click('supportBack');complete();await pending;assert.equal(f.s.supportRequests.length,0);assert(f.errors.some(e=>e.includes('page changed')));
});
await test('reopen dialog requires message, shows prior notes and newest-first conversation',async()=>{
 const f=uiFixture(),c=T.submit(f.s,'worker',input,'ess',DATE);T.assign(f.s,'payroll',c.id,'payroll',DATE);T.message(f.s,'payroll',c.id,'Older reply',[],'payroll',DATE);T.status(f.s,'payroll',c.id,'Resolved','Original notes',DATE);
 f.login('worker');f.app.openSupportCase(c.id);await f.click('supportReopen');await f.click('supportConfirmReopen');assert.equal(c.status,'Resolved');assert(f.errors.some(e=>e.includes('explaining')));
 f.set('supportReopenReason','Most recent reason');await f.click('supportConfirmReopen');const current=f.s.supportRequests[0];assert.equal(current.status,'Open');const html=f.html('ssSupport');assert(html.indexOf('Most recent reason')<html.indexOf('Older reply'));assert(html.includes('Original notes'));assert(html.includes('Previous Resolution Notes'));assert(!f.nodes.has('supportReopen'));
});
await test('switching ESS to Payroll restores Payroll case access and clicking bell opens correct portal',async()=>{
 const f=uiFixture();f.s.positions.find(p=>p.positionNumber==='PAY').accessManagerSelfService=true;const c=T.submit(f.s,'worker',input,'ess',DATE);T.assign(f.s,'payroll',c.id,'payroll',DATE);
 f.login('payroll');f.app.mountSupport('support',{mode:'payroll'});f.app.openSelfService('ess');await f.choose('data-ss-tile','support');assert(!f.html('ssSupport').includes(c.subject));f.app.openPayrollManagement();f.app.showTab('support');await f.choose('data-support-case',c.id);assert(f.html('support').includes(c.subject));assert(f.nodes.has('supportAssigned'));
 f.app.openSelfService('ess');const m=T.message(f.s,'worker',c.id,'Notification reply',[],'own',DATE);f.app.selfServiceUI().refreshNotifications();const a=f.s.alerts.find(a=>a.key==='support-message:'+m.id);await f.choose('data-alert-go',a.id);assert(!f.nodes.get('appShell').hidden);assert(f.nodes.get('selfServiceScreen').hidden);assert(f.html('support').includes('Notification reply'));assert(!f.errors.some(e=>e.includes('access')));
});
await test('centred home has fixed Payroll/ESS/MSS slots and hides inaccessible tiles without shifting',()=>{
 const f=uiFixture();f.login('worker');const html=f.html('landingTiles');assert(!html.includes('data-landing-area="payroll"'));assert(html.includes('landing-slot-payroll"></div>'));assert(html.includes('landing-slot-mss"></div>'));assert(html.includes('landing-slot-ess'));
 f.s.positions.find(p=>p.positionNumber==='PAY').accessManagerSelfService=true;f.login('payroll');const all=f.html('landingTiles');assert(all.indexOf('Payroll Management')<all.indexOf('Employee Self-Service'));assert(all.indexOf('Employee Self-Service')<all.indexOf('Manager Self Service'));
 const css=fs.readFileSync(path.join(__dirname,'../styles.css'),'utf8');assert(css.includes('.landing-tiles{width:min(100%,856px);grid-template-columns:repeat(3'));assert(css.includes('.landing-slot-ess{grid-column:2}'));
});
await test('certification autofills logged-in name/current acting position; manager check is disabled in Payroll',()=>{
 const f=uiFixture();f.s.payResults['11']=E.calculateAll(f.s,11);f.login('payroll');f.app.renderCertification();assert.equal(f.nodes.get('certName').value,'payroll Test');assert.equal(f.nodes.get('certPosition').value,'Payroll');assert(f.nodes.get('certName').readOnly);assert(f.html('certOutput').includes('manager-cert-readonly'));
 f.s.positions.push({positionNumber:'ACTM',positionName:'Acting Manager',accessManagerSelfService:true,active:true});f.s.jobDataRows.push({id:'actmanager',empId:'manager',effectiveDate:'2026-10-01',action:'Movement',reason:'Acting Higher Level',positionNumber:'ACTM',positionName:'Acting Manager',saved:true});f.s.jobDataRows.find(j=>j.empId==='worker').reportsTo='ACTM';f.login('manager');f.app.selfServiceUI().show('mss','certification');
 assert.equal(f.nodes.get('certName').value,'manager Test');assert.equal(f.nodes.get('certPosition').value,'Acting Manager');
});
await test('completed certification signatory remains frozen when another payroll user opens report',()=>{
 const f=uiFixture();f.s.payResults['11']=E.calculateAll(f.s,11);f.login('payroll');const lines=Object.fromEntries(f.s.payResults['11'].map(p=>[p.id,{certified:true,payHash:f.app.paySignature(p)}]));f.s.certifications['11']={lines,completed:true,locked:true,name:'Previous Signer',position:'Previous Role',declaration:true};f.app.renderCertification();assert.equal(f.nodes.get('certName').value,'Previous Signer');assert.equal(f.nodes.get('certPosition').value,'Previous Role');f.s.positions.find(p=>p.positionNumber==='MGR2').accessPayrollManagement=true;f.login('otherManager');f.app.renderCertification();assert.equal(f.nodes.get('certName').value,'Previous Signer');assert.equal(f.nodes.get('certPosition').value,'Previous Role');
});
await test('active casual with no position/roster or start-date segment can log in and open own ESS',()=>{
 const f=uiFixture(),e=f.s.employees.find(e=>e.id==='worker');e.type='Casual';e.startDate='';e.originalStartDate='';e.employmentSegments=[];f.s.jobDataRows=f.s.jobDataRows.filter(r=>r.empId!==e.id);f.s.schedules=f.s.schedules.filter(r=>r.empId!==e.id);f.s.payRates=f.s.payRates.filter(r=>r.empId!==e.id);e.position='';
 assert(!E.isEmployedOn(e,DATE));assert(S.isActiveEmployee(f.s,e,DATE));assert(f.app.loginEligibleEmployees().some(x=>x.id===e.id));f.login(e.id);f.app.openSelfService('ess');assert(!f.nodes.get('selfServiceScreen').hidden);assert(f.html('ssBody').includes('Payslips'));assert(!f.errors.some(x=>x.includes('active employee')));assert.deepStrictEqual(S.profile(f.s,e.id,DATE),{payroll:false,mss:false});
});
await test('casual eligibility blocks terminated/future starters, respects historical employment and does not change payroll',()=>{
 const s=fixture(),e=s.employees.find(e=>e.id==='worker');e.type='Casual';e.startDate='';e.originalStartDate='';e.employmentSegments=[];s.jobDataRows=s.jobDataRows.filter(j=>j.empId!==e.id);e.status='Terminated';assert(!S.isActiveEmployee(s,e,DATE));assert.throws(()=>S.assertScope(s,e.id,e.id,'ess',DATE),/active/);
 e.status='Active';e.terminationDate='2026-10-01';assert(!S.isActiveEmployee(s,e,DATE));e.terminationDate='';e.startDate='2026-11-01';assert(!S.isActiveEmployee(s,e,DATE));e.startDate='';e.employmentSegments=[{startDate:'2026-01-01',endDate:'2026-09-01'}];assert(!S.isActiveEmployee(s,e,DATE));
 e.employmentSegments=[];const before=JSON.stringify(e);assert(S.isActiveEmployee(s,e,DATE));assert.equal(JSON.stringify(e),before);
});
await test('notification popup appears only once for new recipient alert, lasts 10 seconds then fades/removes',()=>{
 const f=uiFixture();f.login('worker');const holder=f.nodes.get('notificationPopups');const old={id:'old',recipientIds:['worker'],readBy:[],message:'Old unread'};f.s.alerts.push(old);f.app.resetNotificationPopups();f.app.presentNotificationPopups(S.alertsFor(f.s,'worker',DATE));assert.equal(holder.children.length,0);
 const a={id:'fresh',recipientIds:['worker'],readBy:[],message:'Fresh notification'};f.s.alerts.push(a);f.app.presentNotificationPopups(S.alertsFor(f.s,'worker',DATE));assert.equal(holder.children.length,1);assert.equal(holder.children[0].textContent,a.message);f.app.presentNotificationPopups(S.alertsFor(f.s,'worker',DATE));assert.equal(holder.children.length,1);
 const popup=holder.children[0],timer=f.timeouts.find(t=>t.ms===10000);assert(timer);timer.fn();assert(popup.classList.contains('fading-out'));f.timeouts.find(t=>t.ms===400).fn();assert.equal(holder.children.length,0);assert(S.alertsFor(f.s,'worker',DATE).some(x=>x.id==='fresh'));
 f.s.alerts.push({id:'foreign',recipientIds:['payroll'],readBy:[],message:'Foreign'});f.app.presentNotificationPopups(S.alertsFor(f.s,'worker',DATE));assert.equal(holder.children.length,0);
});
await test('notification popup clears on logout/user change and ESS refresh does not reset form input',()=>{
 const f=uiFixture();f.login('worker');f.app.openSelfService('ess');f.app.selfServiceUI().show('ess','leave');f.set('ssLeaveStart','2026-10-12');f.s.alerts.push({id:'new-ess',recipientIds:['worker'],readBy:[],message:'ESS arrival'});f.app.selfServiceUI().refreshNotifications();assert.equal(f.nodes.get('ssLeaveStart').value,'2026-10-12');assert.equal(f.nodes.get('notificationPopups').children.length,1);
 f.login('manager');assert.equal(f.nodes.get('notificationPopups').children.length,0);
});
console.log(`PASS: ${count} v1.2.4 update test groups.`);
}
run().catch(e=>{console.error(e);process.exitCode=1;});
