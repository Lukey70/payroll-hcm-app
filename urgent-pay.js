(function(g){
'use strict';
function create(E,S){
 const clone=x=>JSON.parse(JSON.stringify(x)),today=()=>E.iso(new Date()),stamp=()=>new Date().toISOString();
 const key=d=>JSON.stringify(Object.keys(d||{}).sort().map(k=>[k,d[k]]));
 function payroll(s,id,date=today()){if(!S.profile(s,id,date).payroll)throw Error('Payroll Management access is required.');}
 function locked(s,d){return !!d&&(!!d.urgentPayBatchId||(s.urgentPayBatches||[]).some(b=>(b.entries||[]).some(e=>e.deductionId===d.id)));}
 function validateDeduction(s,d,old){
  if(old&&locked(s,old)&&key(old)!==key(d))throw Error('Processed Urgent Pay deductions cannot be changed or deleted.');
  if(d.deductionType!=='Urgent Pay')return;
  if(d.deleted===true)return;
  const c=E.PAY_CYCLES.find(c=>c.start===d.startDate);
  if(!c||d.endDate!==c.end)throw Error('Urgent Pay must apply to exactly one pay period.');
  if(!old&&E.isFinalised(s,c))throw Error('Urgent Pay cannot be added to a finalised pay period.');
  if(d.percentage!==''&&d.percentage!=null)throw Error('Urgent Pay is a fixed post-tax amount, not a percentage.');
  const amount=Number(d.amount);
  if(d.amount===''||typeof d.amount==='boolean'||!Number.isFinite(amount)||amount<=0||amount>999999999||Math.abs(amount*100-Math.round(amount*100))>0.00001)throw Error('Enter a positive Urgent Pay amount with at most two decimal places.');
 }
 function validateDraftSet(s,empId,drafts){
  if(new Set(drafts.map(d=>d.id)).size!==drafts.length)throw Error('Duplicate deduction records cannot be saved.');
  const old=(s.deductions||[]).filter(d=>d.empId===empId),byId=new Map(old.map(d=>[d.id,d]));
  for(const row of old)if(locked(s,row)){const next=drafts.find(d=>d.id===row.id);if(!next||key(row)!==key(next))throw Error('Processed Urgent Pay deductions cannot be changed or deleted. Reload this employee’s deductions.');}
  for(const d of drafts)if(d.empId===empId)validateDeduction(s,d,byId.get(d.id));
 }
 function pending(s,cycleId){const c=E.cycleById(Number(cycleId));return(s.deductions||[]).filter(d=>d.deductionType==='Urgent Pay'&&d.saved!==false&&!d.deleted&&!locked(s,d)&&d.startDate===c?.start);}
 function preview(s,id,cycleId,paymentDate,date=today()){
  payroll(s,id,date);const c=E.PAY_CYCLES.find(c=>c.id===Number(cycleId));
  if(!c||E.isFinalised(s,c)||c.id<E.currentCycle(s).id)throw Error('Select the current or a future open pay period.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate||'')||E.iso(E.parseDate(paymentDate))!==paymentDate||paymentDate<date)throw Error('Payment date must be today or a future date.');
  const source=pending(s,c.id);if(!source.length)throw Error('There are no saved, unprocessed Urgent Pay deductions for this pay period.');
  if(new Set(source.map(d=>d.id)).size!==source.length)throw Error('Duplicate Urgent Pay deduction IDs must be corrected before processing.');
  const entries=[],copy=clone(s),payCache=new Map();
  for(const d of source){
   validateDeduction(s,d,d);const e=s.employees.find(e=>e.id===d.empId);if(!e)throw Error('An Urgent Pay deduction has no employee.');
   const bank=E.activePaymentRecord(s,'bankDetails',e.id,paymentDate);if(!E.bankRecordValid(bank))throw Error(E.employeeName(e)+' ('+e.id+') has no valid bank account for the payment date.');
   if(!payCache.has(e.id)){const pays=E.calculateEmployee(copy,e.id,c.id,false);payCache.set(e.id,pays.reduce((n,p)=>n+Number(p.net||0),0));}
   if(payCache.get(e.id)<-0.004)throw Error(E.employeeName(e)+' ('+e.id+'): Urgent Pay and other deductions exceed the available regular net pay.');
   entries.push({deductionId:d.id,empId:e.id,employeeName:E.employeeName(e),amount:E.round2(Number(d.amount)),bsb:String(bank.bsb).replace(/-/g,''),accountNumber:String(bank.accountNumber),accountName:String(bank.accountName)});
  }
  entries.sort((a,b)=>a.empId.localeCompare(b.empId)||a.deductionId.localeCompare(b.deductionId));
  const total=E.round2(entries.reduce((n,e)=>n+e.amount,0)),signature=JSON.stringify([Number(c.id),paymentDate,entries,source.map(key).sort()]);
  return {cycleId:c.id,paymentDate,entries,total,signature};
 }
 function run(s,id,cycleId,paymentDate,signature,date=today()){
  const p=preview(s,id,cycleId,paymentDate,date);if(signature!==p.signature)throw Error('The deductions or bank details changed. Preview the urgent pay cycle again.');
  const number='UP'+String(Math.max(Number(s.urgentPaySequence)||0,...(s.urgentPayBatches||[]).map(b=>Number(String(b.number||'').replace(/^UP/,''))||0))+1).padStart(7,'0'),at=stamp();
  const batch={id:'urgent_'+number,number,cycleId:p.cycleId,paymentDate,createdAt:at,createdBy:id,status:'File Generated',total:p.total,entries:p.entries.map((e,i)=>({...e,reference:number+'-'+String(i+1).padStart(3,'0')}))};
  (s.urgentPayBatches||(s.urgentPayBatches=[])).push(batch);s.urgentPaySequence=Number(number.slice(2));
  for(const entry of batch.entries){const d=s.deductions.find(d=>d.id===entry.deductionId);d.urgentPayBatchId=batch.id;d.urgentPayProcessedAt=at;}
  (s.auditLog||(s.auditLog=[])).unshift(at+' — '+id+': Generated urgent pay batch '+number+' for '+batch.entries.length+' payments, total '+E.money(batch.total));
  return batch;
 }
 function csv(s,id,batchId,date=today()){
  payroll(s,id,date);const b=(s.urgentPayBatches||[]).find(b=>b.id===batchId);if(!b)throw Error('Urgent pay batch not found.');
  const q=value=>'"'+String(value).replace(/"/g,'""')+'"';
  return [['BSB','Account Number','Account Name','Amount','Reference'],...b.entries.map(e=>[e.bsb,e.accountNumber,e.accountName,Number(e.amount).toFixed(2),e.reference])].map(row=>row.map(q).join(',')).join('\r\n')+'\r\n';
 }
 function finalisationCheck(s,c){
  const unprocessed=pending(s,c.id);if(unprocessed.length)throw Error('Run the urgent pay cycle in Settings before finalising this pay, or remove the unprocessed Urgent Pay deductions.');
  for(const d of s.deductions||[])if(d.deductionType==='Urgent Pay'&&!d.deleted&&d.saved!==false&&d.startDate===c.start)validateDeduction(s,d,d);
 }
 return {locked,validateDeduction,validateDraftSet,pending,preview,run,csv,finalisationCheck};
}
function createUI(o){
 const {E,getState,getUser,onChange,reportError}=o,U=E.urgentPay,doc=o.document||g.document,$=id=>doc.getElementById(id),s=()=>getState(),u=()=>getUser(),v=id=>$(id)?.value||'',esc=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');let container='',preview=null;
 const table=(headers,rows)=>'<div class="table-wrap"><table><thead><tr>'+headers.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
 function click(id,fn){$(id)?.addEventListener('click',()=>{try{fn();}catch(e){reportError(e.message);}});}
 function mutate(fn){const state=s(),before=JSON.parse(JSON.stringify(state));try{const result=fn(state);onChange();return result;}catch(e){Object.keys(state).forEach(k=>delete state[k]);Object.assign(state,before);throw e;}}
 function download(batchId){const content=U.csv(s(),u(),batchId),batch=s().urgentPayBatches.find(b=>b.id===batchId),url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'})),a=doc.createElement('a');a.href=url;a.download='Urgent-Pay-'+batch.number+'-'+batch.paymentDate+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 function render(){if(!E.selfService.profile(s(),u()).payroll)throw Error('Payroll Management access is required.');preview=null;
  $(container).innerHTML='<h3>Urgent Pay Cycle</h3><p>Collect saved Urgent Pay deductions for one pay period. Running creates a CSV file and locks the deductions. Upload the file through your bank separately. No separate payslips are generated.</p><div class="grid form-grid"><label>Deduction pay period<select id="urgentCycle">'+E.PAY_CYCLES.filter(c=>c.id>=E.currentCycle(s()).id&&!E.isFinalised(s(),c)).map(c=>'<option value="'+c.id+'">'+esc(E.cycleDisplay(c))+'</option>').join('')+'</select></label><label>Payment date<input id="urgentDate" type="date" value="'+E.iso(new Date())+'"></label></div><button id="urgentPreview">Preview Urgent Pay</button><div id="urgentPreviewOutput"></div><h3>Urgent Pay Batch History</h3>'+table(['Batch','Created','Payment date','Period','Payments','Total','Status','File'],(s().urgentPayBatches||[]).slice().reverse().map(b=>[esc(b.number),esc(new Date(b.createdAt).toLocaleString('en-AU',{timeZone:'Australia/Perth'})),E.fmtPay(b.paymentDate),esc(E.ppeLabel(E.cycleById(b.cycleId))),b.entries.length,E.money(b.total),esc(b.status),'<button data-urgent-download="'+esc(b.id)+'">Download Same CSV</button>']));
  click('urgentPreview',()=>{preview=U.preview(s(),u(),Number(v('urgentCycle')),v('urgentDate'));$('urgentPreviewOutput').innerHTML=table(['Employee','Employee ID','BSB','Account number','Account name','Amount'],preview.entries.map(e=>[esc(e.employeeName),esc(e.empId),esc(e.bsb),esc(e.accountNumber),esc(e.accountName),E.money(e.amount)]))+'<p>Total: <strong>'+E.money(preview.total)+'</strong></p><button id="urgentRun">Run Urgent Pay Cycle &amp; Download CSV</button>';click('urgentRun',()=>{const batch=mutate(state=>U.run(state,u(),Number(v('urgentCycle')),v('urgentDate'),preview?.signature));render();download(batch.id);});});
  for(const id of ['urgentCycle','urgentDate'])$(id)?.addEventListener('change',()=>{preview=null;$('urgentPreviewOutput').innerHTML='';});
  $(container).querySelectorAll('[data-urgent-download]').forEach(b=>b.addEventListener('click',()=>{try{download(b.getAttribute('data-urgent-download'));}catch(e){reportError(e.message);}}));
 }
 return {mount(id){container=id;render();},render};
}
const api={create,createUI};g.UrgentPay=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
