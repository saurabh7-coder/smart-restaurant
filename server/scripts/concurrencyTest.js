/**
 * Proves the core invariant: N customers racing for the SAME table in the SAME
 * seating slot produce exactly ONE confirmed booking and N-1 clean rejections.
 *
 * This is a live end-to-end test — it drives the real HTTP API against the real
 * database, because that is the only place the race can actually happen. A unit
 * test with a mocked model would prove nothing about the index.
 *
 * Prerequisites:  the API is running, and `npm run seed` has been run.
 * Usage:          npm run test:concurrency
 *                 API_URL=http://localhost:5050 ATTEMPTS=8 npm run test:concurrency
 */

const API = (process.env.API_URL || 'http://localhost:5050').replace(/\/$/, '');
const ATTEMPTS = Number(process.env.ATTEMPTS || 8);
const GUESTS = Number(process.env.GUESTS || 2);
const RUN = Date.now();

let failures = 0;

function check(condition, label, detail) {
  if (condition) {
    console.log(`  ✔ ${label}`);
  } else {
    failures += 1;
    console.log(`  ✖ ${label}`);
    if (detail !== undefined) console.log(`      ${JSON.stringify(detail)}`);
  }
}

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${API}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    /* non-JSON response */
  }
  return { status: res.status, body: payload };
}

/** YYYY-MM-DD, `offset` days from today. */
function dateNDaysAhead(offset) {
  const d = new Date(Date.now() + offset * 24 * 60 * 60 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function main() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  DOUBLE-BOOKING CONCURRENCY TEST');
  console.log(`  ${ATTEMPTS} simultaneous bookings → same table, same slot`);
  console.log('══════════════════════════════════════════════════════════\n');

  /* 1 — API reachable */
  const health = await api('/health');
  if (health.status !== 200) {
    console.error(`✖ API is not reachable at ${API}. Start it with: npm run dev:server\n`);
    process.exit(1);
  }
  console.log(`Connected to ${API}\n`);

  /* 2 — find a bookable slot with at least one free table */
  let target = null;
  for (let offset = 1; offset <= 7 && !target; offset += 1) {
    const date = dateNDaysAhead(offset);
    // eslint-disable-next-line no-await-in-loop
    const avail = await api(`/reservations/availability?date=${date}&guests=${GUESTS}`);
    if (avail.status !== 200) continue;

    const slot = (avail.body.data.slots || []).find((s) => s.isBookable);
    if (!slot) continue;

    // eslint-disable-next-line no-await-in-loop
    const detail = await api(
      `/reservations/availability?date=${date}&time=${slot.time}&guests=${GUESTS}`,
    );
    const table = (detail.body.data.tables || []).find((t) => t.isAvailable);
    if (table) target = { date, time: slot.time, label: slot.label, table };
  }

  if (!target) {
    console.error('✖ No free table found in the next 7 days. Run `npm run seed` first.\n');
    process.exit(1);
  }

  console.log(`Target slot : ${target.date} at ${target.label}`);
  console.log(`Target table: ${target.table.tableNumber} (seats ${target.table.capacity})\n`);

  /* 3 — register N distinct customers (the per-user duplicate guard means one
         account cannot race against itself) */
  console.log(`Registering ${ATTEMPTS} test customers…`);
  const tokens = await Promise.all(
    Array.from({ length: ATTEMPTS }, async (_, i) => {
      const res = await api('/auth/register', {
        method: 'POST',
        body: {
          name: `Race Tester ${i + 1}`,
          email: `race-${RUN}-${i}@concurrency.test`,
          phone: `+91 90000 ${String(10000 + i).slice(-5)}`,
          password: 'RaceTest123',
        },
      });
      if (res.status !== 201) {
        throw new Error(`Could not register tester ${i}: ${JSON.stringify(res.body)}`);
      }
      return res.body.data.token;
    }),
  );
  console.log(`  ${tokens.length} testers ready\n`);

  /* 4 — fire all bookings at once for the identical table + slot */
  console.log('Firing simultaneous booking requests…');
  const started = Date.now();
  const results = await Promise.all(
    tokens.map((token, i) =>
      api('/reservations', {
        method: 'POST',
        token,
        body: {
          date: target.date,
          time: target.time,
          guests: GUESTS,
          table: target.table.id,
          name: `Race Tester ${i + 1}`,
          phone: `+91 90000 ${String(10000 + i).slice(-5)}`,
          email: `race-${RUN}-${i}@concurrency.test`,
        },
      }),
    ),
  );
  console.log(`  All ${ATTEMPTS} responses received in ${Date.now() - started} ms\n`);

  /* 5 — assertions */
  const created = results.filter((r) => r.status === 201);
  const rejected = results.filter((r) => r.status === 409);
  const other = results.filter((r) => r.status !== 201 && r.status !== 409);

  console.log('Results');
  console.log(`  201 Created  : ${created.length}`);
  console.log(`  409 Conflict : ${rejected.length}`);
  console.log(`  other        : ${other.length}\n`);

  console.log('Assertions');
  check(created.length === 1, 'exactly one booking succeeded', {
    succeeded: created.length,
    ids: created.map((r) => r.body?.data?.reservationId),
  });
  check(
    rejected.length === ATTEMPTS - 1,
    `the other ${ATTEMPTS - 1} were rejected with 409 Conflict`,
    { rejected: rejected.length },
  );
  check(other.length === 0, 'no unexpected status codes (no 500s)', other.map((r) => r.status));
  check(
    rejected.every((r) => typeof r.body?.message === 'string' && r.body.message.length > 0),
    'every rejection carried a readable message',
    rejected.map((r) => r.body?.message).slice(0, 3),
  );

  /* 6 — the database really does hold only one booking for that slot */
  if (created.length === 1) {
    const winnerToken = tokens[results.indexOf(created[0])];
    const verify = await api(
      `/reservations/availability?date=${target.date}&time=${target.time}&guests=${GUESTS}`,
    );
    const stillFree = (verify.body.data.tables || []).find(
      (t) => t.id === target.table.id && t.isAvailable,
    );
    check(!stillFree, 'the table now reads as unavailable for that slot');

    // Clean up so the test can be re-run against the same slot.
    const bookingId = created[0].body.data._id || created[0].body.data.id;
    const cancelled = await api(`/reservations/${bookingId}`, {
      method: 'DELETE',
      token: winnerToken,
    });
    check(cancelled.status === 200, 'winning booking cancelled (cleanup)');

    const after = await api(
      `/reservations/availability?date=${target.date}&time=${target.time}&guests=${GUESTS}`,
    );
    const freedAgain = (after.body.data.tables || []).find(
      (t) => t.id === target.table.id && t.isAvailable,
    );
    check(Boolean(freedAgain), 'cancelling released the slot for re-booking');
  }

  console.log('\n══════════════════════════════════════════════════════════');
  if (failures === 0) {
    console.log('  PASS — the double-booking guarantee holds.');
    console.log('══════════════════════════════════════════════════════════\n');
    console.log(`Note: ${ATTEMPTS} test accounts (race-${RUN}-*@concurrency.test) were left`);
    console.log('in the database. Remove them from Admin → Customers if you wish.\n');
    process.exit(0);
  } else {
    console.log(`  FAIL — ${failures} assertion(s) failed.`);
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\n✖ Test crashed:', err.message);
  process.exit(1);
});
