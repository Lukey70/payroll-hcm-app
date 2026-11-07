// Keep fixture-driven Node tests independent of the machine's current date.
const RealDate=Date;
global.Date=class extends RealDate{
 constructor(...args){super(...(args.length?args:['2026-10-24T04:00:00+08:00']));}
 static now(){return new RealDate('2026-10-24T04:00:00+08:00').getTime();}
};
