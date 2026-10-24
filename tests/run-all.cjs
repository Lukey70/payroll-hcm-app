'use strict';
const {spawnSync}=require('child_process'),path=require('path');
const suites=['test-cases.js','tests/payment-details-v140.test.js','tests/self-service-v121.test.js','tests/support-v122.test.js','tests/update-v123.test.js','tests/update-v124.test.js','tests/request-template-rules.test.js'];
for(const file of suites){const result=spawnSync(process.execPath,[path.join(__dirname,'..',file)],{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);}
console.log('PASS: all seven Node.js payroll regression suites.');
