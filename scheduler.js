const CronJob = require('cron').CronJob;
const main = require('./main');

const FRITZ_BOX_HOST = process.env.FRITZ_BOX_HOST || 'fritz.box';
const CONNECT_BOX_HOST = process.env.CONNECT_BOX_HOST || '192.168.0.1';
const CONNECT_BOX_PASSWORD = process.env.CONNECT_BOX_PASSWORD;
const RUN_ON_START = process.env.RUN_ON_START !== undefined ? process.env.RUN_ON_START : true;
const RUN_SCHEDULED = process.env.RUN_SCHEDULED !== undefined ? process.env.RUN_SCHEDULED : true;
const CRON_TIME = process.env.CRON_TIME || '0 */5 * * * *';

console.log(`Configuration:
  Fritz!Box host: ${FRITZ_BOX_HOST}
  Connect Box host: ${CONNECT_BOX_HOST}
  Connect Box password: ${CONNECT_BOX_PASSWORD !== undefined ? '[password supplied]' : '[no password supplied]'}
  Run on start: ${RUN_ON_START}
  Run scheduled: ${RUN_SCHEDULED}${RUN_SCHEDULED && '\n  Cron time: ' + CRON_TIME}
`);

let mainRunning = false;
async function run() {
    mainRunning = true;
    try {
        await main(FRITZ_BOX_HOST, CONNECT_BOX_HOST, CONNECT_BOX_PASSWORD);
    } catch(err) {
        console.log(err);
    }
    mainRunning = false;
}

if (RUN_ON_START) {
    console.log('[scheduler] Running main.js on start:');
    run();
}

if (RUN_SCHEDULED) {
    new CronJob(CRON_TIME, async function() {
        if (mainRunning) {
            console.log('[scheduler] main.js is already running, skipping scheduled run at ' + new Date().toISOString() + '.');
        } else {
            console.log('[scheduler] Running main.js at ' + new Date().toISOString() + ':');
            run();
        }
    }).start();
}
