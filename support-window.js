(function(){
 'use strict';
 const E=PayrollEngine,S=E.selfService,root=document.getElementById('support');let ui=null,actorId='',locked=false,stamp='';
 function host(){
  if(!window.opener||window.opener.closed)throw Error('The main payroll window is closed. Open this window again from Payroll Management.');
  const app=window.opener.PayrollApp;if(!app||!app.supportWindowAccess(actorId||undefined))throw Error('Sign in to the main app with Payroll Management access, then open Support Requests in a new window.');return app;
 }
 function lock(message){locked=true;root.innerHTML='<section class="support-window-notice"><h1>Payroll session unavailable</h1><p></p><p>Open this window again from Payroll Management to continue.</p></section>';root.querySelector('p').textContent=message;document.getElementById('supportWindowUser').textContent='';}
 function revision(s){return JSON.stringify([(s.supportRequests||[]).map(c=>[c.id,c.updatedAt,c.status,c.assignedTo,c.messages?.length,c.timerStartedAt]),(s.employees||[]).map(e=>[e.id,e.firstName,e.lastName,e.status])]);}
 function start(caseId){
  const app=host();actorId=app.getState().employees.find(e=>app.supportWindowAccess(e.id))?.id||'';if(!actorId)throw Error('Payroll Management access is required.');locked=false;
  document.getElementById('supportWindowUser').textContent=E.employeeName(app.getState().employees.find(e=>e.id===actorId));
  ui=SupportRequests.createUI({E,S,getState:()=>host().getState(),getUser:()=>{host();return actorId;},esc:PayrollUI.esc,reportError:message=>PayrollUI.error(message),onChange:()=>host().commitSupportWindowChanges(actorId)});
  ui.mount('support',{mode:'payroll',caseId});stamp=revision(app.getState());
 }
 function navigate(caseId=''){try{if(locked||!ui){actorId='';start(caseId);}else{host();ui.navigate(caseId);}window.focus();}catch(e){if(locked)lock(e.message);else PayrollUI.error(e.message);}}
 document.getElementById('supportWindowClose').addEventListener('click',()=>window.close());
 window.PayrollSupportWindow={navigate,lock};
 try{start(new URLSearchParams(window.location.search).get('case')||'');}catch(e){lock(e.message);}
 setInterval(()=>{if(locked)return;try{const next=revision(host().getState());if(next!==stamp&&ui.refresh())stamp=next;}catch(e){lock(e.message);}},1000);
 window.addEventListener('beforeunload',event=>{if(!locked&&ui?.hasDraft()){event.preventDefault();event.returnValue='';}});
})();
