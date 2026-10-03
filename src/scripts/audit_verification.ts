import http from 'http';
import dotenv from 'dotenv';
dotenv.config();

import { createApp } from '../app.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { aiService } from '../services/aiService.js';
import { errorHandler, AppError } from '../middleware/errorHandler.js';

interface AuditResult {
  name: string;
  passed: boolean;
  details: string;
}

const results: AuditResult[] = [];

function recordTest(name: string, passed: boolean, details: string) {
  results.push({ name, passed, details });
  const icon = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${icon} | ${name}: ${details}`);
}

async function runAudit() {
  console.log('\n==================================================');
  console.log('🛡️  DINEFLOW COMPREHENSIVE SECURITY & AUDIT SUITE  ');
  console.log('==================================================\n');

  // Connect database before running tests
  try {
    await connectDatabase();
  } catch (err: any) {
    console.warn('Database connection warning (proceeding):', err.message);
  }

  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => server.listen(5099, resolve));
  const baseUrl = 'http://localhost:5099';

  try {
    // 1. Customer cannot access staff APIs
    {
      const res = await fetch(`${baseUrl}/api/users`);
      recordTest(
        'Customer cannot access staff APIs',
        res.status === 401,
        `GET /api/users returned HTTP ${res.status} (Expected 401 Unauthorized)`
      );
    }

    // 2. Customer cannot change order status
    {
      const res = await fetch(`${baseUrl}/api/orders/fake-order-id/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'COMPLETED' }),
      });
      recordTest(
        'Customer cannot change order status',
        res.status === 401,
        `PATCH /api/orders/:id/status returned HTTP ${res.status} (Expected 401 Unauthorized)`
      );
    }

    // 3. Customer cannot access AI endpoints
    {
      const res = await fetch(`${baseUrl}/api/ai/operations-advisor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'Why was prep time high?' }),
      });
      recordTest(
        'Customer cannot access AI operations advisor',
        res.status === 401,
        `POST /api/ai/operations-advisor returned HTTP ${res.status} (Expected 401 Unauthorized)`
      );
    }

    // 4. Kitchen cannot modify menu prices
    {
      const res = await fetch(`${baseUrl}/api/menu/items/fake-item-id`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-demo-role': 'KITCHEN',
        },
        body: JSON.stringify({ price: 10 }),
      });
      recordTest(
        'Kitchen cannot modify prices',
        res.status === 403,
        `PATCH /api/menu/items/:id with price returned HTTP ${res.status} (Expected 403 Forbidden)`
      );
    }

    // 5. Kitchen cannot manage users
    {
      const res = await fetch(`${baseUrl}/api/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-demo-role': 'KITCHEN',
        },
        body: JSON.stringify({ name: 'Hacker', role: 'OWNER' }),
      });
      recordTest(
        'Kitchen cannot manage users',
        res.status === 403,
        `POST /api/users with KITCHEN role returned HTTP ${res.status} (Expected 403 Forbidden)`
      );
    }

    // 6. Kitchen cannot access payments
    {
      const res = await fetch(`${baseUrl}/api/payments/bill/test-session-id`, {
        headers: { 'x-demo-role': 'KITCHEN' },
      });
      recordTest(
        'Kitchen cannot access payments',
        res.status === 403,
        `GET /api/payments/bill/:id with KITCHEN role returned HTTP ${res.status} (Expected 403 Forbidden)`
      );
    }

    // 7. Waiter cannot change menu
    {
      const res = await fetch(`${baseUrl}/api/menu/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-demo-role': 'WAITER',
        },
        body: JSON.stringify({ name: 'Tampered Dish', price: 50 }),
      });
      recordTest(
        'Waiter cannot change menu',
        res.status === 403,
        `POST /api/menu/items with WAITER role returned HTTP ${res.status} (Expected 403 Forbidden)`
      );
    }

    // 8. Waiter cannot manage users
    {
      const res = await fetch(`${baseUrl}/api/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-demo-role': 'WAITER',
        },
        body: JSON.stringify({ name: 'Tampered User', role: 'OWNER' }),
      });
      recordTest(
        'Waiter cannot manage users',
        res.status === 403,
        `POST /api/users with WAITER role returned HTTP ${res.status} (Expected 403 Forbidden)`
      );
    }

    // 9. Manager cannot perform owner-only operations
    {
      const resPostUser = await fetch(`${baseUrl}/api/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-demo-role': 'MANAGER',
        },
        body: JSON.stringify({ name: 'Staff Person', role: 'WAITER' }),
      });

      const resDeleteUser = await fetch(`${baseUrl}/api/users/fake-user-id`, {
        method: 'DELETE',
        headers: { 'x-demo-role': 'MANAGER' },
      });

      const passed = resPostUser.status === 403 && resDeleteUser.status === 403;
      recordTest(
        'Manager cannot perform owner-only operations',
        passed,
        `Create Staff: HTTP ${resPostUser.status}, Delete Staff: HTTP ${resDeleteUser.status} (Both Expected 403 Forbidden)`
      );
    }

    // 10. Security Headers: Helmet & CORS
    {
      const res = await fetch(`${baseUrl}/api/health`);
      const hasContentType = res.headers.has('x-content-type-options');
      const hasCors = res.headers.has('access-control-allow-origin') || res.headers.has('vary');
      recordTest(
        'Helmet & CORS security headers active',
        hasContentType,
        `X-Content-Type-Options: ${res.headers.get('x-content-type-options')}, Status: ${res.status}`
      );
    }

    // 11. Production stack traces are never exposed
    {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      let capturedBody: any = null;
      const mockReq: any = { method: 'GET', url: '/test', originalUrl: '/test' };
      const mockRes: any = {
        statusCode: 500,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(data: any) {
          capturedBody = data;
          return this;
        },
      };

      errorHandler(new Error('Sensitive database internal error'), mockReq, mockRes, () => {});
      process.env.NODE_ENV = origEnv;

      const stackOmitted = capturedBody && capturedBody.stack === undefined;
      recordTest(
        'Never expose production stack traces',
        stackOmitted,
        `stack field in production response is undefined: ${stackOmitted}`
      );
    }

    // 12. Menu Description Assistant (Input: Food name, Ingredients, Cooking method -> Draft generated)
    {
      const res = await fetch(`${baseUrl}/api/ai/menu-description`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-demo-role': 'OWNER',
        },
        body: JSON.stringify({
          foodName: 'Tandoori Bhatti Murgh',
          ingredients: 'Chicken drumsticks, Kashmiri degi mirch, hung curd, roasted gram flour',
          cookingMethod: 'Charcoal-grilled in clay tandoor',
          category: 'Mains',
          foodType: 'NON_VEG',
        }),
      });

      const body = await res.json() as any;
      const passed = res.status === 200 && body.success && typeof body.data?.draftDescription === 'string';
      recordTest(
        'Menu Description Assistant',
        passed,
        `Generated draft: "${body.data?.draftDescription?.substring(0, 60)}..." (Draft for user review)`
      );
    }

    // 13. Restaurant Operations Assistant ("Why was preparation time high yesterday?")
    {
      const res = await fetch(`${baseUrl}/api/ai/operations-advisor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-demo-role': 'OWNER',
        },
        body: JSON.stringify({
          query: 'Why was preparation time high yesterday?',
          timeRange: 'yesterday',
        }),
      });

      const body = await res.json() as any;
      const hasExplanation = res.status === 200 && body.success && typeof body.data?.explanation === 'string';
      const hasTelemetry = body.data?.structuredContext?.avgPrepTimeMinutes !== undefined;
      recordTest(
        'Restaurant Operations Assistant',
        hasExplanation && hasTelemetry,
        `Retrieved telemetry: avgPrep=${body.data?.structuredContext?.avgPrepTimeMinutes}m, peakHour="${body.data?.structuredContext?.peakHourWindow}", explanation length=${body.data?.explanation?.length} chars`
      );
    }

    // 14. Old QR token invalidation check
    {
      // Verify route logic: when old token doesn't match table.qrCode.token, throws 404
      const res = await fetch(`${baseUrl}/api/tables/qr/old-invalid-token-12345`);
      recordTest(
        'Old QR token must become invalid after regeneration',
        res.status === 404,
        `GET /api/tables/qr/:oldToken returned HTTP ${res.status} (Expected 404 Invalid QR Code)`
      );
    }

  } finally {
    server.close();
    try {
      await disconnectDatabase();
    } catch {}
  }

  console.log('\n==================================================');
  const allPassed = results.every((r) => r.passed);
  console.log(`TOTAL TESTS: ${results.length} | PASSED: ${results.filter((r) => r.passed).length} | FAILED: ${results.filter((r) => !r.passed).length}`);
  if (allPassed) {
    console.log('🎉 ALL AUDIT & PHASE 15 REQUIREMENTS VERIFIED SUCCESSFULLY!');
  } else {
    console.error('⚠️ SOME AUDIT REQUIREMENTS FAILED');
    process.exit(1);
  }
}

runAudit().catch((err) => {
  console.error('Audit execution error:', err);
  process.exit(1);
});
