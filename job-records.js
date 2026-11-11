(function(g){
'use strict';
function create(E){
 const clone=x=>JSON.parse(JSON.stringify(x)),number=r=>Number(r?.jobRecord||0),today=()=>E.iso(new Date());
 const fields=['startDate','originalStartDate','type','position','department','hourlyRate','status','terminationDate','terminationReason','contractEndDate','autoTerminate','employmentSegments'];
 const snapshot=e=>Object.fromEntries(fields.filter(k=>e[k]!==undefined).map(k=>[k,clone(e[k])]));
 const explicit=(s,id)=>(s.jobRecords||[]).filter(r=>r.empId===id).sort((a,b)=>a.recordNumber-b.recordNumber);
 const records=(s,id)=>explicit(s,id).length?explicit(s,id):[{id:id+':0',empId:id,recordNumber:0,primary:true}];
 const multiple=(s,id)=>!(s._jobRecordScope!==undefined&&s._jobRecordEmployee===id)&&records(s,id).length>1;
 function matches(s,row){return number(row)===Number(s._jobRecordScope??0);}
 function record(s,id,n){const r=records(s,id).find(r=>r.recordNumber===Number(n));if(!r)throw Error('Select a valid job record.');return r;}
 function calendarStatus(s,e,date,allowed=null){
  let beforeNonCasualStart=false;
  const statuses=records(s,e.id).filter(r=>!allowed||allowed.includes(r.recordNumber)).map(r=>{
   const v=scope(s,e.id,r.recordNumber),person=v.employees.find(x=>x.id===e.id);E.reconcileEmploymentFromJobData(v,person);
   if(!E.isEmployedOn(person,date)){if(E.employmentSegments(person).some(segment=>segment.startDate>date&&E.activeEmploymentType(v,person,segment.startDate)!=='Casual'))beforeNonCasualStart=true;return null;}
   if(E.activeEmploymentType(v,person,date)==='Casual')return null;
   return E.absenceCalendarStatus(v,person,date);
  }).filter(Boolean);
  if(!statuses.length){
   if(beforeNonCasualStart){const holiday=E.isPublicHoliday(date);return {cssClass:holiday?'publicholiday':'nonrostered',title:holiday?E.publicHolidayName(date):'Non Rostered Day',label:holiday?'PH':'NRD',hours:0,employed:false,leaveType:'',status:'',pending:false};}
   return {cssClass:'',title:'',label:'',hours:0,employed:false,leaveType:'',status:'',pending:false};
  }
  const leave=statuses.filter(x=>x.leaveType&&x.hours>0),chosen=leave[0]||statuses.find(x=>x.hours>0)||statuses[0];
  return {...chosen,hours:E.round4(statuses.reduce((sum,x)=>sum+x.hours,0)),title:leave.length>1?leave.map(x=>x.title).join(' / '):chosen.title};
 }
 function leaveRecords(s,id,date=today()){return records(s,id).filter(r=>{const v=scope(s,id,r.recordNumber),e=v.employees.find(e=>e.id===id);return E.activeEmploymentType(v,e,date)!=='Casual';});}
 function scope(s,id,n=0){
  const r=record(s,id,n),original=s.employees.find(e=>e.id===id);if(!original)throw Error('Employee not found.');
  const missing=Number(n)>0&&!(s.jobDataRows||[]).some(j=>j.empId===id&&number(j)===Number(n)&&j.saved!==false&&j.action==='Commencement');const employment=missing?{startDate:'',originalStartDate:'',status:'Pending',terminationDate:'',terminationReason:'',contractEndDate:'',autoTerminate:false,employmentSegments:[],position:'',hourlyRate:0,type:'Permanent'}:r.employment;const employee={...clone(original),...(employment?clone(employment):{})};delete employee.concurrentEmployment;
  const view={...s,_jobRecordScope:Number(n),_jobRecordEmployee:id,_sharedLeaveState:s._sharedLeaveState||s,employees:s.employees.map(e=>e.id===id?employee:e)};
  for(const key of ['jobDataRows','schedules','payRates','additionalEarnings','leaveBookings','cashOutRequests','jobEvents','deductions'])view[key]=(s[key]||[]).filter(row=>row.empId!==id||number(row)===Number(n)||key==='jobEvents'&&row.type==='Absence Balance Adjustment');
  view.payslips=(s.payslips||[]).filter(p=>p.empId!==id||(p.rows||[]).some(row=>number(row)===Number(n))).map(p=>p.empId!==id?p:{...p,rows:p.rows.filter(row=>number(row)===Number(n)),employeeSnapshot:p.jobRecordSnapshots?.[String(n)]||p.employeeSnapshot});
  view.finalisedCycles=Object.fromEntries(Object.entries(s.finalisedCycles||{}).map(([key,c])=>[key,{...c,payControlHeldDates:{...(c.payControlHeldDates||{}),[id]:c.jobRecordHeldDates?.[id]?.[String(n)]||(!n?c.payControlHeldDates?.[id]:[])||[]}}]));
  return view;
 }
 function employee(s,id,n){return scope(s,id,n).employees.find(e=>e.id===id);}
 function add(s,actorId,id,recordNumber=null){
  if(!E.selfService.profile(s,actorId).payroll)throw Error('Payroll Management access is required.');
  const e=s.employees.find(e=>e.id===id);if(!e)throw Error('Select an employee.');
  const n=recordNumber===null?Math.max(...records(s,id).map(r=>r.recordNumber))+1:Number(recordNumber);
  if(!Number.isSafeInteger(n)||n<1||records(s,id).some(r=>r.recordNumber===n))throw Error('This job record number is already in use. Choose an unused record number.');
  s.jobRecords=s.jobRecords||[];
  if(!explicit(s,id).length)s.jobRecords.push({id:id+':0',empId:id,recordNumber:0,primary:true,employment:snapshot(e)});
  const r={id:id+':'+n,empId:id,recordNumber:n,primary:false,employment:{startDate:'',originalStartDate:'',type:'Permanent',position:'',department:'',hourlyRate:0,status:'Pending',terminationDate:'',terminationReason:'',contractEndDate:'',autoTerminate:false,employmentSegments:[]},createdAt:new Date().toISOString(),createdBy:actorId};
  s.jobRecords.push(r);s.auditLog.unshift(r.createdAt+' — '+actorId+': Added job record '+n+' for '+id);return r;
 }
 function union(segments){
  const out=[];
  for(const source of segments.filter(r=>r.startDate).sort((a,b)=>a.startDate.localeCompare(b.startDate))){const r={...source,endDate:source.endDate?(source.inclusiveEnd?E.addDays(source.endDate,1):source.endDate):'',inclusiveEnd:false},last=out.at(-1);
   if(last&&(!last.endDate||r.startDate<=last.endDate)){if(last.endDate&&(!r.endDate||r.endDate>last.endDate)){last.endDate=r.endDate;last.terminationReason=r.terminationReason;}}else out.push(r);
  }return out;
 }
 function reconcile(s,e,base){
  const views=[];
  for(const r of records(s,e.id)){const v=scope(s,e.id,r.recordNumber),x=v.employees.find(x=>x.id===e.id);base(v,x);const job=E.activeJobDataRow(v,x,today());if(job){x.position=job.positionName||x.position;x.department=job.department||x.department;x.hourlyRate=Number(E.activePayRate(v,x.id,today()).hourlyRate||x.hourlyRate||0);}r.employment=snapshot(x);views.push({record:r,employee:x});}
  const date=today(),active=views.filter(x=>E.isEmployedOn(x.employee,date)),preferred=active.find(x=>E.activeEmploymentType(scope(s,e.id,x.record.recordNumber),x.employee,date)!=='Casual')||active[0]||views[0];
  const segments=union(views.flatMap(x=>E.employmentSegments(x.employee)));e.concurrentEmployment=views.map(x=>({jobRecord:x.record.recordNumber,...snapshot(x.employee)}));
  if(preferred)Object.assign(e,snapshot(preferred.employee));e.employmentSegments=segments;e.originalStartDate=segments[0]?.startDate||e.originalStartDate;
  if(active.length){e.status='Active';e.terminationDate='';e.terminationReason='';e.contractEndDate='';e.autoTerminate=false;}else if(views.some(x=>x.employee.status==='Terminated'))e.status='Terminated';
  return e;
 }
 function activeRecords(s,id,date=today(),includeCasual=true){return records(s,id).filter(r=>{const v=scope(s,id,r.recordNumber),e=v.employees.find(e=>e.id===id);E.reconcileEmploymentFromJobData(v,e);return E.isEmployedOn(e,date)&&(includeCasual||E.activeEmploymentType(v,e,date)!=='Casual');});}
 function combinedSchedule(s,id,date){const hours={0:0,1:0,2:0,3:0,4:0,5:0,6:0},week1={...hours},week2={...hours};let found=false,twoWeek=false;
  for(const r of activeRecords(s,id,date,false)){const v=scope(s,id,r.recordNumber),schedule=E.activeSchedule(v,id,date);if(!schedule)continue;found=true;if(schedule.rosterPattern==='2-week')twoWeek=true;for(const d of Object.keys(hours)){hours[d]+=Number(schedule.hoursByDay?.[d]||0);week1[d]+=Number((schedule.hoursByDayWeek1||schedule.hoursByDay)?.[d]||0);week2[d]+=Number((schedule.rosterPattern==='2-week'?(schedule.hoursByDayWeek2||schedule.hoursByDayWeek1||schedule.hoursByDay):schedule.hoursByDay)?.[d]||0);}}
  return found?{id:'combined-'+id,empId:id,rosterPattern:twoWeek?'2-week':'1-week',hoursByDay:hours,hoursByDayWeek1:week1,hoursByDayWeek2:week2}:null;
 }
 function serviceView(s,e,asOf=today()){
  const eligible=records(s,e.id).filter(r=>(s.jobDataRows||[]).some(j=>j.empId===e.id&&number(j)===r.recordNumber&&j.saved!==false&&j.action!=='Termination'&&j.positionClass&&j.positionClass!=='Casual'));
  if(!eligible.length){const v=scope(s,e.id,0);v._sharedLeaveState=undefined;return v;}
  const ids=new Set(eligible.map(r=>r.recordNumber)),v={...s,_jobRecordScope:'service',_jobRecordEmployee:e.id,_sharedLeaveState:undefined,_serviceRoot:s},x={...clone(e),type:'Permanent',employmentSegments:union(eligible.flatMap(r=>E.employmentSegments(employee(s,e.id,r.recordNumber))))};
  delete x.concurrentEmployment;x.startDate=x.employmentSegments.at(-1)?.startDate||x.startDate;x.originalStartDate=x.employmentSegments[0]?.startDate||x.originalStartDate;x.lslServiceDate=[x.lslServiceDate,x.originalStartDate].filter(Boolean).sort().pop();x.terminationDate=x.employmentSegments.at(-1)?.endDate||'';x.contractEndDate='';
  v.employees=s.employees.map(a=>a.id===e.id?x:a);v.jobDataRows=s.jobDataRows.filter(j=>j.empId!==e.id||ids.has(number(j))&&j.positionClass!=='Casual');
  const types=['LWOP','Absent Without Leave','Suspension without Pay','Parental Leave - Unpaid Extension'],unpaid=(s.leaveBookings||[]).filter(l=>l.empId===e.id&&types.includes(l.type)&&E.leaveBookingIsApproved(l)&&l.startDate&&l.endDate&&l.startDate<=asOf),days=new Set();
  for(const leave of unpaid)for(const d of E.daysBetween(leave.startDate,leave.endDate<asOf?leave.endDate:asOf))days.add(d);
  const excluded=[];
  for(const d of [...days].sort()){
   const active=activeRecords(s,e.id,d,false);if(!active.length)continue;
   const allUnpaid=active.every(r=>{const view=scope(s,e.id,r.recordNumber),schedule=E.activeSchedule(view,e.id,d),hours=Number(schedule?.hoursByDay?.[E.parseDate(d).getDay()]||0);return hours===0||unpaid.some(l=>number(l)===r.recordNumber&&l.startDate<=d&&l.endDate>=d);});
   if(!allUnpaid)continue;const extension=unpaid.some(l=>l.type==='Parental Leave - Unpaid Extension'&&l.startDate<=d&&l.endDate>=d),type=extension?'Parental Leave - Unpaid Extension':'LWOP',last=excluded.at(-1);
   if(last&&last.type===type&&E.addDays(last.endDate,1)===d)last.endDate=d;else excluded.push({id:'shared-service-'+d,empId:e.id,type,startDate:d,endDate:d,status:'Approved'});
  }
  v.leaveBookings=(s.leaveBookings||[]).filter(l=>l.empId!==e.id||!types.includes(l.type)).concat(excluded);return v;
 }
 function tag(rows,n,v,e){return rows.map(row=>({...row,jobRecord:n,jobEmploymentType:E.activeEmploymentType(v,e,row.startDate||E.currentCycle(v).end)}));}
 function outstandingRetro(rows){
  const totals=new Map(),key=r=>[r.description,r.position||'',r.positionNumber||'',r.ote===false,r.nonTaxable===true].join('|');
  for(const r of rows){const k=key(r),t=totals.get(k)||{amount:0,balance:0,accrual:0,informational:false};t.amount+=Number(r.amount||0);t.balance+=Number(r.balanceUnits||0);t.accrual+=Number(r.accrualUnits||0);t.informational=t.informational||r.informational===true;totals.set(k,t);}
  return rows.filter(r=>{const t=totals.get(key(r));return t.informational||Math.abs(t.amount)>0.004||Math.abs(t.balance)>0.0001||Math.abs(t.accrual)>0.0001;});
 }
 function calculate(s,e,c,finalised){
  const contexts=records(s,e.id).map(r=>{const v=scope(s,e.id,r.recordNumber),x=v.employees.find(x=>x.id===e.id);E.reconcileEmploymentFromJobData(v,x);return {r,v,e:x};});
  const all=[];
  for(const ctx of contexts){if(!E.payEnabledInCycle(ctx.v,e.id,c))continue;const current=E.earningRowsForCycle(ctx.v,ctx.e,c,{includePayouts:false});all.push(...tag([...current,...E.lateFixedTermPayoutRecoveryRows(ctx.v,ctx.e,c),...outstandingRetro(E.retroRows(ctx.v,ctx.e,c))],ctx.r.recordNumber,ctx.v,ctx.e));}
  const endings=contexts.map(ctx=>{const end=ctx.e.terminationDate||(ctx.e.type==='Fixed Term'?ctx.e.contractEndDate:'');const date=end?(E.hasInclusiveEmploymentEnd(ctx.e)?end:E.addDays(end,-1)):'';return {...ctx,date,end};}).filter(ctx=>ctx.date&&ctx.date>=c.start&&ctx.date<=c.end&&E.activeEmploymentType(ctx.v,ctx.e,ctx.date)!=='Casual').sort((a,b)=>b.date.localeCompare(a.date)||b.r.recordNumber-a.r.recordNumber);
  const last=endings[0];
  if(last&&!contexts.some(ctx=>ctx.r.recordNumber!==last.r.recordNumber&&E.isEmployedOn(ctx.e,last.end)&&E.activeEmploymentType(ctx.v,ctx.e,last.end)!=='Casual')){
   const payouts=E.earningRowsForCycle(last.v,last.e,c,{includePayouts:true,payoutBalanceRows:all}).filter(row=>/Leave Payout$|LSL Payout$/.test(row.description)||row.personalLeaveDeficitRecovery||row.lslDeficitRecovery||row.annualLeaveDeficitRecovery);
   all.push(...tag(payouts,last.r.recordNumber,last.v,last.e));
  }
  const results=E.splitIntoPayslips(s,e,c,all,finalised),snapshots=Object.fromEntries(contexts.map(ctx=>[String(ctx.r.recordNumber),clone(ctx.e)]));
  return results.map(p=>({...p,jobRecordIds:[...new Set(p.rows.map(number))],jobRecordSnapshots:snapshots}));
 }
 function projected(s,e,c,includeCurrent){const rows=calculate(s,e,c,false).flatMap(p=>p.rows),v=scope(s,e.id,0);return E.projectedBalances(v,v.employees.find(x=>x.id===e.id),c,includeCurrent,rows);}
 function eligibleForManager(s,manager,id,date=today(),approval=false){return records(s,id).filter(r=>{const v=scope(s,id,r.recordNumber),e=v.employees.find(e=>e.id===id);E.reconcileEmploymentFromJobData(v,e);if(!E.selfService.isActiveEmployee(v,e,date))return false;return (approval?E.selfService.approvalManagerFor(v,id,date):E.selfService.managerFor(v,id,date)).managerIds.includes(manager);});}
 function canViewPayslip(s,manager,p,date=today()){const allowed=eligibleForManager(s,manager,p.empId,date).map(r=>r.recordNumber),ids=p.jobRecordIds||[0];return ids.every(n=>allowed.includes(Number(n)))||p.position==='Casual'&&ids.some(n=>allowed.includes(Number(n)));}
 function options(s,id,selected=0,allowed){return records(s,id).filter(r=>!allowed||allowed.includes(r.recordNumber)).map(r=>{const v=scope(s,id,r.recordNumber),e=v.employees.find(e=>e.id===id),j=E.activeJobDataRow(v,e,today())||(v.jobDataRows||[]).filter(j=>j.empId===id&&j.saved!==false).at(-1);const text='Job '+r.recordNumber+' — '+(j?.positionName||e.position||'New appointment')+(r.primary?' (Primary)':'');return {value:String(r.recordNumber),label:text,selected:r.recordNumber===Number(selected)};});}
 function forecast(s,e,endDate){
  const current=E.currentCycle(s),horizon=endDate>current.end?endDate:current.end;let annual=Number(e.annualLeaveBalance||0),accrual=0,used=0;
  for(const c of E.PAY_CYCLES.filter(c=>c.id>=current.id&&c.start<=horizon)){
   const period={...c,end:c.end<horizon?c.end:horizon};let rows;
   if(c.id===current.id)rows=calculate(s,e,period,false).flatMap(p=>p.rows);
   else rows=records(s,e.id).flatMap(r=>{const v=scope(s,e.id,r.recordNumber),x=v.employees.find(x=>x.id===e.id);E.reconcileEmploymentFromJobData(v,x);return tag(E.earningRowsForCycle(v,x,period,{includePayouts:false}),r.recordNumber,v,x);});
   const hours=E.ordinaryHours(rows.filter(r=>r.jobEmploymentType!=='Casual')),earned=E.round4(hours*E.ANNUAL_LEAVE_WEEKS_PER_YEAR/52),debit=rows.filter(r=>['Annual Leave','Annual Leave Cash Out','Annual Leave Payout','Annual Leave Overuse Recovery'].includes(r.description)).reduce((n,r)=>n+Number(r.units||0),0)+rows.filter(r=>r.kind==='retro'&&r.description==='Annual Leave Retro').reduce((n,r)=>n+Number(r.balanceUnits||0),0);annual+=earned-debit;accrual+=earned;used+=debit;
  }return {availableBefore:E.round4(annual),balanceAfter:E.round4(annual),currentBalance:Number(e.annualLeaveBalance||0),accrual:E.round4(accrual),used:E.round4(used),asOf:endDate};
 }
 // A partially processed request must not silently leave a temporary
 // appointment or roster in place once its agreed end reaches the pay run.
 function requestCompanionErrors(s,c){
  const cases=new Map((s.supportRequests||[]).map(x=>[x.id,x])),saved=(s.jobDataRows||[]).filter(r=>r.saved!==false),out=[];
  const valid=d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')&&E.iso(E.parseDate(d))===d;
  for(const row of saved){
   const request=cases.get(row.sourceRequestCaseId),step=row.sourceRequestStep,t=request?.template;
   if(!t||!step)continue;
   const pending=request.correctionPending?.steps?.includes(step),stale=Number(row.sourceRequestRevision||0)<Number(request.jobDataStepRevisions?.[step]||0);
   if(!pending&&!stale)continue;
   const employee=s.employees.find(e=>e.id===row.empId);if(!employee)continue;
   const oldDue=row.action==='Termination'&&valid(row.effectiveDate)?E.addDays(row.effectiveDate,-1):row.effectiveDate;
   const requested=step==='expiry'?t.contractEndDate:step==='return'?(t.returnEffectiveDate||t.returnDate):request.requestType==='Termination'?t.lastWorkingDay:t.effectiveDate;
   if(oldDue>c.end&&(!valid(requested)||requested>c.end))continue;
   out.push({empId:row.empId,employeeName:E.employeeDisplayName(employee),message:`Manager request ${request.number} · Job ${number(row)}: ${pending?'awaiting correction of saved Job Data':'review and save the corrected Job Data draft'} before finalising this pay.`});
  }
  for(const main of saved){
   if(!main.sourceRequestCaseId||main.sourceRequestStep!=='main'||main.effectiveDate>c.end)continue;
   const request=cases.get(main.sourceRequestCaseId),t=request?.template,employee=s.employees.find(e=>e.id===main.empId);
   if(!t||!employee||request.source!=='mss')continue;
   const expiry=main.action==='Commencement'&&t.employmentType==='Fixed Term'&&valid(t.contractEndDate);
   const variation=main.action==='Variation'&&t.scheduleDuration==='Temporary'&&valid(t.returnEffectiveDate);
   const movement=main.action==='Movement'&&t.temporary==='Temporary'&&valid(t.returnDate);
   if(!expiry&&!variation&&!movement)continue;
   const expected=expiry?E.addDays(t.contractEndDate,1):variation?t.returnEffectiveDate:t.returnDate;
   // Fixed-term final pay belongs on the last payable day, even if the
   // termination effective date falls in the following pay cycle.
   if((expiry?t.contractEndDate:expected)>c.end)continue;
   const superseded=saved.some(r=>{
    if(r.empId!==main.empId||number(r)!==number(main)||r.id===main.id||r.effectiveDate<main.effectiveDate||r.effectiveDate===main.effectiveDate&&Number(r.effectiveSequence||0)<=Number(main.effectiveSequence||0))return false;
    if(r.sourceRequestCaseId===request.id&&r.sourceRequestStep===(expiry?'expiry':'return')&&r.action===(expiry?'Termination':main.action))return true;
    if(r.effectiveDate>expected)return false;
    if(r.action==='Termination'||r.action==='Commencement')return true;
    if(expiry)return r.action==='Variation'&&r.reason==='Permanency Confirmed'&&r.positionClass==='Permanent';
    return r.action==='Movement'||variation&&r.action==='Variation'&&r.reason==='Work Schedule Adjustment';
   });
   if(superseded)continue;
   const label=expiry?'fixed-term expiry':variation?'return roster':'return from temporary assignment';
   out.push({empId:main.empId,employeeName:E.employeeDisplayName(employee),message:`Manager request ${request.number} · Job ${number(main)}: save or review the ${label} row effective ${E.fmtPay(expected)} before finalising this pay.`});
  }
  return out;
 }
 function validateLeave(s,input,exclude,base){
  record(s,input.empId,input.jobRecord||0);const reserved={...s,employees:clone(s.employees),leaveBookings:(s.leaveBookings||[]).filter(l=>l.id!==exclude).map(l=>({...l,status:l.status==='Awaiting Manager Approval'?'Approved':l.status}))},person=reserved.employees.find(e=>e.id===input.empId),v=scope(reserved,input.empId,input.jobRecord||0),e=v.employees.find(e=>e.id===input.empId),c=E.currentCycle(s);
  const shared=E.projectedBalances(reserved,person,c),local=E.projectedBalances(v,e,c),horizon=[input.endDate,...reserved.leaveBookings.filter(l=>l.empId===person.id&&l.type==='Annual Leave'&&E.leaveBookingIsApproved(l)).map(l=>l.endDate)].filter(Boolean).sort().at(-1)||c.end;
  if(input.type==='Annual Leave'&&/^\d{4}-\d{2}-\d{2}$/.test(horizon)){
   const all=forecast(reserved,person,horizon),own=E.annualLeaveForecast(v,e,input.startDate,horizon,0);e.annualLeaveBalance=Number(e.annualLeaveBalance||0)+all.availableBefore-own.availableBefore;
  }else e.annualLeaveBalance=Number(e.annualLeaveBalance||0)+shared.annual-local.annual;
  const otherFuture=reserved.leaveBookings.filter(l=>l.empId===person.id&&number(l)!==Number(input.jobRecord||0)&&l.type==='Personal Leave'&&E.leaveBookingIsApproved(l)&&l.endDate>c.end).reduce((n,l)=>n+Number(l.hours||0),0);
  e.personalLeaveBalance=Number(e.personalLeaveBalance||0)+shared.personal-local.personal-otherFuture;
  const result=base(v,input,exclude);
  if(input.type==='Long Service Leave'){
   const future=reserved.leaveBookings.filter(l=>l.empId===person.id&&l.type==='Long Service Leave'&&E.leaveBookingIsApproved(l)&&l.endDate>c.end).reduce((n,l)=>n+Number(l.hours||0),0);
   if(shared.lslAccrued-future-result.hours < -0.0001)throw Error('Insufficient shared Long Service Leave credits across job records.');
  }return result;
 }
 return {number,matches,records,leaveRecords,calendarStatus,record,multiple,scope,employee,add,reconcile,activeRecords,combinedSchedule,serviceView,calculate,projected,eligibleForManager,options,snapshot,forecast,validateLeave,requestCompanionErrors,canViewPayslip};
}
g.JobRecords={create};if(typeof module!=='undefined')module.exports={create};
})(typeof window!=='undefined'?window:globalThis);
