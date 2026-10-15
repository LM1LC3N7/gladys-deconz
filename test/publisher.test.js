import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { StatePublisher } from '../src/publisher.js';

const ID = (n) => `ext:test-integration:deconz:aa:${n}`;

async function setup(budget) {
  const gladys = createFakeGladys();
  await gladys.connect();
  let now = 1_000_000;
  const publisher = new StatePublisher({
    gladys,
    logger: createLogger({ level: 'silent' }),
    now: () => now,
    budget,
  });
  return { gladys, publisher, advance: (ms) => (now += ms) };
}

test('the last value of a feature is sent, an unchanged one is not', async () => {
  const { gladys, publisher } = await setup();
  publisher.push(ID(1), 20);
  publisher.push(ID(1), 21);
  assert.equal(await publisher.flush(), 1);
  assert.deepEqual(gladys.fake.states, [{ device_feature_external_id: ID(1), state: 21 }]);
  publisher.push(ID(1), 21);
  assert.equal(await publisher.flush(), 0);
});

test('button presses are all sent, in order, before the measures', async () => {
  const { gladys, publisher } = await setup();
  publisher.push(ID(2), 5);
  publisher.pushEvent(ID(3), 49);
  publisher.pushEvent(ID(3), 49);
  assert.equal(await publisher.flush(), 3);
  assert.deepEqual(
    gladys.fake.states.map((s) => [s.device_feature_external_id, s.state]),
    [
      [ID(3), 49],
      [ID(3), 49],
      [ID(2), 5],
    ],
  );
});

test('the per-minute budget is kept, the rest waits for the next minute', async () => {
  const { gladys, publisher, advance } = await setup(3);
  for (let i = 0; i < 5; i += 1) {
    publisher.push(ID(i), i);
  }
  assert.equal(await publisher.flush(), 3);
  assert.equal(await publisher.flush(), 0);
  advance(60_000);
  assert.equal(await publisher.flush(), 2);
  assert.equal(gladys.fake.states.length, 5);
});

test('a failed request keeps the values; a deleted device is forgotten', async (t) => {
  const { gladys, publisher } = await setup();
  const failing = t.mock.method(gladys, 'publishChangedStates', async () => {
    throw new Error('429');
  });
  publisher.push(ID(1), 1);
  await assert.rejects(publisher.flush(), /429/);
  failing.mock.restore();
  assert.equal(await publisher.flush(), 1);
  publisher.push(`${ID(9)}:01-0402:temperature`, 20);
  publisher.pushEvent(`${ID(9)}:02-fc00:buttonevent`, 49);
  publisher.forget(ID(9));
  assert.equal(await publisher.flush(), 0);
});
