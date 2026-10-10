(function(global){
  'use strict';
  function create(E){
    const uid=p=>`${p}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const today=()=>E.iso(new Date());
    const employee=(s,id)=>s.employees.find(e=>e.id===id);
    const active=(e,date)=>!!e&&E.isEmployedOn(e,date);
    const job=(s,id,date)=>s.jobDataRows.filter(r=>r.empId===id&&r.saved!==false&&r.action!=='Termination'&&r.effectiveDate<=date&&(!r.endDate||r.endDate>=date)).slice().sort((a,b)=>b.effectiveDate.localeCompare(a.effectiveDate)||Number(b.effectiveSequence||0)-Number(a.effectiveSequence||0))[0];
    function profile(s,id,date=today()){
      const e=employee(s,id),j=job(s,id,date),number=j?.positionNumber;
      const p=s.positions.find(p=>p.active!==false&&(number?String(p.positionNumber)===String(number):p.positionName===(E.activePayRate(s,id,date).position||e?.position)));
      return {payroll:active(e,date)&&p?.accessPayrollManagement===true,mss:active(e,date)&&p?.accessManagerSelfService===true};
    }
    function actor(s,id,date=today()){if(!active(employee(s,id),date))throw Error('Sign in as an active employee.');return employee(s,id);}
    function assignments(s,id,date=today()){
      const rows=s.jobDataRows.filter(r=>r.empId===id&&r.saved!==false&&r.action!=='Termination'&&r.effectiveDate<=date).slice().sort((a,b)=>b.effectiveDate.localeCompare(a.effectiveDate)||Number(b.effectiveSequence||0)-Number(a.effectiveSequence||0));
      const current=rows[0];if(!current)return [];
      // Temporary assignment replaces the substantive reporting relationship.
      // On expiry, fall back to the latest unexpired substantive assignment.
      if(!current.endDate||current.endDate>=date)return [current];
      const substantive=rows.find(r=>!E.isActingJobDataRow(s,r)&&(!r.endDate||r.endDate>=date));
      return substantive?[substantive]:[];
    }
    function isOperationsManager(s,id,date=today()){
      const j=job(s,id,date),p=s.positions.find(p=>p.active!==false&&String(p.positionNumber)===String(j?.positionNumber));
      return active(employee(s,id),date)&&!!p&&String(p.positionName||'').trim().toLowerCase()==='operations manager';
    }
    function managerFor(s,id,date=today()){
      const e=employee(s,id),rows=assignments(s,id,date);
      const positions=[...new Set(rows.flatMap(j=>{
        const p=s.positions.find(p=>String(p.positionNumber)===String(j.positionNumber));
        const value=j.reportsTo||p?.reportsTo||e?.reportsTo||'';
        return (Array.isArray(value)?value:String(value).split(',')).map(x=>String(x).trim()).filter(Boolean);
      }))];
      if(!positions.length)return {managerId:'',managerIds:[],managerName:'',message:isOperationsManager(s,id,date)?'Automatically Approved':'No Reports To position is assigned.',automatic:isOperationsManager(s,id,date)};
      const matches=s.employees.filter(m=>m.id!==id&&active(m,date)&&profile(s,m.id,date).mss&&positions.some(n=>String(job(s,m.id,date)?.positionNumber||'')===n));
      const unresolved=positions.filter(n=>!matches.some(m=>String(job(s,m.id,date)?.positionNumber||'')===n));
      return {managerId:matches[0]?.id||'',managerIds:matches.map(m=>m.id),managerName:matches.map(E.employeeName).join(', '),reportsTo:positions.join(', '),automatic:isOperationsManager(s,id,date),message:unresolved.length?'Reports To has no active manager with MSS access: '+unresolved.join(', '):''};
    }
    function directReports(s,id,date=today()){
      actor(s,id,date);if(!profile(s,id,date).mss)throw Error('Manager Self Service access is required.');
      return s.employees.filter(e=>e.id!==id&&active(e,date)&&managerFor(s,e.id,date).managerIds.includes(id));
    }
    function assertScope(s,id,target,area='ess',date=today()){
      actor(s,id,date);
      if(area==='ess'&&id===target)return employee(s,target);
      if(area==='mss'&&directReports(s,id,date).some(e=>e.id===target))return employee(s,target);
      throw Error('You do not have access to this employee.');
    }
    const EMPLOYEE_LEAVE=['Personal Leave','Annual Leave','Long Service Leave','Bereavement Leave','LWOP'];
    const MANAGER_LEAVE=EMPLOYEE_LEAVE.concat('Absent Without Leave');
    function validationState(s,exclude){
      // Reserve pending requests for validation only; actual payroll stays untouched.
      return Object.assign({},s,{employees:JSON.parse(JSON.stringify(s.employees)),leaveBookings:s.leaveBookings.filter(l=>l.id!==exclude).map(l=>Object.assign({},l,l.status==='Awaiting Manager Approval'?{status:'Approved'}:{}))});
    }
    function validateRequest(s,input,exclude){
      for(const date of [input.startDate,input.endDate])if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||E.iso(E.parseDate(date))!==date)throw Error('Enter valid leave dates.');
      if(input.requestedHours!==undefined&&input.requestedHours!==''&&!Number.isFinite(Number(input.requestedHours)))throw Error('Enter valid leave hours.');
      const copy=validationState(s,exclude),result=E.validateLeaveBooking(copy,input.empId,input.type,input.startDate,input.endDate,input.requestedHours,exclude,{evidenceProvided:!!input.evidenceProvided,payOption:input.payOption||'',forecastApproved:input.forecastApproved===true});
      if(!result.ok)throw Error(result.message);
      if(input.type==='Annual Leave'){
        const pending=s.leaveBookings.filter(l=>l.id!==exclude&&l.empId===input.empId&&l.type==='Annual Leave'&&l.status==='Awaiting Manager Approval');
        const horizon=[input.endDate,...pending.map(l=>l.endDate)].sort().pop();
        if(horizon>input.endDate){
          copy.leaveBookings.push(Object.assign({},input,{id:'validation-candidate',hours:result.hours,status:'Approved'}));
          const e=employee(copy,input.empId),forecast=E.annualLeaveForecast(copy,e,input.startDate,horizon,0);
          const limit=E.leaveNegativeLimitHours(copy,e,horizon);
          if(forecast.balanceAfter < -limit-0.0001)throw Error('Insufficient Credits after reserving outstanding Annual Leave requests.');
        }
      }
      if(['Personal Leave','Long Service Leave'].includes(input.type)){
        const cycleEnd=E.currentCycle(copy).end;
        const future=copy.leaveBookings.filter(l=>l.empId===input.empId&&l.type===input.type&&E.leaveBookingIsApproved(l)&&l.endDate>cycleEnd).reduce((t,l)=>t+E.daysBetween(l.startDate>cycleEnd?l.startDate:E.addDays(cycleEnd,1),l.endDate).reduce((h,date)=>{if(E.isPublicHoliday(date))return h;const scheduled=Number(E.activeSchedule(copy,input.empId,date)?.hoursByDay?.[E.parseDate(date).getDay()]||0);return h+(l.startDate===l.endDate&&l.requestedHours!==undefined?Number(l.requestedHours):scheduled);},0),0);
        const balance=E.projectedBalances(copy,employee(copy,input.empId),E.currentCycle(copy));
        const available=input.type==='Personal Leave'?balance.personal:balance.lslAccrued;
        const limit=input.type==='Personal Leave'?E.leaveNegativeLimitHours(copy,employee(copy,input.empId),input.startDate):0;
        if(available-future-result.hours < -limit-0.0001)throw Error('Insufficient Credits after reserving outstanding leave requests.');
      }
      return result;
    }
    function notify(s,recipients,message,key,action){
      const ids=[...new Set(recipients.filter(Boolean))];if(!ids.length)return;
      if(s.alerts.some(a=>a.key===key))return;
      s.alerts.unshift({id:uid('alert'),key,type:'info',message,recipientIds:ids,readBy:[],read:false,createdAt:new Date().toISOString(),action});
    }
    function submitLeave(s,id,input,area='ess',date=today()){
      const target=area==='ess'?id:input.empId,e=assertScope(s,id,target,area,date);
      const type=input.type==='Leave without Pay'?'LWOP':input.type;
      if(!(area==='mss'?MANAGER_LEAVE:EMPLOYEE_LEAVE).includes(type))throw Error('This leave type can only be booked by payroll.');
      const manager=managerFor(s,target,date);
      if(!manager.automatic&&(!manager.managerIds.length||manager.message))throw Error(manager.message+' Payroll must correct Reports To before submission.');
      const result=validateRequest(s,Object.assign({},input,{empId:target,type}));
      const stamp=new Date().toISOString(),status=area==='mss'||manager.automatic?'Approved':'Awaiting Manager Approval';
      const l={id:uid('leave'),empId:target,type,startDate:input.startDate,endDate:input.endDate,hours:result.hours,requestedHours:input.requestedHours,workingDays:result.workingDays,evidenceProvided:!!input.evidenceProvided,status,source:area==='mss'?'Manager Self Service':'Employee Self Service',submittedBy:id,submittedAt:stamp,approverId:manager.automatic?'automatic':area==='mss'?id:manager.managerId,approverIds:manager.managerIds,approverName:manager.automatic?'Automatically Approved':area==='mss'?E.employeeName(employee(s,id)):manager.managerName,pendingApprovalSince:status==='Approved'?'':stamp,pendingApprovalNotifiedSince:'',forecastApproved:type==='Annual Leave'&&result.forecastApproved===true,statusHistory:[{status,changedAt:stamp,source:area,actorId:id}]};
      s.leaveBookings.push(l);
      if(area==='ess'&&status==='Awaiting Manager Approval')notify(s,manager.managerIds,`${E.employeeName(e)} submitted ${type==='LWOP'?'Leave without Pay':type}: ${E.fmtPay(l.startDate)} - ${E.fmtPay(l.endDate)}.`,`leave-submit:${l.id}`,{area:'mss',page:'approvals',requestId:l.id});
      else if(area==='mss')notify(s,[target],`${E.employeeName(employee(s,id))} booked approved ${type==='LWOP'?'Leave without Pay':type} for you: ${E.fmtPay(l.startDate)} - ${E.fmtPay(l.endDate)}.`,`leave-manager-book:${l.id}`,{area:'ess',page:'requests'});
      return l;
    }
    function notifyDecision(s,l,status,actorId,comment=''){
      if(!['Approved','Denied'].includes(status))return;
      notify(s,[l.empId],`${l.type==='LWOP'?'Leave without Pay':l.type} ${E.fmtPay(l.startDate)} - ${E.fmtPay(l.endDate)} was ${status.toLowerCase()}${comment?`: ${comment}`:'.'}`,`leave-decision:${l.id}:${l.statusHistory?.length||0}:${status}`,{area:'ess',page:'requests'});
    }
    function decide(s,id,requestId,status,comment='',date=today()){
      const l=s.leaveBookings.find(l=>l.id===requestId);if(!l)throw Error('Request no longer exists.');
      assertScope(s,id,l.empId,'mss',date);
      if(l.status!=='Awaiting Manager Approval')throw Error('Only pending requests can be approved or denied.');
      if(!['Approved','Denied'].includes(status))throw Error('Choose Approve or Deny.');
      if(status==='Denied'&&!String(comment).trim())throw Error('A denial comment is required.');
      if(status==='Approved')validateRequest(s,l,l.id);
      l.approverId=id;l.approverName=E.employeeName(employee(s,id));l.status=status;l.decisionComment=String(comment).trim();l.decidedBy=id;l.decidedAt=new Date().toISOString();l.pendingApprovalSince='';l.pendingApprovalNotifiedSince='';
      (l.statusHistory||(l.statusHistory=[])).push({status,changedAt:l.decidedAt,source:'Manager Self Service',actorId:id,comment:l.decisionComment});
      notifyDecision(s,l,status,id,l.decisionComment);return l;
    }
    function deleteRequest(s,id,requestId,area='ess',date=today()){
      const l=s.leaveBookings.find(l=>l.id===requestId);if(!l)throw Error('Request no longer exists.');
      assertScope(s,id,l.empId,area,date);
      if(area==='ess'&&l.status!=='Awaiting Manager Approval')throw Error('Only pending requests can be deleted by employees.');
      if(area==='mss'&&l.status!=='Approved')throw Error('Managers can delete approved leave in View Request.');
      (s.leaveRequestArchive||(s.leaveRequestArchive=[])).push(Object.assign({},JSON.parse(JSON.stringify(l)),{deletedBy:id,deletedAt:new Date().toISOString(),deletedFrom:area}));
      s.leaveBookings=s.leaveBookings.filter(x=>x.id!==requestId);
      if(area==='mss')notify(s,[l.empId],`Your approved ${l.type} ${E.fmtPay(l.startDate)} - ${E.fmtPay(l.endDate)} was deleted by your manager.`,`leave-delete:${l.id}`,{area:'ess',page:'requests'});
      else notify(s,managerFor(s,id,date).managerIds,`${E.employeeName(employee(s,id))} withdrew ${l.type} ${E.fmtPay(l.startDate)} - ${E.fmtPay(l.endDate)}.`,`leave-withdraw:${l.id}`,{area:'mss',page:'requests'});
      return l;
    }
    function requests(s,id,area='ess',date=today()){
      actor(s,id,date);const ids=area==='ess'?[id]:directReports(s,id,date).map(e=>e.id);
      return s.leaveBookings.filter(l=>ids.includes(l.empId)).slice().sort((a,b)=>String(b.submittedAt||b.startDate).localeCompare(String(a.submittedAt||a.startDate))).map(l=>{
        const m=managerFor(s,l.empId,date);
        const payroll=l.source==='Payroll Management'||(!l.source&&!l.submittedBy);
        const name=payroll?'Payroll':l.approverId==='automatic'?'Automatically Approved':l.decidedBy?E.employeeName(employee(s,l.decidedBy)||{id:l.decidedBy}):l.source==='Manager Self Service'?l.approverName:l.status==='Awaiting Manager Approval'?m.managerName:l.approverName||m.managerName;
        return Object.assign({},l,{approverName:name||'Unassigned'});
      });
    }
    function errors(s,date=today()){
      return s.employees.filter(e=>active(e,date)).flatMap(e=>{const m=managerFor(s,e.id,date);return m.automatic||m.managerIds.length&&!m.message?[]:[`${E.employeeName(e)}: ${m.message}`];});
    }
    function syncNotifications(s,date=today()){
      const payroll=s.employees.filter(e=>profile(s,e.id,date).payroll).map(e=>e.id);
      for(const l of s.leaveBookings){
        if(l.status!=='Awaiting Manager Approval')continue;
        const m=managerFor(s,l.empId,date);
        if(l.source==='Payroll Management'||(!l.source&&!l.submittedBy)){l.approverId='payroll';l.approverName='Payroll';}else{l.approverId=m.managerId;l.approverIds=m.managerIds;l.approverName=m.managerName||'Unassigned';}
        s.alerts.filter(a=>a.key===`leave-submit:${l.id}`).forEach(a=>a.recipientIds=m.managerIds);
        s.alerts.filter(a=>a.leaveId===l.id&&a.type==='Leave Approval Reminder').forEach(a=>{a.recipientIds=[...new Set([...m.managerIds,...payroll].filter(Boolean))];a.action={area:'mss',page:'approvals',requestId:l.id};if(!a.readBy)a.readBy=[];});
      }
    }
    function alertsFor(s,id,date=today()){
      if(!active(employee(s,id),date))return [];
      return s.alerts.filter(a=>a.recipientIds? a.recipientIds.includes(id)&&!(a.readBy||[]).includes(id):profile(s,id,date).payroll&&a.read!==true);
    }
    function readAlert(s,id,alertId,date=today()){
      const a=alertsFor(s,id,date).find(a=>a.id===alertId);if(!a)throw Error('Notification is not available to this employee.');
      if(a.recipientIds){a.readBy=[...new Set([...(a.readBy||[]),id])];}else a.read=true;
    }
    function payslips(s,id,from='',to='',recent=true,date=today()){
      actor(s,id,date);if(from&&to&&from>to)throw Error('From Date cannot be after To Date.');
      const c=E.currentCycle(s),open=E.isFinalised(s,c)?[]:(s.payResults[String(c.id)]||[]).filter(p=>p.empId===id).map(p=>Object.assign({},p,{id:'open_'+p.id,finalised:false}));
      const list=open.concat(s.payslips).filter(p=>p.empId===id&&(!from||p.cycle.end>=from)&&(!to||p.cycle.end<=to)).slice().sort((a,b)=>b.cycle.end.localeCompare(a.cycle.end)||Number(b.segmentIndex)-Number(a.segmentIndex));
      return recent?list.slice(0,10):list;
    }
    const EARNINGS=['Additional Hours','Casual Earnings','Higher Duties Allowance','Overtime 1.5','Overtime 2.0','Meal Allowance','Special Responsibility Allowance (Days)','Travel Allowance','Motor Vehicle Allowance - Single Trip','Motor Vehicle Allowance - Return Trip','Bonus','Overpayment Adjustment','Reimbursement'];
    function saveAdditional(s,id,input,date=today()){
      assertScope(s,id,input.empId,'mss',date);
      const old=input.id&&s.additionalEarnings.find(a=>a.id===input.id);
      if(input.id&&(!old||old.empId!==input.empId))throw Error('Earnings record is not available for this employee.');
      if(!EARNINGS.includes(input.earningType))throw Error('Select a valid earning type.');
      const cycle=E.PAY_CYCLES.find(c=>c.id===Number(input.cycleId));
      if(input.earningType==='Overpayment Adjustment'&&cycle?.id!==E.currentCycle(s).id)throw Error('Overpayment Adjustment can only be entered in the current open pay period.');
      if(!cycle||cycle.id>E.currentCycle(s).id+1||input.startDate<cycle.start||input.startDate>cycle.end||input.endDate<input.startDate||input.endDate>cycle.end)throw Error('Choose work dates within the selected previous, current or next pay period.');
      if(!E.isEmployedOn(employee(s,input.empId),input.startDate)||!E.isEmployedOn(employee(s,input.empId),input.endDate))throw Error('Work dates must fall within employment.');
      const amountOnly=['Travel Allowance','Bonus','Reimbursement','Overpayment Adjustment'].includes(input.earningType);
      const dateBased=['Meal Allowance','Special Responsibility Allowance (Days)','Motor Vehicle Allowance - Single Trip','Motor Vehicle Allowance - Return Trip'].includes(input.earningType);
      if(!dateBased&&(!Number.isFinite(Number(amountOnly?input.amount:input.hours))||(amountOnly?input.earningType!=='Overpayment Adjustment'&&Number(input.amount)<0:Number(input.hours)<=0)))throw Error('Enter a valid amount or positive hours/units.');
      const a={id:old?.id||uid('add'),empId:input.empId,cycleId:cycle.id,earningType:input.earningType,startDate:input.startDate,endDate:input.endDate,hours:amountOnly||dateBased?0:Number(input.hours),amount:amountOnly?Number(input.amount):'',saved:true,source:'Manager Self Service',enteredBy:id};
      if(['Casual Earnings','Higher Duties Allowance'].includes(a.earningType)){
        const p=s.positions.find(p=>p.active!==false&&String(p.positionNumber)===String(input.positionNumber));if(!p)throw Error('Choose an active position.');
        a.positionNumber=p.positionNumber;a.positionName=p.positionName;a.positionDepartment=p.department;
        if(a.earningType==='Casual Earnings'){a.casualBaseRate=E.positionHourlyRate(s,p.positionNumber,a.startDate);a.casualLoadedRate=E.round4(a.casualBaseRate*1.25);a.casualLoadingRate=0.25;}
        else {a.higherDutiesPositionRate=E.positionHourlyRate(s,p.positionNumber,a.startDate);if(a.higherDutiesPositionRate<=Number(E.substantivePayRate(s,employee(s,a.empId),a.startDate).hourlyRate||0))throw Error('The selected position rate must be higher than the employee normal rate.');}
      }
      const index=s.additionalEarnings.findIndex(x=>x.id===a.id);if(index<0)s.additionalEarnings.push(a);else s.additionalEarnings[index]=a;
      return a;
    }
    function deleteAdditional(s,id,recordId,date=today()){
      const a=s.additionalEarnings.find(a=>a.id===recordId);if(!a)throw Error('Earnings record no longer exists.');assertScope(s,id,a.empId,'mss',date);
      s.additionalEarnings=s.additionalEarnings.filter(x=>x.id!==recordId);
      (s.auditLog||(s.auditLog=[])).unshift(`MSS earnings ${recordId} deleted by ${id} for ${a.empId}.`);
    }
    function additionalAmount(s,a){
      if(['Travel Allowance','Bonus','Reimbursement','Overpayment Adjustment'].includes(a.earningType))return Number(a.amount||0);
      if(a.earningType==='Casual Earnings')return E.round2(Number(a.hours||0)*Number(a.casualLoadedRate||0));
      if(a.earningType==='Higher Duties Allowance')return E.round2(Number(a.hours||0)*(Number(a.higherDutiesPositionRate||0)-Number(E.substantivePayRate(s,employee(s,a.empId),a.startDate).hourlyRate||0)));
      if(a.earningType==='Meal Allowance')return E.calendarDaysInclusive(a.startDate,a.endDate)*18;
      if(a.earningType==='Special Responsibility Allowance (Days)')return E.calendarDaysInclusive(a.startDate,a.endDate)*20;
      if(a.earningType==='Motor Vehicle Allowance - Single Trip')return 25;
      if(a.earningType==='Motor Vehicle Allowance - Return Trip')return 50;
      return E.round2(Number(a.hours||0)*Number(E.activePayRate(s,a.empId,a.startDate).hourlyRate||0)*(a.earningType==='Overtime 1.5'?1.5:a.earningType==='Overtime 2.0'?2:1));
    }
    return {EMPLOYEE_LEAVE,MANAGER_LEAVE,EARNINGS,profile,assignments,isOperationsManager,managerFor,directReports,assertScope,validateRequest,submitLeave,decide,deleteRequest,notifyDecision,requests,errors,syncNotifications,alertsFor,readAlert,payslips,saveAdditional,deleteAdditional,additionalAmount};
  }
  function createUI(o){
    const {E,getState,getUser,payslipHtml,onChange,home,logout,esc}=o,S=E.selfService;
    const $=id=>document.getElementById(id),v=id=>$ (id)?.value||'',put=(id,html)=>{if($(id))$(id).innerHTML=html;};
    const table=(heads,rows)=>`<div class="table-wrap"><table><thead><tr>${heads.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(x=>`<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    const click=(id,fn)=>$(id)?.addEventListener('click',()=>{try{fn();}catch(e){alert(e.message);}});
    const change=(id,fn)=>$(id)?.addEventListener('change',()=>{try{fn();}catch(e){alert(e.message);}});
    const buttons=(attribute,fn)=>document.querySelectorAll(`[${attribute}]`).forEach(b=>b.addEventListener('click',()=>{try{fn(b.getAttribute(attribute));}catch(e){alert(e.message);}}));
    let area='ess',page='',section='',target='',requestId='',slipId='',from='',to='',recent=true,earnId='';
    const state=()=>getState(),user=()=>getUser();
    function mutate(fn){const s=state(),before=JSON.parse(JSON.stringify(s));try{fn(s);onChange();}catch(e){Object.keys(s).forEach(k=>delete s[k]);Object.assign(s,before);throw e;}}
    function show(mode='ess',newPage=''){
      const s=state(),id=user();S.assertScope(s,id,id,'ess');if(mode==='mss'&&!S.profile(s,id).mss)throw Error('Manager Self Service access is required.');
      area=mode;page=newPage;section='';target='';requestId='';slipId='';from='';to='';recent=true;earnId='';
      ['appShell','landingScreen'].forEach(id=>{if($(id))$(id).hidden=true;});$('selfServiceScreen').hidden=false;document.body.classList.remove('landing-active');render();
    }
    function hide(){o.unmountPayments?.();o.unmountCertification?.();if($('selfServiceScreen')){$('selfServiceScreen').hidden=true;$('selfServiceScreen').innerHTML='';}put('printArea','');}
    function render(){
      o.unmountPayments?.();o.unmountCertification?.();
      S.assertScope(state(),user(),user(),'ess');if(area==='mss'&&!S.profile(state(),user()).mss){hide();home();return;}
      E.ensurePendingLeaveNotifications(state());S.syncNotifications(state());
      const title=area==='ess'?'Employee Self Service':'Manager Self Service';
      const alerts=S.alertsFor(state(),user());
      put('selfServiceScreen',`<header class="ss-header"><h1>${title}</h1><span>${esc(E.employeeName(state().employees.find(e=>e.id===user())))}</span><div class="controls"><button id="ssBack" class="secondary">Back</button><button id="ssHome" class="secondary icon-btn" title="Home" aria-label="Home"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 12 3l9 8v10h-6v-7H9v7H3z" fill="none" stroke="currentColor" stroke-width="2"/></svg></button><details id="ssNotifications" class="ss-notifications"></details><button id="ssLogout" class="danger">Sign out</button></div></header><div id="ssBody"></div>`);
      click('ssBack',()=>show(area));click('ssHome',()=>{hide();home();});click('ssLogout',()=>{hide();logout();});
      refreshNotifications();
      if(!page){
        const tiles=area==='ess'?[['payslips','Payslips','📄'],['leave','Leave & Timesheets','📅'],['details','Personal Details','👤'],['support','My Support Requests','🎫']]:[['approvals','Approvals','✅'],['reports','Direct Reports','👥'],['leave','Leave & Timesheets','📅'],['payments','Payment Processing','💳'],['details','Employee Details','👤'],['certification','Certification Report','📋'],['support','My Support Requests','🎫']];
        put('ssBody',`<div class="ss-tiles">${tiles.map(([id,label,icon])=>`<button class="landing-tile" data-ss-tile="${id}"><span class="landing-tile-icon" aria-hidden="true">${icon}</span><span>${label}</span></button>`).join('')}</div>`);buttons('data-ss-tile',id=>{page=id;section='';target='';requestId='';render();});return;
      }
      put('ssBody','<div class="ss-layout"><aside id="ssSidebar"></aside><main id="ssMain"></main></div>');
      if(page==='support'){put('ssBody','<main id="ssSupport" class="card"></main>');return o.mountSupport?.('ssSupport',{mode:'own',area});}
      if(page==='certification'){put('ssSidebar','<h2>Certification Report</h2>');return o.mountCertification?.('ssMain',user());}
      if(page==='payslips')return renderPayslips();
      if(page==='approvals')return renderApprovals();
      if(page==='reports')return renderReports();
      if(page==='payments')return renderPayments();
      if(page==='details')return renderDetails();
      renderLeave();
    }
    function nav(items){if(!section)section=items[0][0];put('ssSidebar',items.map(([id,label])=>`<button data-ss-section="${id}" class="${section===id?'':'secondary'}">${label}</button>`).join(''));buttons('data-ss-section',id=>{section=id;target='';earnId='';render();});}
    function selector(){
      const people=area==='ess'?[state().employees.find(e=>e.id===user())]:S.directReports(state(),user());
      if(!people.some(e=>e.id===target))target=people[0]?.id||'';
      return area==='ess'?'':`<label>Employee<select id="ssEmployee">${people.map(e=>`<option value="${esc(e.id)}" ${e.id===target?'selected':''}>${esc(E.employeeName(e))} (${esc(e.id)})</option>`).join('')}</select></label>${people.length?'':'<p>No direct reports.</p>'}`;
    }
    function bindSelector(){change('ssEmployee',()=>{target=v('ssEmployee');earnId='';render();});}
    function selected(){if(!target&&area==='ess')target=user();if(!target)return null;return S.assertScope(state(),user(),target,area);}
    function renderPayslips(employeeId=user()){
      S.assertScope(state(),user(),employeeId,area);
      const ownPays=()=>{S.assertScope(state(),user(),employeeId,area);return S.payslips(state(),employeeId,'','',false);};
      const all=ownPays(),list=S.payslips(state(),employeeId,from,to,recent);
      put(page==='reports'?'ssReportPays':'ssSidebar',`<h2>Payslips</h2><label>From Date<input id="ssPayFrom" type="date" value="${esc(from)}"></label><label>To Date<input id="ssPayTo" type="date" value="${esc(to)}"></label><button id="ssPayApply">Apply Date Range</button><button id="ssPayRecent" class="secondary">Most Recent 10</button>${list.map(p=>`<button data-ss-slip="${esc(p.id)}" class="secondary">${E.ppeLabel(p.cycle)} — ${esc(p.position)} — ${p.finalised?'Finalised':'Open'} — ${E.money(p.net)}</button>`).join('')||'<p>No payslips.</p>'}`);
      click('ssPayApply',()=>{const f=v('ssPayFrom'),t=v('ssPayTo');S.payslips(state(),employeeId,f,t,false);from=f;to=t;recent=false;slipId='';render();});click('ssPayRecent',()=>{from='';to='';recent=true;slipId='';render();});
      if(!list.some(p=>p.id===slipId))slipId=list[0]?.id||'';
      const p=list.find(p=>p.id===slipId);
      put('ssMain',p?`<div class="controls"><button id="ssPrint" ${p.finalised?'':'disabled'}>Print / Save as PDF</button><button id="ssDownload" class="secondary" ${p.finalised?'':'disabled'}>Download Payslip</button></div>${payslipHtml(p)}`:'<p>Only your own payslips are shown. Choose a wider date range to see earlier payslips.</p>');
      buttons('data-ss-slip',id=>{slipId=id;render();});
      click('ssPrint',()=>{const current=ownPays().find(x=>x.id===slipId);if(!current)throw Error('Payslip unavailable.');if(!current.finalised)throw Error('Payslips cannot be printed or downloaded until finalised.');put('printArea',payslipHtml(current));setTimeout(()=>window.print(),0);});
      click('ssDownload',()=>{const current=ownPays().find(x=>x.id===slipId);if(!current)throw Error('Payslip unavailable.');if(!current.finalised)throw Error('Payslips cannot be printed or downloaded until finalised.');const html=`<!doctype html><html lang="en"><meta charset="utf-8"><title>Payslip</title><style>body{font-family:Arial;padding:20px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:8px}.section-title{font-weight:bold;margin-top:18px}</style>${payslipHtml(current)}</html>`;const url=URL.createObjectURL(new Blob([html],{type:'text/html'}));const a=document.createElement('a');a.href=url;a.download=`Payslip-${current.cycle.end}-${current.segmentIndex||1}.html`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
    }
    function requestDetails(l){return table(['Detail','Value'],[['Employee',esc(E.employeeName(state().employees.find(e=>e.id===l.empId)))],['Leave Type',esc(l.type==='LWOP'?'Leave without Pay':l.type)],['Start Date',E.fmtPay(l.startDate)],['End Date',E.fmtPay(l.endDate)],['Hours',Number(l.hours||0).toFixed(2)],['Status',esc(l.status)],['Approver',esc(l.approverName||'Unassigned')],['Evidence Provided',l.evidenceProvided?'Yes':'No'],['Comment',esc(l.decisionComment||'')]]);}
    function renderApprovals(){
      const requests=S.requests(state(),user(),'mss').filter(l=>l.status==='Awaiting Manager Approval');
      put('ssSidebar',`<h2>Pending Requests</h2>${requests.map(l=>`<button data-ss-request="${esc(l.id)}">${esc(E.employeeName(state().employees.find(e=>e.id===l.empId)))} — ${esc(l.type)} — ${E.fmtPay(l.startDate)}</button>`).join('')||'<p>No pending requests.</p>'}`);
      if(!requests.some(l=>l.id===requestId))requestId=requests[0]?.id||'';
      const l=requests.find(l=>l.id===requestId);put('ssMain',l?`<h2>Request Details</h2>${requestDetails(l)}<label>Comment (required when denying)<textarea id="ssDecisionComment" rows="4"></textarea></label><div class="controls"><button id="ssApprove">Approve</button><button id="ssDeny" class="danger">Deny</button></div>`:'<h2>Approvals</h2><p>No pending leave requests. Timesheets will appear here when implemented.</p>');
      buttons('data-ss-request',id=>{requestId=id;render();});for(const [id,status]of [['ssApprove','Approved'],['ssDeny','Denied']])click(id,()=>{mutate(s=>S.decide(s,user(),requestId,status,v('ssDecisionComment')));requestId='';render();});
    }
    function renderReports(){
      const people=S.directReports(state(),user());put('ssSidebar',`<h2>Direct Reports</h2>${people.map(e=>`<button data-ss-report="${esc(e.id)}">${esc(E.employeeName(e))}</button>`).join('')||'<p>No direct reports.</p>'}`);
      if(!people.some(e=>e.id===target))target=people[0]?.id||'';
      const e=target?selected():null;
      if(e){put('ssSidebar',$('ssSidebar').innerHTML+'<div class="divider"></div><button id="ssReportJob">Job Summary</button><button id="ssReportSlips">Payslips</button><div id="ssReportPays"></div>');
        if(section==='payslips')renderPayslips(e.id);else put('ssMain',jobSummary(e));
        click('ssReportJob',()=>{section='job';render();});click('ssReportSlips',()=>{section='payslips';slipId='';render();});
      }else put('ssMain','<p>Select a direct report.</p>');
      buttons('data-ss-report',id=>{target=id;slipId='';from='';to='';recent=true;render();});
    }
    function jobSummary(e){return `<h2>Job Summary</h2><p class="small-note">Job Summary is read-only. It lists saved Job Data rows.</p>${o.jobSummaryHtml?o.jobSummaryHtml(e.id):'<p>Job Summary unavailable.</p>'}`;}
    function renderDetails(){
      nav([['personal','Personal Details'],['bank','Bank Details'],['tax','Tax Details'],['super','Super'],...(area==='ess'?[['job','Job Summary']]:[])]);
      const picker=selector(),e=selected();if(!e){put('ssMain',picker);bindSelector();return;}
      let body='';const s=state();
      if(section==='job')body=jobSummary(e);
      if(section==='personal'){
        const details=Object.assign({},e,E.activePersonalDetails(s,e.id,E.iso(new Date())));
        body=table(['Field','Value'],[['Employee ID',esc(e.id)],['Name',esc(E.employeeName(details))],['Date of Birth',E.fmtPay(details.dateOfBirth)],['Email',esc(details.email)],['Phone',esc(details.phone)],['Address',esc([details.addressLine||details.address,details.townSuburb,details.state,details.postcode,details.country].filter(Boolean).join(', '))]]);
      }
      if(section==='bank')body=table(['Effective Date','Sequence','BSB','Account Number','Account Name'],s.bankDetails.filter(r=>r.empId===e.id).slice().sort((a,b)=>b.effectiveDate.localeCompare(a.effectiveDate)||b.effectiveSequence-a.effectiveSequence).map(r=>[E.fmtPay(r.effectiveDate),r.effectiveSequence,esc(r.bsb),esc(r.accountNumber),esc(r.accountName)]));
      if(section==='super')body=table(['Effective Date','Sequence','Fund Name','USI','ABN','Member Number','Fund Status'],s.superDetails.filter(r=>r.empId===e.id).slice().sort((a,b)=>b.effectiveDate.localeCompare(a.effectiveDate)||b.effectiveSequence-a.effectiveSequence).map(r=>{const f=s.superFunds.find(f=>f.id===r.fundId);return [E.fmtPay(r.effectiveDate),r.effectiveSequence,esc(f?.fundName),esc(f?.usi||r.usi),esc(f?.abn),esc(r.memberNumber),f?.deleted?'Deleted':f?.active===false?'Inactive':f?'Active':'Missing'];}));
      if(section==='tax')body=table(['Effective Date','Tax File Number','Tax Free Threshold','STSL'],s.taxDetails.filter(r=>r.empId===e.id).slice().sort((a,b)=>b.effectiveDate.localeCompare(a.effectiveDate)).map(r=>[E.fmtPay(r.effectiveDate),`<span class="ss-tfn" data-tfn="${esc(r.taxFileNumber||'')}">•••••••••</span> <button data-ss-tfn="${esc(r.id)}" class="secondary">Reveal</button>`,r.claimTaxFreeThreshold===false?'No':'Yes',r.stsl===true?'Yes':'No']));
      put('ssMain',`${picker}<h2>${esc(section==='job'?'Job Summary':({personal:'Personal Details',bank:'Bank Details',tax:'Tax Details',super:'Super'})[section])}</h2>${body}<p class="small-note">Read only — payroll alone can update these details.</p>`);bindSelector();
      buttons('data-ss-tfn',id=>{S.assertScope(state(),user(),e.id,area);const r=state().taxDetails.find(r=>r.id===id&&r.empId===e.id);if(!r)return;const b=Array.from(document.querySelectorAll('[data-ss-tfn]')).find(b=>b.getAttribute('data-ss-tfn')===id);const span=b?.previousElementSibling;if(span){span.textContent=span.textContent==='•••••••••'?r.taxFileNumber:'•••••••••';}});
    }
    function renderLeave(){
      nav(area==='ess'?[['request','Absence Request'],['requests','My Requests'],['balances','Absence Balances'],['calendar','Leave Calendar'],['timesheets','Timesheets']]:[['request','Request Absence'],['requests','View Request'],['balances','Absence Balance'],['timesheets','Timesheet Manager'],['calendar','Absence Monthly Calendar']]);
      if(section==='timesheets'){put('ssMain','');return;}
      if(section==='requests'){
        const requests=S.requests(state(),user(),area);
        put('ssMain',`<h2>${area==='ess'?'My Requests':'View Request'}</h2>${table(['Employee','Leave','From','To','Hours','Status','Approver','Comment','Action'],requests.map(l=>[esc(E.employeeName(state().employees.find(e=>e.id===l.empId))),esc(l.type==='LWOP'?'Leave without Pay':l.type),E.fmtPay(l.startDate),E.fmtPay(l.endDate),Number(l.hours||0).toFixed(2),esc(l.status),esc(l.approverName),esc(l.decisionComment||''),((area==='ess'&&l.status==='Awaiting Manager Approval')||(area==='mss'&&l.status==='Approved'))?`<button class="danger" data-ss-delete="${esc(l.id)}">Delete</button>`:'']))}`);
        buttons('data-ss-delete',id=>{if(!confirm('Delete this leave request?'))return;mutate(s=>S.deleteRequest(s,user(),id,area));render();});return;
      }
      if(section==='calendar')return calendar();
      const picker=selector(),e=selected();if(!e){put('ssMain',picker);bindSelector();return;}
      if(section==='balances'){
        const b=E.projectedBalances(state(),e,E.currentCycle(state()),false),pending=state().leaveBookings.filter(l=>l.empId===e.id&&l.status==='Awaiting Manager Approval');
        const reserved=type=>E.round4(pending.filter(l=>l.type===type).reduce((a,l)=>a+Number(l.hours||0),0));
        put('ssMain',`${picker}<h2>Absence Balances</h2>${table(['Leave','Balance (Hours)','Pending Requests (Hours)'],[['Annual Leave',Number(b.annual).toFixed(4),reserved('Annual Leave')],['Personal Leave',Number(b.personal).toFixed(4),reserved('Personal Leave')],['Long Service Leave',Number(b.lslAccrued).toFixed(4),reserved('Long Service Leave')]])}<p class="small-note">Pending requests reserve availability for validation; they do not deduct actual balances or enter payroll until approved and processed.</p>`);bindSelector();return;
      }
      const types=area==='ess'?S.EMPLOYEE_LEAVE:S.MANAGER_LEAVE;
      const manager=S.managerFor(state(),e.id);
      put('ssMain',`${picker}<h2>${area==='ess'?'Absence Request':'Request Absence'}</h2><p>Approver: ${esc(manager.automatic?'Automatically Approved':manager.managerName||manager.message)}</p><div class="ss-leave-form"><div><label>Leave Type<select id="ssLeaveType">${types.map(t=>`<option value="${t}">${t==='LWOP'?'Leave without Pay':t}</option>`).join('')}</select></label></div><div><label>Start Date<input id="ssLeaveStart" type="date"></label></div><div><label>End Date<input id="ssLeaveEnd" type="date"></label></div><div><label>Hours<input id="ssLeaveHours" type="number" min="0" step="0.01"></label></div><div><label class="inline-check"><input id="ssEvidence" type="checkbox"> Evidence Provided</label></div></div><button id="ssLeaveSubmit" ${manager.automatic||manager.managerIds.length&&!manager.message?'':'disabled'}>${area==='ess'?'Submit Request':'Book Approved Leave'}</button><p class="small-note">${area==='ess'?'Requests await manager approval.':'Bookings on behalf of direct reports are automatically approved.'} Schedule, entitlement, pending balance and overlap rules apply.</p>`);bindSelector();
      const updateHours=(reset=true)=>{
        const type=v('ssLeaveType'),start=v('ssLeaveStart'),end=v('ssLeaveEnd');
        const basic=E.validateLeaveBooking(state(),e.id,type,start,end,undefined,undefined,{evidenceProvided:!!$('ssEvidence').checked});
        const field=$('ssLeaveHours'),single=start&&start===end;
        field.readOnly=!(single&&['Annual Leave','Personal Leave','LWOP','Absent Without Leave'].includes(type)&&basic.partialAllowed);
        field.disabled=field.readOnly&&type==='Long Service Leave';field.max=basic.maxHours||'';
        if(reset)field.value=basic.hours?Number(basic.hours).toFixed(2):'0.00';
        $('ssEvidence').parentElement && ($('ssEvidence').parentElement.hidden=type!=='Personal Leave');
      };
      change('ssLeaveStart',()=>{$('ssLeaveEnd').value=v('ssLeaveStart');updateHours();});
      change('ssLeaveEnd',()=>updateHours());change('ssLeaveType',()=>updateHours());change('ssEvidence',()=>updateHours());
      $('ssLeaveHours').addEventListener('input',()=>updateHours(false));updateHours();
      click('ssLeaveSubmit',()=>{const hours=$('ssLeaveHours').readOnly?'':v('ssLeaveHours');mutate(s=>S.submitLeave(s,user(),{empId:target,type:v('ssLeaveType'),startDate:v('ssLeaveStart'),endDate:v('ssLeaveEnd'),requestedHours:hours===''?undefined:Number(hours),evidenceProvided:!!$('ssEvidence').checked},area));section='requests';render();});
    }
    function calendar(){
      if(area==='ess'){
        let year=E.parseDate(E.currentCycle(state()).start).getFullYear(),base=year;
        put('ssMain','<h2>Leave Calendar</h2><div class="controls"><button id="ssYearPrev" class="secondary">Previous Year</button><strong id="ssYear"></strong><button id="ssYearNext" class="secondary">Next Year</button></div><div id="ssCalendar"></div>');
        const draw=()=>{put('ssYear',String(year));$('ssYearPrev').disabled=year<=base;$('ssYearNext').disabled=year>=base+1;put('ssCalendar',o.yearlyCalendarHtml?o.yearlyCalendarHtml(user(),year):'');};
        click('ssYearPrev',()=>{year=Math.max(base,year-1);draw();});click('ssYearNext',()=>{year=Math.min(base+1,year+1);draw();});draw();return;
      }
      const now=E.currentCycle(state()).start.slice(0,7);put('ssMain',`<h2>Absence Monthly Calendar</h2><div class="controls"><button id="ssMonthPrev" class="secondary" title="Previous month">←</button><label>Month<input id="ssMonth" type="month" value="${now}"></label><button id="ssMonthNext" class="secondary" title="Next month">→</button></div><div id="ssCalendar"></div>`);
      const draw=()=>{const month=v('ssMonth');if(!/^\d{4}-\d{2}$/.test(month))return;put('ssCalendar',o.monthlyCalendarHtml?o.monthlyCalendarHtml(month+'-01',S.directReports(state(),user()).map(e=>e.id)):'');};
      const shift=n=>{const d=E.parseDate(v('ssMonth')+'-01');if(!d)return;d.setMonth(d.getMonth()+n);$('ssMonth').value=E.iso(d).slice(0,7);draw();};
      click('ssMonthPrev',()=>shift(-1));click('ssMonthNext',()=>shift(1));change('ssMonth',draw);draw();
    }
    function renderPayments(){
      put('ssSidebar','<h2>Payment Processing</h2>');
      if(o.mountPayments)o.mountPayments('ssMain',user());else put('ssMain','<p>Payment Processing unavailable.</p>');
    }
    function refreshNotifications(){
      const alerts=S.alertsFor(state(),user());put('ssNotifications',`<summary title="Notifications" aria-label="Notifications (${alerts.length})"><span aria-hidden="true">🔔</span><span class="notification-count">${alerts.length}</span></summary><div class="ss-notification-list">${alerts.map(a=>`<div class="history-item"><button class="secondary" data-ss-alert="${esc(a.id)}">${esc(a.message)}</button> <button data-ss-read="${esc(a.id)}">Mark as read</button></div>`).join('')||'<p>No notifications.</p>'}</div>`);
      buttons('data-ss-alert',id=>{const a=S.alertsFor(state(),user()).find(a=>a.id===id);if(a?.action?.page==='support'){page='support';render();o.mountSupport?.('ssSupport',{mode:'own',area,caseId:a.action.caseId});}});
      buttons('data-ss-read',id=>{mutate(s=>S.readAlert(s,user(),id));refreshNotifications();});
    }
    return {show,hide,render,refreshNotifications};
  }
  const api={create,createUI};global.SelfService=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
