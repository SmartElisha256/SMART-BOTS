# Load Test Plan for ELISHA SPORTS BOT

## Objective

Target: **5 requests per second** with:
- 100 concurrent users
- Test duration: 5 minutes
- Response time: < 500ms for 95th percentile
- Error rate: < 1%

**Status:** This plan defines the target. Actual performance has NOT been tested unless you run this script with real infrastructure.

## Prerequisites

- k6 (load testing tool): https://k6.io/docs/getting-started/installation/
- Running ELISHA SPORTS BOT instance
- Test database with sample users

## Test Script

Create `k6-load-test.js`:

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '30s', target: 10 },   // Ramp up to 10 users
    { duration: '2m', target: 100 },   // Ramp up to 100 users
    { duration: '2m', target: 100 },   // Stay at 100 users
    { duration: '30s', target: 0 }     // Ramp down
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500', 'p(99)<1000'],
    'http_req_failed': ['rate<0.01'],
    'errors': ['rate<0.01']
  }
};

export default function () {
  // Test health endpoint
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, {
    'health status is 200': (r) => r.status === 200,
    'health response time < 100ms': (r) => r.timings.duration < 100
  }) || errorRate.add(1);

  // Test readiness endpoint
  const readyRes = http.get(`${BASE_URL}/health/ready`);
  check(readyRes, {
    'ready status is 200': (r) => r.status === 200,
    'ready response time < 200ms': (r) => r.timings.duration < 200
  }) || errorRate.add(1);

  // Simulate webhook message
  const payload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '123456789',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              messages: [
                {
                  id: `msg-${Date.now()}`,
                  from: `${1000000000 + Math.floor(Math.random() * 9000000000)}`,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: 'text',
                  text: { body: 'MENU' }
                }
              ]
            }
          }
        ]
      }
    ]
  };

  const msgRes = http.post(`${BASE_URL}/webhook`, JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' }
  });

  check(msgRes, {
    'webhook status is 200': (r) => r.status === 200,
    'webhook response time < 500ms': (r) => r.timings.duration < 500
  }) || errorRate.add(1);

  sleep(1);
}
```

## Running the Load Test

1. Start the application:

```bash
npm run dev
```

2. In another terminal, run the load test:

```bash
k6 run k6-load-test.js
```

Or with custom base URL:

```bash
k6 run -e BASE_URL=https://your-production-url k6-load-test.js
```

## Expected Results

For a properly configured deployment with:
- PostgreSQL with 5-connection pool
- Redis for caching and rate limiting
- 5 concurrent BullMQ jobs

You should see:

- **Response times:** 50-200ms for most requests
- **p95 latency:** < 500ms
- **Error rate:** < 1%
- **Throughput:** 5+ RPS

## Failure Diagnosis

If the test fails:

1. Check database connection pool: `SELECT count(*) FROM pg_stat_activity;`
2. Check Redis connection: `redis-cli PING`
3. Check application logs: `npm run dev` shows errors
4. Monitor resource usage: CPU, memory, disk I/O
5. Verify rate limiting is not too aggressive

## Next Steps

- Run load test against production infrastructure before go-live
- Monitor real-world metrics over 24 hours
- Adjust cache TTLs and job concurrency based on actual usage patterns
- Set up alerts for error rates and latency anomalies
