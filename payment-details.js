(function(global){
  'use strict';
  function create(u){
    const {PAY_CYCLES,currentCycle,round2,uid,employeeName,fmtPay,isEmployedInCycle}=u;
    const list=(s,k)=>s[k]||(s[k]=[]);
    const text=x=>String(x==null?'':x).trim();
    function paymentEffectiveCycles(s){ return PAY_CYCLES.filter(c=>c.id>=currentCycle(s).id && !s.finalisedCycles?.[String(c.id)]); }
    function activePaymentRecord(s,kind,empId,date){
      return list(s,kind).filter(r=>r.empId===empId&&r.saved!==false&&r.effectiveDate<=date).slice().sort((a,b)=>b.effectiveDate.localeCompare(a.effectiveDate)||Number(b.effectiveSequence)-Number(a.effectiveSequence))[0]||null;
    }
    function validatePaymentRecord(s,kind,r){
      if(!list(s,'employees').some(e=>e.id===r.empId)) throw Error('Select an employee.');
      const old=list(s,kind).find(x=>x.id===r.id);
      if(old&&old.effectiveDate<currentCycle(s).start) throw Error('Previous pay period records are read-only.');
      if(!paymentEffectiveCycles(s).some(c=>c.start===r.effectiveDate)) throw Error('Effective Date must be the first day of the current or a future pay period.');
      if(!Number.isSafeInteger(Number(r.effectiveSequence))||Number(r.effectiveSequence)<0||text(r.effectiveSequence)==='') throw Error('Effective Sequence must be a non-negative whole number.');
      if(list(s,kind).some(x=>x.id!==r.id&&x.empId===r.empId&&x.effectiveDate===r.effectiveDate&&Number(x.effectiveSequence)===Number(r.effectiveSequence))) throw Error('This effective date and sequence already exists for this employee.');
    }
    function bankRecordValid(r){ return !!r&&/^\d{6}$/.test(text(r.bsb).replace(/-/g,''))&&/^\d+$/.test(text(r.accountNumber))&&!!text(r.accountName); }
    function savePaymentRecord(s,kind,r){
      validatePaymentRecord(s,kind,r);
      const out=Object.assign({},r,{id:r.id||uid(kind),effectiveSequence:Number(r.effectiveSequence),saved:true});
      if(kind==='bankDetails'){
        out.bsb=text(r.bsb).replace(/-/g,''); out.accountNumber=text(r.accountNumber); out.accountName=text(r.accountName);
        if(!bankRecordValid(out)) throw Error('Enter a six-digit BSB, a digits-only Account Number and an Account Name.');
      }else{
        const fund=list(s,'superFunds').find(f=>!f.deleted&&f.active!==false&&(r.fundId?f.id===r.fundId:text(f.usi)===text(r.usi)));
        if(!fund) throw Error('USI must identify an active super fund.');
        if(!text(r.memberNumber)) throw Error('Enter a Member Number.');
        out.fundId=fund.id; out.usi=fund.usi; out.memberNumber=text(r.memberNumber);
      }
      const rows=list(s,kind),index=rows.findIndex(x=>x.id===out.id);
      if(index<0) rows.push(out); else rows[index]=out;
      return out;
    }
    function saveSuperFund(s,r){
      const old=list(s,'superFunds').find(f=>f.id===r.id);
      if(r.id&&(!old||old.deleted)) throw Error('This fund no longer exists.');
      const out={id:r.id||uid('fund'),fundName:text(r.fundName),usi:text(r.usi),abn:text(r.abn).replace(/\s/g,''),active:r.active!==false,deleted:false};
      if(!out.fundName||!out.usi||!/^\d{11}$/.test(out.abn)) throw Error('Enter Super Fund Name, USI and an eleven-digit ABN.');
      if(list(s,'superFunds').some(f=>!f.deleted&&f.id!==out.id&&text(f.usi)===out.usi)) throw Error('USI already belongs to another super fund.');
      const index=list(s,'superFunds').findIndex(f=>f.id===out.id);
      if(index<0) s.superFunds.push(out); else s.superFunds[index]=out;
      return out;
    }
    function deleteSuperFund(s,id){ const f=list(s,'superFunds').find(f=>f.id===id); if(!f) throw Error('Fund not found.'); f.deleted=true; f.active=false; }
    function superAccountForCycle(s,empId,c){
      const r=activePaymentRecord(s,'superDetails',empId,c.start); if(!r) return null;
      const f=list(s,'superFunds').find(f=>f.id===r.fundId);
      return {fundId:r.fundId,fundName:f?.fundName||'',usi:f?.usi||r.usi||'',abn:f?.abn||'',memberNumber:r.memberNumber||'',effectiveDate:r.effectiveDate,effectiveSequence:r.effectiveSequence,valid:!!f&&!f.deleted&&f.active!==false&&!!text(r.memberNumber),fundStatus:!f?'Missing':f.deleted?'Deleted':f.active===false?'Inactive':'Active'};
    }
    function paymentDetailErrors(s,c,results=[]){
      const errors=[];
      list(s,'employees').filter(e=>isEmployedInCycle(e,c)||results.some(p=>p.empId===e.id)).forEach(e=>{
        const name=employeeName(e),a=superAccountForCycle(s,e.id,c),b=activePaymentRecord(s,'bankDetails',e.id,c.start);
        if(!a) errors.push(`${name} has no super fund listed for this pay period.`);
        else if(!a.valid) errors.push(`${name} has an invalid super account (${a.fundStatus} fund or missing Member Number).`);
        if(!bankRecordValid(b)) errors.push(`${name} has missing or incomplete Bank Details for this pay period.`);
      }); return errors;
    }
    function paymentPayslipFields(s,e,c,net,superAmt,pre,post,finalised){
      const account=superAccountForCycle(s,e.id,c);
      const sum=(lines,description)=>round2(lines.filter(d=>d.description===description).reduce((t,d)=>t+Number(d.amount||0),0));
      const fields={superAccountSnapshot:account,superContributions:{account,employer:round2(superAmt),preTax:sum(pre,'Pre-tax Super Deduction'),postTax:sum(post,'Post-Tax Super Deduction')}};
      if(finalised){
        const b=activePaymentRecord(s,'bankDetails',e.id,c.start);
        fields.bankAccountSnapshot=b?JSON.parse(JSON.stringify(b)):null;
        fields.disbursements=bankRecordValid(b)&&net>0?[{bsb:b.bsb,accountNumber:b.accountNumber,amount:round2(net)}]:[];
      } return fields;
    }
    function superContributionReport(s,cycleId){
      const c=PAY_CYCLES.find(c=>c.id===Number(cycleId)); if(!c) return [];
      const pays=s.finalisedCycles?.[String(c.id)]?list(s,'payslips').filter(p=>Number(p.cycleId)===c.id):(s.payResults?.[String(c.id)]||[]);
      const groups=new Map();
      pays.forEach(p=>{
        const v=p.superContributions;if(!v) return;
        const a=v.account,key=[p.empId,a?.fundId,a?.memberNumber].join('|');
        if(!groups.has(key)) groups.set(key,{empId:p.empId,employeeName:p.employeeName,account:a,employer:0,preTax:0,postTax:0});
        const g=groups.get(key); ['employer','preTax','postTax'].forEach(k=>g[k]=round2(g[k]+Number(v[k]||0)));
      }); return [...groups.values()].map(g=>Object.assign(g,{total:round2(g.employer+g.preTax+g.postTax)}));
    }
    function validateRecoveryDeduction(d){
      if(d.deductionType!=='Recovery Deduction') return;
      if(!Number.isFinite(Number(d.openingDebt))||round2(Number(d.openingDebt))<=0||!Number.isFinite(Number(d.amount))||round2(Number(d.amount))<=0||text(d.percentage)!=='') throw Error('Recovery Deduction requires positive Opening Debt and fixed repayment Amount of at least one cent, with no Percentage.');
    }
    function recoveryBalance(s,d,asOfCycleId=Infinity){
      const repaid=round2(list(s,'recoveryRepayments').filter(x=>x.deductionId===d.id&&Number(x.cycleId)<Number(asOfCycleId)).reduce((t,x)=>t+Number(x.amount||0),0));
      return {opening:round2(Number(d.openingDebt||0)),repaid,remaining:round2(Math.max(0,Number(d.openingDebt||0)-repaid))};
    }
    function recoveryDeductionLines(s,active,c,available){
      let budget=round2(Math.max(0,available)); const lines=[];
      active.filter(d=>d.deductionType==='Recovery Deduction').slice().sort((a,b)=>String(a.startDate).localeCompare(String(b.startDate))||String(a.id).localeCompare(String(b.id))).forEach(d=>{
        try{validateRecoveryDeduction(d);}catch(_){return;}
        const amount=round2(Math.min(budget,recoveryBalance(s,d,c.id).remaining,Number(d.amount)));
        if(amount>0){lines.push({id:d.id,description:'Recovery Deduction',amount,basis:'amount'});budget=round2(budget-amount);}
      }); return lines;
    }
    function commitRecoveryRepayments(s,c,pays){
      const totals=new Map();
      pays.forEach(p=>(p.postTaxDeductions||[]).filter(d=>d.description==='Recovery Deduction').forEach(d=>totals.set(d.id,round2((totals.get(d.id)||0)+Number(d.amount||0)))));
      totals.forEach((amount,id)=>{if(amount>0&&!list(s,'recoveryRepayments').some(x=>x.deductionId===id&&Number(x.cycleId)===c.id))s.recoveryRepayments.push({id:uid('repayment'),deductionId:id,cycleId:c.id,amount});});
    }
    function ensurePendingLeaveNotifications(s,now=new Date()){
      const stamp=new Date(now).toISOString(),nowMs=Date.parse(stamp);let added=0;
      list(s,'leaveBookings').forEach(l=>{
        if(l.status!=='Awaiting Manager Approval'){l.pendingApprovalSince='';l.pendingApprovalNotifiedSince='';return;}
        if(!Number.isFinite(Date.parse(l.pendingApprovalSince))){
          const history=(Array.isArray(l.statusHistory)?l.statusHistory:[]).slice().reverse();
          let since='';for(const h of history){if(h.status!=='Awaiting Manager Approval')break;if(Number.isFinite(Date.parse(h.changedAt)))since=h.changedAt;}
          l.pendingApprovalSince=since||stamp;
        }
        if(nowMs-Date.parse(l.pendingApprovalSince)<=3*86400000||l.pendingApprovalNotifiedSince===l.pendingApprovalSince)return;
        const e=list(s,'employees').find(e=>e.id===l.empId)||{};
        list(s,'alerts').push({id:uid('alert'),empId:l.empId,type:'Leave Approval Reminder',date:stamp.slice(0,10),message:`${employeeName(e)}: ${l.confidential?'Private Leave':l.type} ${fmtPay(l.startDate)} - ${fmtPay(l.endDate)} has been Awaiting Manager Approval for more than 3 days.`,read:false,action:{tab:'leave',empId:l.empId},leaveId:l.id,pendingSince:l.pendingApprovalSince});
        l.pendingApprovalNotifiedSince=l.pendingApprovalSince;added++;
      });return added;
    }
    return {paymentEffectiveCycles,activePaymentRecord,bankRecordValid,saveBankDetails:(s,r)=>savePaymentRecord(s,'bankDetails',r),saveEmployeeSuper:(s,r)=>savePaymentRecord(s,'superDetails',r),saveSuperFund,deleteSuperFund,superAccountForCycle,paymentDetailErrors,paymentPayslipFields,superContributionReport,validateRecoveryDeduction,recoveryBalance,recoveryDeductionLines,commitRecoveryRepayments,ensurePendingLeaveNotifications};
  }
  global.PaymentDetails={create};if(typeof module!=='undefined')module.exports={create};
})(typeof window!=='undefined'?window:globalThis);
