(function(g){
'use strict';
function createUI(o){
 const {E,getState,getUser,onChange,reportError}=o,T=E.timeRecords,doc=o.document||g.document,$=id=>doc.getElementById(id),s=()=>getState(),u=()=>getUser(),v=id=>$(id)?.value||'',esc=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),n=x=>Number(x||0).toFixed(4);
 let container='',area='ess',page='timesheets',period='',editing='',week=0,allWeeks=false,loadKey='',days=[],remarks='',activeRecord=null;
 const button=(id,label,cls='')=>'<button id="'+id+'" class="'+cls+'">'+label+'</button>';
 function put(html){$(container).innerHTML=html;}
 function click(id,fn){$(id)?.addEventListener('click',()=>{try{fn();}catch(e){reportError(e.message);}});}
 function change(id,fn){$(id)?.addEventListener('change',()=>{try{fn();}catch(e){reportError(e.message);}});}
 function bind(attr,fn){$(container).querySelectorAll('['+attr+']').forEach(b=>b.addEventListener('click',()=>{try{fn(b.getAttribute(attr));}catch(e){reportError(e.message);}}));}
 function mutate(fn){const state=s(),before=JSON.parse(JSON.stringify(state));try{const result=fn(state);onChange({kind:'timesheet'});return result;}catch(e){Object.keys(state).forEach(k=>delete state[k]);Object.assign(state,before);throw e;}}
 function employee(id){return s().employees.find(e=>e.id===id);}
 function status(t){return !t||t.status==='Draft'?'In Progress':t.status;}
 function table(headers,data){return '<div class="table-wrap"><table><thead><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+(data.length?data.map(row=>'<tr>'+row.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join(''):'<tr><td colspan="'+headers.length+'">No time records.</td></tr>')+'</tbody></table></div>';}
 function recordForPreview(){return {...(activeRecord||{}),schemaVersion:2,empId:area==='ess'?u():activeRecord.empId,cycleId:Number(period),days,remarks,status:activeRecord?.status==='Approved'||activeRecord?.status==='Awaiting Manager Approval'?activeRecord.status:'Draft'};}
 function editable(){return area==='ess'&&(!activeRecord||['Draft','Denied'].includes(activeRecord.status));}
 function load(record,c){
  const key=(record?.id||'new')+'|'+(record?.revision||0)+'|'+(record?.updatedAt||'')+'|'+record?.status+'|'+c.id+'|'+u();
  if(loadKey===key)return;loadKey=key;activeRecord=record||null;period=String(c.id);week=0;allWeeks=false;remarks=record?.remarks||'';
  const byDate=new Map((record?.days||[]).map(d=>[d.date,d]));days=E.daysBetween(c.start,c.end).map(date=>{const d=byDate.get(date)||{};return {...d,date,flexTaken:d.flexTaken||0,remarks:d.remarks||'',blocks:Array.from({length:Math.max(3,d.blocks?.length||0)},(_,i)=>({...d.blocks?.[i],start:d.blocks?.[i]?.start||'',finish:d.blocks?.[i]?.finish||''}))};});
 }
 function collect(){
  for(let i=0;i<days.length;i++){const d=days[i];for(let j=0;j<6;j++){if($('trStart'+i+'_'+j))d.blocks[j]={start:v('trStart'+i+'_'+j),finish:v('trFinish'+i+'_'+j)};}if($('trFlex'+i))d.flexTaken=v('trFlex'+i);if($('trNote'+i))d.remarks=v('trNote'+i);}
  if($('trRemarks'))remarks=v('trRemarks');
 }
 function summary(){return T.summary(s(),recordForPreview());}
 function context(t,c,data){
  const person=employee(t.empId),balance=data.closing,warning=balance<0?' is-negative':'';
  return '<header class="tr-person"><span><b>Empl ID:</b> '+esc(t.empId)+'</span><strong>'+esc(E.employeeName(person||{}))+'</strong><span><b>Period Begin Date:</b> '+E.fmtPay(c.start)+'</span><span><b>Status:</b> '+esc(status(t))+'</span></header><section class="tr-balances"><div><span>Carried Forward:</span><output id="trCarry">'+n(data.carried)+'</output></div><div><span>Flex Hours Earned:</span><output id="trEarned">'+n(data.earned)+'</output></div><div><span>Flex Time Taken:</span><output id="trTaken">'+n(data.taken)+'</output></div><div class="'+warning+'"><span>Period Balance (Max. 37.5):</span><output id="trClosing">'+n(balance)+'</output></div><div><span>Hours Above Cap:</span><output id="trExcess">'+n(data.excess)+'</output></div><p>Carry-forward uses approved records only. Excess above 37.5 hours is shown separately and is not carried forward.</p></section>';
 }
 function weeksHtml(data,canEdit){
  return (allWeeks?[0,1]:[week]).map(w=>{
   const indices=Array.from({length:7},(_,i)=>w*7+i),workBlocks=Math.max(3,...indices.map(i=>days[i].blocks.length));
   const heading='<thead><tr><th>Week Commenced<br>'+E.fmtPay(days[w*7].date)+'</th>'+indices.map(i=>'<th>'+esc(E.parseDate(days[i].date).toLocaleDateString('en-AU',{weekday:'long'}))+'<small>'+E.fmtPay(days[i].date)+'</small></th>').join('')+'</tr></thead>';
   let rows='';
   for(let b=0;b<workBlocks;b++)for(const [key,label]of [['start','On'],['finish','Off']]){
    rows+='<tr class="tr-clock-row"><th scope="row">'+label+(workBlocks>1?' '+(b+1):'')+':</th>'+indices.map(i=>{
     const value=days[i].blocks[b]?.[key]||'',id=(key==='start'?'trStart':'trFinish')+i+'_'+b;
     return '<td>'+(canEdit?'<input id="'+id+'" type="time" step="60" value="'+esc(value)+'" aria-label="'+label+' '+(b+1)+' on '+esc(days[i].date)+'">':esc(value||'—'))+'</td>';
    }).join('')+'</tr>';
   }
   const metric=(label,key,id)=>'<tr class="tr-metric"><th scope="row">'+label+'</th>'+indices.map(i=>'<td id="'+id+i+'">'+n(data.days[i][key])+'</td>').join('')+'</tr>';
   rows+=metric('Rostered Hours:','rosteredHours','trRoster')+metric('Hours Worked for Day:','workedHours','trWorked')+metric('Breaks (Hours):','breakHours','trBreak');
   rows+='<tr class="tr-flex-row"><th scope="row">Flex Time Taken:</th>'+indices.map(i=>'<td>'+(canEdit?'<input id="trFlex'+i+'" type="number" min="0" max="24" step="0.0001" value="'+esc(days[i].flexTaken||'')+'" aria-label="Flex time taken on '+esc(days[i].date)+'">':n(data.days[i].flexTaken))+'</td>').join('')+'</tr>';
   rows+=metric('Total Hours for Day:','totalHours','trTotal')+metric('Flex Hours Earned:','flexEarned','trDailyEarned');
   rows+='<tr><th scope="row">Additional Day:</th>'+indices.map(i=>'<td id="trAdditional'+i+'">'+(data.days[i].additionalDay?'<span class="tr-extra-day">Manager enters payment separately</span>':'—')+'</td>').join('')+'</tr>';
   rows+='<tr><th scope="row">Daily Remarks:</th>'+indices.map(i=>'<td>'+(canEdit?'<textarea id="trNote'+i+'" rows="2" maxlength="2000" aria-label="Remarks for '+esc(days[i].date)+'">'+esc(days[i].remarks)+'</textarea>':esc(days[i].remarks||'—'))+'</td>').join('')+'</tr>';
   const total=T.totals(indices.map(i=>data.days[i]));
   return '<section class="tr-week"><div class="tr-scroll"><table class="tr-sheet-table">'+heading+'<tbody>'+rows+'</tbody></table></div><dl class="tr-week-totals"><div><dt>Total Worked:</dt><dd id="trWeekWorked'+w+'">'+n(total.worked)+'</dd></div><div><dt>Total Flex Time Taken:</dt><dd id="trWeekTaken'+w+'">'+n(total.taken)+'</dd></div><div><dt>Standard Days:</dt><dd id="trWeekDays'+w+'">'+(total.rostered/(E.STANDARD_WEEKLY_HOURS/5)).toFixed(2)+'</dd></div><div><dt>Flex Hours Earned:</dt><dd id="trWeekEarned'+w+'">'+n(total.earned)+'</dd></div></dl></section>';
  }).join('');
 }
 function sheetHtml(t,c,data,canEdit){
  return context(t,c,data)+'<section class="tr-record-sheet"><header class="tr-sheet-toolbar"><h3>Personal Record Sheet</h3><div class="controls">'+button('trPrev','‹ Previous','secondary')+'<label class="tr-week-selector">Week<select id="trWeek"><option value="0">1 of 2</option><option value="1">2 of 2</option></select></label>'+button('trNext','Next ›','secondary')+button('trViewAll',allWeeks?'View One Week':'View All','secondary')+'</div></header><div id="trWeeks">'+weeksHtml(data,canEdit)+'</div>'+(canEdit?button('trAddPair','Add On/Off Pair','secondary'):'')+'<div class="tr-period-remarks"><strong>Remarks:</strong>'+(canEdit?'<textarea id="trRemarks" rows="3" maxlength="20000" aria-label="Period remarks">'+esc(remarks)+'</textarea>':'<span>'+esc(remarks||'—')+'</span>')+'</div></section>';
 }
 function refreshMetrics(){
  collect();try{const data=summary();$('trLocalError').textContent='';for(const [id,key]of [['trCarry','carried'],['trEarned','earned'],['trTaken','taken'],['trClosing','closing'],['trExcess','excess']])if($(id))$(id).textContent=n(data[key]);
   data.days.forEach((d,i)=>{for(const [prefix,key]of [['trRoster','rosteredHours'],['trWorked','workedHours'],['trBreak','breakHours'],['trTotal','totalHours'],['trDailyEarned','flexEarned']])if($(prefix+i))$(prefix+i).textContent=n(d[key]);if($('trAdditional'+i))$('trAdditional'+i).innerHTML=d.additionalDay?'<span class="tr-extra-day">Manager enters payment separately</span>':'—';});
   for(let w=0;w<2;w++){const total=T.totals(data.days.slice(w*7,w*7+7));for(const [prefix,value]of [['trWeekWorked',n(total.worked)],['trWeekTaken',n(total.taken)],['trWeekDays',(total.rostered/(E.STANDARD_WEEKLY_HOURS/5)).toFixed(2)],['trWeekEarned',n(total.earned)]])if($(prefix+w))$(prefix+w).textContent=value;}
  }catch(e){$('trLocalError').textContent=e.message;}
 }
 function bindSheet(){
  if($('trWeek'))$('trWeek').value=String(week);
  if($('trPrev'))$('trPrev').disabled=week===0&&!allWeeks;if($('trNext'))$('trNext').disabled=week===1&&!allWeeks;
  const go=value=>{collect();week=value;allWeeks=false;render();};
  click('trPrev',()=>go(Math.max(0,week-1)));click('trNext',()=>go(Math.min(1,week+1)));change('trWeek',()=>go(Number(v('trWeek'))));click('trViewAll',()=>{collect();allWeeks=!allWeeks;render();});
  click('trAddPair',()=>{collect();const indices=allWeeks?Array.from({length:14},(_,i)=>i):Array.from({length:7},(_,i)=>week*7+i);if(indices.some(i=>days[i].blocks.length>=6))throw Error('At most six work periods per day.');indices.forEach(i=>days[i].blocks.push({start:'',finish:''}));render();});
  if(editable())$(container).querySelectorAll('.tr-record-sheet input,.tr-record-sheet textarea').forEach(input=>input.addEventListener('input',refreshMetrics));
 }
 function print(){
  collect();const t=recordForPreview();if(!T.timesheets(s(),u(),area).some(x=>x.id===activeRecord?.id)&&!(area==='ess'&&!activeRecord))throw Error('This time record is no longer in your scope.');
  const c=E.cycleById(Number(period)),data=summary(),oldAll=allWeeks;allWeeks=true;let html='<article class="tr-print"><h1>Time and Flex Record</h1>'+sheetHtml(t,c,data,false)+(t.decidedBy?'<p>Reviewed by '+esc(E.employeeName(employee(t.decidedBy)||{}))+' · '+esc(t.decidedAt)+' · '+esc(t.comment||'')+'</p>':'')+'</article>';allWeeks=oldAll;
  html=html.replace(/id="[^"]*"/g,'');const target=$('printArea');target.innerHTML=html;target.querySelectorAll('button,select,.tr-sheet-toolbar .controls').forEach(el=>el.remove());(o.window||g).print();
 }
 function render(){
  const all=T.timesheets(s(),u(),area),own=area==='ess',pending=page==='approvals';
  if(!own){
   const records=pending?all.filter(t=>t.status==='Awaiting Manager Approval'):all,t=records.find(t=>t.id===editing);
   put('<h2>'+(pending?'Timesheet Approvals':'Timesheet Manager')+'</h2><p>Time and flex records do not process payments.</p>'+table(['Employee','Period','Hours Worked','Status','Action'],records.map(t=>[esc(E.employeeName(employee(t.empId)||{})),esc(E.cycleDisplay(E.cycleById(t.cycleId))),n(T.summary(s(),t).worked),esc(status(t)),'<button data-ops-sheet="'+esc(t.id)+'">View Record</button>']))+'<div id="trReview"></div>');bind('data-ops-sheet',id=>{editing=id;loadKey='';render();});
   if(!t)return;const c=E.cycleById(Number(t.cycleId));load(t,c);const data=summary();$('trReview').innerHTML='<p id="trLocalError" class="error-text" role="alert"></p>'+sheetHtml(t,c,data,false)+button('trPrint','Print / Save PDF','secondary')+(t.comment?'<p>Decision comment: '+esc(t.comment)+'</p>':'')+(t.status==='Awaiting Manager Approval'&&area==='mss'?'<label>Decision comment<textarea id="opsDecision" rows="3"></textarea></label><div class="controls">'+button('opsApprove','Approve')+button('opsDeny','Deny','danger')+'</div>':'');bindSheet();click('trPrint',print);
   for(const [id,status]of [['opsApprove','Approved'],['opsDeny','Denied']])click(id,()=>{mutate(st=>T.approveTimesheet(st,u(),t.id,status,v('opsDecision')));loadKey='';render();});return;
  }
  period=period||String(E.currentCycle(s()).id);const c=E.cycleById(Number(period)),record=all.find(t=>Number(t.cycleId)===c.id);load(record,c);
  let data;try{data=summary();}catch(e){data=T.summary(s(),{empId:u(),cycleId:c.id,status:'Draft',days:[]});}
  const person=employee(u()),cycles=E.PAY_CYCLES.filter(c=>c.id<=E.currentCycle(s()).id+1&&(E.isEmployedInCycle(person,c)||all.some(t=>Number(t.cycleId)===c.id)));
  put('<h2>Timesheets</h2><p class="tr-purpose">Record actual work and breaks. Timesheets never change pay. Enter breaks by switching Off, then On when returning. Work across midnight is recorded against its start day. Your manager must enter any payable additional days separately in Additional Earnings.</p><label class="tr-period-picker">Fortnight<select id="opsCycle">'+cycles.map(c=>'<option value="'+c.id+'">'+esc(E.cycleDisplay(c))+'</option>').join('')+'</select></label>'+(record?.needsTimeDetails?'<p class="tr-legacy-note">The earlier hours-only record is retained for reference. Enter actual On/Off times and submit this record again.</p>':'')+'<p id="trLocalError" class="error-text" role="alert"></p>'+sheetHtml(recordForPreview(),c,data,editable())+'<div class="controls tr-actions">'+(editable()?button('opsDraft','Save Draft')+button('opsSubmit','Submit for Approval'):'')+(record&&['Draft','Denied','Awaiting Manager Approval'].includes(record.status)?button('opsWithdraw','Withdraw Timesheet','secondary'):'')+button('trPrint','Print / Save PDF','secondary')+'</div>'+(record?.comment?'<p>Comment: '+esc(record.comment)+'</p>':'')+'<h3>My Time Records</h3>'+table(['Fortnight','Hours Worked','Flex Earned','Status','Action'],all.map(t=>{const sum=T.summary(s(),t);return [esc(E.cycleDisplay(E.cycleById(t.cycleId))),n(sum.worked),n(sum.earned),esc(status(t)),'<button data-tr-cycle="'+t.cycleId+'">View</button>'];})));
  $('opsCycle').value=period;change('opsCycle',()=>{period=v('opsCycle');loadKey='';render();});bind('data-tr-cycle',id=>{period=id;loadKey='';render();});bindSheet();click('trPrint',print);
  for(const [id,submit]of [['opsDraft',false],['opsSubmit',true]])click(id,()=>{collect();mutate(st=>T.saveTimesheet(st,u(),{id:activeRecord?.id,cycleId:Number(period),days,remarks},submit));loadKey='';render();});
  click('opsWithdraw',()=>{mutate(st=>T.withdrawTimesheet(st,u(),record.id));loadKey='';render();});
 }
 return {mount(id,mode='ess',newPage='timesheets'){container=id;area=mode;page=newPage;period='';editing='';loadKey='';render();},render};
}
const api={createUI};g.TimeRecordsUI=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
