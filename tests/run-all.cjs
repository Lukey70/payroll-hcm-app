'use strict';
const {spawnSync}=require('child_process'),path=require('path');
const suites=['test-cases.js','tests/payment-details-v140.test.js','tests/self-service-v121.test.js','tests/support-v122.test.js','tests/update-v123.test.js','tests/update-v124.test.js','tests/request-template-rules.test.js','tests/dashboard.test.js','tests/absence-balance-cards.test.js','tests/pay-errors-report.test.js','tests/operations.test.js','tests/urgent-pay.test.js','tests/casual-rehire.test.js','tests/time-records.test.js','tests/termination-leave-recovery.test.js','tests/approval-recovery-search.test.js','tests/cease-pay.test.js','tests/concurrent-jobs.test.js'];
for(const file of suites){const result=spawnSync(process.execPath,['--require',path.join(__dirname,'fixed-date.cjs'),path.join(__dirname,'..',file)],{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);}
console.log('PASS: all eighteen Node.js payroll regression suites.');
