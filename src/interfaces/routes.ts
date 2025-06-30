import { Router } from 'express';
import { register } from 'prom-client';
import { Gauge, collectDefaultMetrics } from 'prom-client';

const router = Router();

collectDefaultMetrics();

const memoryUsageGauge = new Gauge({
  name: 'nodejs_process_memory_rss_bytes',
  help: 'Resident set size memory used by process in bytes',
});
const cpuUsageGauge = new Gauge({
  name: 'nodejs_process_cpu_percent',
  help: 'CPU usage percent by process',
});

setInterval(() => {
  const mem = process.memoryUsage();
  memoryUsageGauge.set(mem.rss);
  const cpu = process.cpuUsage();
  const uptime = process.uptime();
  const totalCpu = (cpu.user + cpu.system) / 1000; // ms
  const cpuPercent = uptime > 0 ? (totalCpu / (uptime * 1000)) * 100 : 0;
  cpuUsageGauge.set(cpuPercent);
}, 5000);

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check
 *     responses:
 *       200:
 *         description: Ok
 */
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'cliente-processor'
  });
});

/**
 * @swagger
 * /metrics:
 *   get:
 *     summary: Prometheus Metrics
 *     responses:
 *       200:
 *         description: Metrics in Prometheus format
 */
router.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo métricas' });
  }
});

export default router;