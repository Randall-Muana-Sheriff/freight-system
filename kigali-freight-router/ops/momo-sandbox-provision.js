#!/usr/bin/env node
/**
 * Provision a sandbox API user and key for MTN MoMo, and print the env lines.
 *
 * UNUSABLE FROM RWANDA AS OF 2026-08-24, and kept anyway.
 *
 * momodeveloper.mtn.com does not offer sandbox access for Rwanda -- we tried
 * and could not get credentials, so nothing below has been run against MTN.
 * It is committed rather than deleted for two reasons: the provisioning flow
 * is verified against MTN's current documented API and will not get easier to
 * work out later, and the currency note below is the thing that will bite
 * whoever picks this up, whether in a sandbox or on the day production
 * credentials arrive.
 *
 * If you are reading this because sandbox access opened up: the code is
 * untested against a live endpoint. Treat the first run as a test of this
 * script, not of the payment path.
 *
 *   MOMO_COLLECTION_SUBSCRIPTION_KEY=... \
 *   MOMO_DISBURSEMENT_SUBSCRIPTION_KEY=... \
 *   node ops/momo-sandbox-provision.js
 *
 * Why this exists: the sandbox makes you create your own API user, and the
 * flow is two calls with a UUID you have to generate yourself, carry between
 * them, and then keep -- because the UUID *is* the user id. The api key comes
 * back exactly once and cannot be retrieved again; get it wrong and the only
 * fix is to provision another user. That is a bad thing to do by hand at the
 * end of a signup flow.
 *
 * Sandbox only. It refuses to run against anything else: these endpoints do
 * not exist in production, where MTN issues the credentials to you directly
 * after a commercial agreement.
 *
 * THE CURRENCY PROBLEM, because it will bite immediately otherwise:
 * the sandbox settles in EUR and nothing else. Every Inzira order is priced
 * in RWF from its rate card, and momoClient's resolveCurrency deliberately
 * refuses when MOMO_CURRENCY disagrees with the order rather than silently
 * converting. So setting MOMO_CURRENCY=EUR does NOT make an RWF order
 * chargeable in the sandbox -- it makes it fail loudly, which is the correct
 * behaviour and the reason a 15,000 RWF fare never went out as 15,000 EUR.
 *
 * To exercise the real path in the sandbox, price a test rate card in EUR so
 * the order and the override agree. That keeps the guard intact and tests the
 * code that will actually run in production.
 */
import crypto from 'node:crypto';

const BASE_URL = process.env.MOMO_BASE_URL || 'https://sandbox.momodeveloper.mtn.com';
// The host MTN will call back on. Not used by the sandbox for much, but it is
// a required field on the user, and it is the value production will care about.
const CALLBACK_HOST = process.env.MOMO_CALLBACK_HOST || 'api.inzira.systems';

if (!/sandbox\.momodeveloper\.mtn\.com/.test(BASE_URL)) {
    console.error(`Refusing to run against ${BASE_URL}.`);
    console.error('This provisioning API is sandbox-only. Production credentials come');
    console.error('from MTN directly and are not self-served.');
    process.exit(2);
}

const PRODUCTS = [
    { name: 'collection', envPrefix: 'MOMO_COLLECTION', key: process.env.MOMO_COLLECTION_SUBSCRIPTION_KEY },
    { name: 'disbursement', envPrefix: 'MOMO_DISBURSEMENT', key: process.env.MOMO_DISBURSEMENT_SUBSCRIPTION_KEY },
];

async function provision({ name, envPrefix, key }) {
    if (!key) {
        console.error(`\n⏭  Skipping ${name}: no ${envPrefix}_SUBSCRIPTION_KEY in the environment.`);
        console.error(`   Subscribe to the ${name} product at momodeveloper.mtn.com and use its`);
        console.error('   primary key. You can run this again for the other product later.');
        return null;
    }

    // The reference id IS the user id. Generated here, sent as a header on the
    // create call, and then used as a path segment to fetch the key -- so it
    // has to survive between the two calls and into the env file.
    const apiUser = crypto.randomUUID();

    const created = await fetch(`${BASE_URL}/v1_0/apiuser`, {
        method: 'POST',
        headers: {
            'X-Reference-Id': apiUser,
            'Ocp-Apim-Subscription-Key': key,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ providerCallbackHost: CALLBACK_HOST }),
    });

    if (created.status !== 201) {
        const detail = await created.text().catch(() => '');
        throw new Error(
            `Creating the ${name} API user failed: ${created.status} ${created.statusText}. ${detail}\n`
            + (created.status === 401
                ? 'A 401 here almost always means the subscription key belongs to a different '
                  + 'product than the one you are provisioning, or has not finished activating.'
                : '')
        );
    }

    const keyed = await fetch(`${BASE_URL}/v1_0/apiuser/${apiUser}/apikey`, {
        method: 'POST',
        headers: { 'Ocp-Apim-Subscription-Key': key },
    });

    if (!keyed.ok) {
        const detail = await keyed.text().catch(() => '');
        throw new Error(`Generating the ${name} API key failed: ${keyed.status} ${keyed.statusText}. ${detail}`);
    }

    const { apiKey } = await keyed.json();
    if (!apiKey) throw new Error(`MTN returned no apiKey for ${name}.`);

    // Read back, so what gets printed is what the server actually holds rather
    // than what we believe we just created.
    const check = await fetch(`${BASE_URL}/v1_0/apiuser/${apiUser}`, {
        headers: { 'Ocp-Apim-Subscription-Key': key },
    });
    const confirmed = check.ok ? await check.json().catch(() => null) : null;

    console.error(`✅ ${name}: user provisioned`
        + (confirmed?.targetEnvironment ? ` (targetEnvironment ${confirmed.targetEnvironment})` : ''));

    return { envPrefix, apiUser, apiKey };
}

const results = [];
for (const product of PRODUCTS) {
    try {
        const out = await provision(product);
        if (out) results.push(out);
    } catch (error) {
        console.error(`\n❌ ${product.name}: ${error.message}`);
        process.exitCode = 1;
    }
}

if (results.length === 0) {
    console.error('\nNothing provisioned.');
    process.exit(process.exitCode || 1);
}

// stdout carries only the env lines, so this can be appended to a file while
// the commentary above stays on stderr and in front of a human.
console.log('');
console.log('# --- MTN MoMo sandbox, generated by ops/momo-sandbox-provision.js ---');
console.log('# The api keys below cannot be retrieved from MTN again. Losing them');
console.log('# means provisioning a new user.');
console.log(`MOMO_BASE_URL=${BASE_URL}`);
console.log('MOMO_TARGET_ENVIRONMENT=sandbox');
for (const r of results) {
    console.log(`${r.envPrefix}_API_USER=${r.apiUser}`);
    console.log(`${r.envPrefix}_API_KEY=${r.apiKey}`);
}
console.log('# Sandbox settles in EUR only. This override makes momoClient refuse any');
console.log('# order NOT priced in EUR, which is deliberate — seed a EUR rate card to');
console.log('# test rather than weakening the guard.');
console.log('MOMO_CURRENCY=EUR');
