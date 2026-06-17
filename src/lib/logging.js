const isProd = process.env.NODE_ENV === 'production';

const format = (level, event, data) => ({
  level,
  event,
  ts: new Date().toISOString(),
  ...(['string','number','boolean'].includes(typeof data) ? { message: String(data) } : (data || {})),
});

export const logInfo = (event, data) => {
  try {
    console.info(JSON.stringify(format('info', event, data)));
  } catch (e) {
    console.info(event, data);
  }
};

export const logWarn = (event, data) => {
  try {
    console.warn(JSON.stringify(format('warn', event, data)));
  } catch (e) {
    console.warn(event, data);
  }
};

export const logError = (event, data) => {
  try {
    const payload = format('error', event, {
      message: data?.message || String(data),
      stack: data?.stack,
    });
    console.error(JSON.stringify(payload));
  } catch (e) {
    console.error(event, data);
  }
};

const loggingApi = { logInfo, logWarn, logError };

export default loggingApi;
