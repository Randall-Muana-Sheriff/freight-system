// Every access-log line (server.js's requestContext + the JSON logger
// wired up there) already carries a requestId. Error logs previously
// never did — they were a bare `console.error('Database Error:', msg)`
// with nothing tying that log line back to which request triggered it,
// which matters a lot once there's more than one request in flight, or
// once these logs are shipped somewhere and read out of order (an
// external log aggregator, or a container orchestrator interleaving
// output from multiple replicas).
export function logError(req, label, error) {
    const requestId = req?.requestId || 'no-request-id';
    console.error(`❌ [${requestId}] ${label}:`, error?.stack || error?.message || error);
}
