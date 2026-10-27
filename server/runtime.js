const sandbox = ['test', 'preview'].includes(process.env.SCHA_ENV) && process.env.VERCEL_ENV !== 'production';
module.exports = { sandbox };
