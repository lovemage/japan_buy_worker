import test from "node:test";
import assert from "node:assert/strict";

import { runPlanExpiryNotifications } from "../src/services/email-notifications.ts";

function isoDaysFromNow(days) {
  return new Date(Date.now() + days * 86400_000).toISOString();
}

function makeDb({ stores = [], orders = [], logs = [] } = {}) {
  const db = { stores, orders, logs };
  return {
    state: db,
    prepare(sql) {
      return {
        bind(...args) {
          return makeStatement(db, sql, args);
        },
        ...makeStatement(db, sql, []),
      };
    },
  };
}

function makeStatement(db, sql, args) {
  return {
    async all() {
      if (sql.includes("FROM stores") && sql.includes("plan IN ('plus', 'pro', 'proplus')")) {
        const now = Date.now();
        const isExpiringSoonQuery = sql.includes("'+3 days'");
        return {
          results: db.stores.filter((store) => {
            if (
              store.is_active !== 1 ||
              !["plus", "pro", "proplus"].includes(store.plan) ||
              !store.plan_expires_at
            ) {
              return false;
            }
            const expires = new Date(store.plan_expires_at).getTime();
            if (isExpiringSoonQuery) return expires > now && expires <= now + 3 * 86400_000;
            return expires <= now;
          }),
        };
      }
      if (sql.includes("FROM payment_orders o")) {
        return {
          results: db.orders
            .filter((order) => order.status === "paid")
            .map((order) => {
              const store = db.stores.find((row) => row.id === order.store_id);
              const sent = db.logs.some((log) =>
                log.event_type === "plan_activated" &&
                log.dedupe_key === order.mer_trade_no &&
                log.status === "sent"
              );
              if (!store || sent) return null;
              return {
                store_id: order.store_id,
                mer_trade_no: order.mer_trade_no,
                plan: order.plan,
                store_name: store.name,
                store_slug: store.slug,
                owner_email: store.owner_email,
                plan_expires_at: store.plan_expires_at,
              };
            })
            .filter(Boolean),
        };
      }
      return { results: [] };
    },
    async first() {
      if (sql.includes("SELECT status FROM email_notification_logs")) {
        const [eventType, dedupeKey] = args;
        return db.logs.find((log) => log.event_type === eventType && log.dedupe_key === dedupeKey) || null;
      }
      return null;
    },
    async run() {
      if (sql.includes("INSERT OR IGNORE INTO email_notification_logs")) {
        const [storeId, eventType, dedupeKey, recipientEmail] = args;
        const exists = db.logs.some((log) => log.event_type === eventType && log.dedupe_key === dedupeKey);
        if (!exists) {
          db.logs.push({
            store_id: storeId,
            event_type: eventType,
            dedupe_key: dedupeKey,
            recipient_email: recipientEmail,
            status: "pending",
          });
        }
        return { meta: { changes: exists ? 0 : 1 } };
      }
      if (sql.includes("SET status = 'sent'")) {
        const [eventType, dedupeKey] = args;
        const log = db.logs.find((row) => row.event_type === eventType && row.dedupe_key === dedupeKey);
        if (log) log.status = "sent";
        return { meta: { changes: log ? 1 : 0 } };
      }
      if (sql.includes("SET status = 'failed'")) {
        const [error, eventType, dedupeKey] = args;
        const log = db.logs.find((row) => row.event_type === eventType && row.dedupe_key === dedupeKey);
        if (log) {
          log.status = "failed";
          log.error = error;
        }
        return { meta: { changes: log ? 1 : 0 } };
      }
      if (sql.includes("UPDATE stores") && sql.includes("SET plan = 'free'")) {
        const [id, plan] = args;
        const store = db.stores.find((row) => row.id === id && row.plan === plan);
        if (store) {
          store.plan = "free";
          store.plan_expires_at = null;
        }
        return { meta: { changes: store ? 1 : 0 } };
      }
      return { meta: { changes: 0 } };
    },
  };
}

test("expired paid plan is not downgraded when renewal email fails", async () => {
  const db = makeDb({
    stores: [{
      id: 1,
      slug: "shop",
      name: "測試商店",
      owner_email: "owner@example.com",
      plan: "pro",
      plan_expires_at: isoDaysFromNow(-1),
      is_active: 1,
    }],
  });

  const result = await runPlanExpiryNotifications({
    DB: db,
    APP_URL: "https://vovosnap.com",
    EMAIL: { send: async () => { throw new Error("temporary email outage"); } },
  });

  assert.equal(result.failed, 1);
  assert.equal(result.downgraded, 0);
  assert.equal(db.state.stores[0].plan, "pro");
  assert.equal(db.state.logs[0].status, "failed");
});

test("expired paid plan is downgraded only after renewal email succeeds", async () => {
  const sent = [];
  const db = makeDb({
    stores: [{
      id: 1,
      slug: "shop",
      name: "測試商店",
      owner_email: "owner@example.com",
      plan: "pro",
      plan_expires_at: isoDaysFromNow(-1),
      is_active: 1,
    }],
  });

  const result = await runPlanExpiryNotifications({
    DB: db,
    APP_URL: "https://vovosnap.com",
    EMAIL: { send: async (message) => { sent.push(message); } },
  });

  assert.equal(result.sent, 1);
  assert.equal(result.downgraded, 1);
  assert.equal(db.state.stores[0].plan, "free");
  assert.equal(db.state.logs[0].status, "sent");
  assert.equal(sent[0].to, "owner@example.com");
});

test("scheduled notification job retries paid activation emails that were not sent", async () => {
  const sent = [];
  const db = makeDb({
    stores: [{
      id: 1,
      slug: "shop",
      name: "測試商店",
      owner_email: "owner@example.com",
      plan: "pro",
      plan_expires_at: isoDaysFromNow(30),
      is_active: 1,
    }],
    orders: [{
      store_id: 1,
      mer_trade_no: "VS1abc",
      plan: "pro",
      status: "paid",
    }],
  });

  const result = await runPlanExpiryNotifications({
    DB: db,
    APP_URL: "https://vovosnap.com",
    EMAIL: { send: async (message) => { sent.push(message); } },
  });

  assert.equal(result.activationScanned, 1);
  assert.equal(result.activationSent, 1);
  assert.equal(db.state.logs.find((log) => log.event_type === "plan_activated").status, "sent");
  assert.match(sent[0].subject, /會員方案已升級/);
});

test("scheduled notification job sends one expiring-soon reminder three days before expiry", async () => {
  const sent = [];
  const expiresAt = isoDaysFromNow(2);
  const db = makeDb({
    stores: [{
      id: 1,
      slug: "shop",
      name: "測試商店",
      owner_email: "owner@example.com",
      plan: "pro",
      plan_expires_at: expiresAt,
      is_active: 1,
    }],
  });

  const env = {
    DB: db,
    APP_URL: "https://vovosnap.com",
    EMAIL: { send: async (message) => { sent.push(message); } },
  };

  const first = await runPlanExpiryNotifications(env);
  const second = await runPlanExpiryNotifications(env);

  assert.equal(first.expiringSoonScanned, 1);
  assert.equal(first.expiringSoonSent, 1);
  assert.equal(second.expiringSoonScanned, 1);
  assert.equal(second.expiringSoonSent, 0);
  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /3 日內到期/);
  assert.equal(db.state.logs.find((log) => log.event_type === "plan_expiring_soon").status, "sent");
});
