import pino from 'pino';

export const logger = pino({ level: 'info', redact: ['req', 'headers', 'body', 'email', 'deviceIp', 'entryLocation', 'beforeData', 'afterData'] });