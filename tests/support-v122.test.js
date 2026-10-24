'use strict';
process.env.TZ='Australia/Perth';
const assert=require('assert'),fs=require('fs'),path=require('path'),D=require('../data-store'),E=require('../payroll-engine'),S=E.selfService,Support=require('../support-requests');
const {fixture,uiFixture,DATE}=require('./self-service-v121.test'),T=Support.create(E,S);
function supportUI(f,o){require('vm').runInNewContext(fs.readFileSync(path.join(__dirname,'../support-requests.js'),'utf8'),f.context);return f.context.window.SupportRequests.createUI(o);}
let count=0;async function test(name,fn){await fn();count++;console.log('PASS: '+name);}
const input={subject:'Pay query',description:'Please check my earnings.'};
const textFile={name:'evidence.txt',size:3,data:'data:text/plain;base64,YWJj'};
async function run(){
await test('unique immutable case numbering and own-only ESS raised-for with submission receipt',()=>{
 const s=fixture(),a=T.submit(s,'worker',{...input,raisedFor:'outsider'},'ess',DATE),b=T.submit(s,'outsider',input,'ess',DATE);
 assert.equal(a.raisedBy,'worker');assert.equal(a.raisedFor,'worker');assert.equal(a.status,'New');assert.equal(a.assignedTo,'');assert.notEqual(a.number,b.number);assert.equal(a.number,'CS0000001');
 assert(S.alertsFor(s,'worker',DATE).some(n=>n.message===a.number+' has been submitted to Payroll.'));assert.equal(T.list(s,'worker','own',{},DATE).length,1);
 assert.throws(()=>T.get(s,'outsider',a.id,'own',DATE),/access/);assert.throws(()=>T.get(s,'manager',a.id,'payroll',DATE),/Payroll Management/);
 assert.equal(T.get(s,'payroll',a.id,'payroll',DATE),a);assert.equal(T.list(s,'payroll','payroll',{},DATE).length,2);
});
await test('MSS raised-for includes non-direct reports and New Employee; rejects invalid IDs and missing access',()=>{
 const s=fixture(),a=T.submit(s,'manager',{...input,raisedFor:'outsider'},'mss',DATE),b=T.submit(s,'manager',{...input,raisedFor:'new-employee'},'mss',DATE);
 assert.equal(a.raisedFor,'outsider');assert.equal(b.raisedFor,'new-employee');assert.equal(T.name(s,b.raisedFor),'New Employee');assert.equal(T.name(s,'worker'),'worker Test (worker)');
 assert.throws(()=>T.submit(s,'worker',input,'mss',DATE),/access/);assert.throws(()=>T.submit(s,'manager',{...input,raisedFor:'bad'},'mss',DATE),/Choose/);
 for(const invalid of [{subject:'',description:'test'},{subject:'Hi',description:' '},{subject:'x'.repeat(251),description:'test'}])assert.throws(()=>T.submit(s,'worker',invalid,'ess',DATE),/required|250/);
});
await test('assignment list enforces current payroll access; assign/unassign correctly drives New and Open',()=>{
 const s=fixture(),c=T.submit(s,'worker',input,'ess',DATE);
 assert.throws(()=>T.assign(s,'worker',c.id,'payroll',DATE),/Payroll/);assert.throws(()=>T.assign(s,'payroll',c.id,'manager',DATE),/Payroll/);
 T.assign(s,'payroll',c.id,'payroll',DATE);assert.equal(c.status,'Open');assert.equal(T.list(s,'payroll','payroll',{mine:true},DATE).length,1);
 T.assign(s,'payroll',c.id,'',DATE);assert.equal(c.status,'New');assert.equal(T.list(s,'payroll','payroll',{mine:true},DATE).length,0);
 s.positions.find(p=>p.positionNumber==='PAY').accessPayrollManagement=false;assert.throws(()=>T.assign(s,'payroll',c.id,'payroll',DATE),/access/);
});
await test('two-way messages, attachment bytes and independent employee/payroll notifications',()=>{
 const s=fixture(),c=T.submit(s,'worker',input,'ess',DATE);T.assign(s,'payroll',c.id,'payroll',DATE);
 const a=T.message(s,'payroll',c.id,'Please attach evidence',[textFile],'payroll',DATE),b=T.message(s,'worker',c.id,'Attached',[textFile],'own',DATE);
 assert.equal(a.side,'left');assert.equal(b.side,'right');assert(a.createdAt&&a.senderName.includes('(payroll)'));assert.equal(b.attachments[0].data,textFile.data);
 assert(S.alertsFor(s,'worker',DATE).some(a=>a.message==='A message has been sent regarding '+c.number+'.'));assert(S.alertsFor(s,'payroll',DATE).some(a=>a.key==='support-message:'+b.id));
 assert.throws(()=>T.message(s,'outsider',c.id,'Attack',[],'own',DATE),/access/);
 const notification=s.alerts.find(n=>n.key==='support-message:'+a.id);S.readAlert(s,'worker',notification.id,DATE);assert(!S.alertsFor(s,'worker',DATE).includes(notification));
});
await test('unassigned employee reply has no notification; empty/malformed/oversize attachments rejected without messages',()=>{
 const s=fixture(),c=T.submit(s,'worker',input,'ess',DATE);T.message(s,'worker',c.id,'Question',[],'own',DATE);assert(!S.alertsFor(s,'payroll',DATE).some(a=>a.message.includes(c.number)));
 const n=c.messages.length;assert.throws(()=>T.message(s,'worker',c.id,'',[],'own',DATE),/message/);
 for(const files of [[{...textFile,size:4}],[{...textFile,data:'javascript:alert(1)'}],[{...textFile,size:1048577}],Array(6).fill(textFile)])assert.throws(()=>T.message(s,'worker',c.id,'Attachment',files,'own',DATE),/Attachment|attachment|five|Invalid/);
 assert.equal(c.messages.length,n);
});
await test('Awaiting Info, required resolution notes, exact resolution notification and 14-day auto closure',()=>{
 const s=fixture(),c=T.submit(s,'worker',input,'ess',DATE);assert.throws(()=>T.status(s,'payroll',c.id,'Awaiting Info','',DATE),/Assign/);
 T.assign(s,'payroll',c.id,'payroll',DATE);T.status(s,'payroll',c.id,'Awaiting Info','',DATE);assert.equal(c.status,'Awaiting Info');
 assert.throws(()=>T.status(s,'payroll',c.id,'Resolved',' ',DATE),/Notes/);T.status(s,'payroll',c.id,'Resolved','Earnings corrected.',DATE);
 assert.equal(c.resolutionNotes,'Earnings corrected.');assert.equal(T.list(s,'payroll','payroll',{},DATE).length,0);assert.equal(T.list(s,'payroll','payroll',{resolved:true},DATE).length,1);
 assert(S.alertsFor(s,'worker',DATE).some(a=>a.message===c.number+' has been marked as resolved. Please see support requests for resolution notes.'));
 assert.throws(()=>T.message(s,'worker',c.id,'After resolution',[],'own',DATE),/resolved/);assert.throws(()=>T.assign(s,'payroll',c.id,'payroll',DATE),/resolved/i);
 const time=Date.parse(c.resolvedAt);assert.equal(T.closeDue(s,time+14*86400000-1),0);assert.equal(T.closeDue(s,time+14*86400000),1);assert.equal(c.status,'Closed');assert.equal(T.closeDue(s,time+15*86400000),0);
 assert.equal(T.list(s,'payroll','payroll',{closed:true},DATE).length,1);
});
await test('work timer accumulates and stops on resolution; export/import preserves cases, attachments and sequence',()=>{
 const s=fixture(),c=T.submit(s,'worker',input,'ess',DATE);T.assign(s,'payroll',c.id,'payroll',DATE);T.timer(s,'payroll',c.id,DATE);
 c.timerStartedAt=new Date(Date.now()-125000).toISOString();assert(T.timeWorked(c)>=125);T.timer(s,'payroll',c.id,DATE);assert(c.timeWorkedSeconds>=125);assert.equal(c.timerStartedAt,'');
 T.message(s,'worker',c.id,'Evidence',[textFile],'own',DATE);T.status(s,'payroll',c.id,'Resolved','Done',DATE);const restored=D.importJson(D.exportJson(s));
 assert.deepStrictEqual(restored.supportRequests,s.supportRequests);assert.equal(restored.supportSequence,1);assert.equal(T.nextNumber(restored),'CS0000002');
 const old=D.emptyState();delete old.supportRequests;delete old.supportSequence;D.migrate(old);assert.deepStrictEqual(old.supportRequests,[]);
});
await test('actual support UI submits ESS case, scopes list, shows conversation and payroll-only assignment controls',async()=>{
 const f=uiFixture();let actor='worker',mode='own';const ui=supportUI(f,{E,S,getState:()=>f.s,getUser:()=>actor,esc:x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),onChange:()=>{}});
 ui.mount('ssMain',{mode,area:'ess'}); // ssMain is created by the self-service page.
 f.ui.show('ess','payslips');ui.mount('ssMain',{mode,area:'ess'});assert(f.html('ssMain').includes('New Support Request'));await f.click('supportNew');
 assert(!f.nodes.has('supportRaisedFor'));f.set('supportSubject','<script>query</script>');f.set('supportDescription','Check this');await f.click('supportSubmit');assert.equal(f.s.supportRequests.length,1);
 assert(f.html('ssMain').includes('&lt;script>query&lt;/script>'));assert(!f.nodes.has('supportAssigned'));
 f.set('supportMessage','Employee reply');f.nodes.get('supportFiles').files=[];await f.click('supportSend');assert.equal(f.s.supportRequests[0].messages[0].side,'right');
 actor='payroll';ui.mount('ssMain',{mode:'payroll'});assert(f.html('ssMain').includes('<th>Raised by</th>'));await f.choose('data-support-case',f.s.supportRequests[0].id);assert(f.nodes.has('supportAssigned'));assert(!f.html('ssMain').includes('value="manager"'));
 await f.click('supportAssignMe');assert.equal(f.s.supportRequests[0].assignedTo,'payroll');await f.click('supportAwait');assert.equal(f.s.supportRequests[0].status,'Awaiting Info');
 await f.click('supportResolve');assert(f.nodes.get('supportResolveDialog').open);f.set('supportNotes','Resolved in test');await f.click('supportConfirmResolve');assert.equal(f.s.supportRequests[0].status,'Resolved');assert(f.html('ssMain').includes('Resolved in test'));
});
await test('support UI storage failure rolls back case, messages, sequence and notification together',async()=>{
 const f=uiFixture();f.ui.show('ess','payslips');const ui=supportUI(f,{E,S,getState:()=>f.s,getUser:()=> 'worker',esc:x=>String(x??''),onChange(){throw Error('Storage full');}});ui.mount('ssMain',{mode:'own',area:'ess'});
 await f.click('supportNew');f.set('supportSubject','Test');f.set('supportDescription','Test');await f.click('supportSubmit');assert.equal(f.s.supportRequests.length,0);assert.equal(f.s.supportSequence,0);assert.equal(f.s.alerts.length,0);assert(f.errors.includes('Storage full'));
});
await test('MSS form offers all employees and New Employee; list tabs, counts, search and pagination work',async()=>{
 const f=uiFixture();f.ui.show('ess','payslips');const ui=supportUI(f,{E,S,getState:()=>f.s,getUser:()=> 'manager',esc:x=>String(x??''),onChange(){}});ui.mount('ssMain',{mode:'own',area:'mss'});
 await f.click('supportNew');assert(f.html('ssMain').includes('value="outsider"'));assert(f.html('ssMain').includes('New Employee'));f.set('supportRaisedFor','outsider');f.set('supportSubject','Outside team');f.set('supportDescription','Help');await f.click('supportSubmit');assert.equal(f.s.supportRequests[0].raisedFor,'outsider');
 await f.click('supportBack');for(let i=0;i<11;i++)T.submit(f.s,'manager',{...input,subject:'Extra '+i},'mss',DATE);ui.render();assert(f.html('ssMain').includes('Page 1 of 2'));await f.click('supportNext');assert(f.html('ssMain').includes('Page 2 of 2'));
 f.set('supportSearch','Outside team');await f.click('supportSearchApply');assert(f.html('ssMain').includes('1 requests'));await f.click('supportClosed');assert(f.html('ssMain').includes('No support requests found'));
});
await test('actual manager certification scopes direct reports, shares checks across managers and leaves Payroll review unticked',()=>{
 const f=uiFixture();f.s.jobDataRows.find(j=>j.empId==='worker').reportsTo=['MGR','MGR2'];f.s.payResults['11']=E.calculateAll(f.s,11);f.login('manager');
 f.ui.show('mss','reports');f.app.mountSelfServiceCertification('ssMain','manager');let html=f.html('certOutput');assert(html.includes('worker Test'));assert(!html.includes('outsider Test'));
 const pay=f.s.payResults['11'].find(p=>p.empId==='worker');f.app.certManagerToggle(11,pay.id,true);const rec=f.s.certifications['11'];assert(rec.managerLines[pay.id].certified);assert(!rec.lines[pay.id]?.certified);
 f.login('otherManager');f.app.mountSelfServiceCertification('ssMain','otherManager');assert(f.html('certOutput').includes('checked'));assert.throws(()=>f.app.certManagerToggle(11,f.s.payResults['11'].find(p=>p.empId==='payroll').id,true),/unavailable/);
 f.login('payroll');f.app.unmountSelfServiceCertification();f.app.renderCertification();html=f.html('certOutput');assert(html.includes('Manager Certified'));assert(html.includes('outsider Test'));assert(html.includes('class="manager-cert-readonly"'));assert(html.includes('aria-label="Manager certified" checked disabled'));assert(!rec.lines[pay.id]?.certified);
});
await test('manager certification becomes stale after pay changes and storage failure rolls back ticks',()=>{
 const f=uiFixture();f.s.payResults['11']=E.calculateAll(f.s,11);f.login('manager');f.ui.show('mss','reports');f.app.mountSelfServiceCertification('ssMain','manager');let pay=f.s.payResults['11'].find(p=>p.empId==='worker');f.app.certManagerToggle(11,pay.id,true);
 f.s.additionalEarnings.push({id:'bonus',empId:'worker',cycleId:11,earningType:'Bonus',startDate:E.cycleById(11).start,endDate:E.cycleById(11).start,amount:25,saved:true});f.app.calculateAllForCurrent();assert(!f.s.certifications['11'].managerLines[pay.id].certified);
 f.context.DataStore.save=()=>false;assert.throws(()=>f.app.certManagerToggle(11,pay.id,true),/save/);assert(!f.s.certifications['11'].managerLines[pay.id].certified);
});
await test('MSS direct report payslips use ESS controls and reject printing after manager reassignment',async()=>{
 const f=uiFixture();f.s.payResults['11']=E.calculateAll(f.s,11);f.setUser('manager');f.ui.show('mss','reports');await f.click('ssReportSlips');assert(f.nodes.has('ssPayRecent'));assert(f.nodes.get('ssPrint').disabled);assert(f.html('ssReportPays').includes('Open'));
 f.s.jobDataRows.find(j=>j.empId==='worker').reportsTo='MGR2';f.nodes.get('ssPrint').disabled=false;await f.click('ssPrint');assert(f.errors.some(e=>e.includes('access')));
});
await test('statement omits Position Refresh; Audit moved to Settings; consistent tile rows and larger Home icon',async()=>{
 const f=uiFixture();f.s.jobDataRows.push({...f.s.jobDataRows.find(j=>j.empId==='worker'),id:'refresh',effectiveDate:'2026-09-01',action:'Data Change',reason:'Position Refresh'});const html=f.app.statementOfServiceHtml('worker',DATE);assert(!html.includes('Position Refresh'));assert(html.includes('New Hire Permanent'));
 f.app.renderSettings();assert(f.nodes.has('settingsAudit'));await f.click('settingsAudit');assert(f.html('settingsOutput').includes('Audit Log'));
 const index=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');assert(!index.includes('data-tab="audit"'));assert(index.includes('data-tab="support"'));
 f.setUser('manager');f.ui.show('mss');const body=f.html('ssBody');assert(body.indexOf('Certification Report')>body.indexOf('Employee Details'));assert.equal((body.match(/landing-tile-icon/g)||[]).length,7);const head=f.html('selfServiceScreen');assert(head.indexOf('id="ssNotifications"')>head.indexOf('id="ssHome"'));assert(head.includes('<svg'));
});
await test('app wiring opens ESS support tile, submission bell links, MSS certification and direct-report payslips',async()=>{
 const f=uiFixture();f.login('worker');f.app.openSelfService('ess');await f.choose('data-ss-tile','support');assert(f.html('ssSupport').includes('My Support Requests'));
 await f.click('supportNew');f.set('supportSubject','Integrated request');f.set('supportDescription','Check integration');await f.click('supportSubmit');assert.equal(f.s.supportRequests.length,1);
 assert(f.html('ssNotifications').includes('has been submitted to Payroll'));await f.choose('data-ss-alert',f.s.alerts.find(a=>a.type==='Support Request').id);assert(f.html('ssSupport').includes('Integrated request'));
 f.login('manager');f.s.payResults['11']=E.calculateAll(f.s,11);f.app.openSelfService('mss');await f.choose('data-ss-tile','certification');assert(f.html('certOutput').includes('worker Test'));assert(!f.html('certOutput').includes('outsider Test'));
 f.app.openSelfService('mss');await f.choose('data-ss-tile','reports');await f.click('ssReportSlips');assert(f.nodes.has('ssPrint'));assert(f.nodes.get('ssPrint').disabled);
 assert.deepStrictEqual(f.errors,[]);
});
console.log(`PASS: ${count} v1.2.4 support/certification/UI test groups.`);
}
run().catch(e=>{console.error(e);process.exitCode=1;});
