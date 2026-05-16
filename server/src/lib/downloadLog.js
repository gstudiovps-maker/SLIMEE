export function logDownload(step, data = {}) {
  const payload = {
    at: new Date().toISOString(),
    ...data
  };
  console.log(`[downloads] ${step}`, JSON.stringify(payload));
}

export function logDownloadFile(step, statusCode, data = {}) {
  logDownload(step, {
    responseStatusCode: statusCode,
    ...data
  });
}
