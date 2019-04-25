'use strict';

const test = require('ava');
const WildEmitter = require('wildemitter');
const Reconnector = require('../../src/reconnector');
const sinon = require('sinon');

let clock;

// controls whether clients can reconnect or not
let SIMULTATE_ONLINE = false;

class Client extends WildEmitter {
  constructor (connectTimeout) {
    super();
    this.connected = false;
    this.connectAttempts = 0;

    this.logger = {
      warn () {},
      error () {},
      debug () {}
    };

    this._stanzaio = {
      disco: {
        addFeature () {}
      },
      stanzas: {
        define () {},
        utils: {
          textSub () {}
        },
        extendIQ () {}
      },
      connect: () => {
        this.connectAttempts++;
        setTimeout(() => {
          if (SIMULTATE_ONLINE) {
            this.emit('connected');
            this.connected = true;
          } else {
            this.emit('disconnected');
            this.connected = false;
          }
        }, connectTimeout || 10);
      }
    };
  }

  connect () {}
  reconnect () {}
}

test.beforeEach(() => {
  SIMULTATE_ONLINE = false;
  clock = sinon.useFakeTimers();
});

test.afterEach(() => {
  clock.restore();
});

test('when started it reconnects on backoff', async t => {
  const client = new Client();
  const reconnect = new Reconnector(client);
  reconnect.start();

  // move forward in time to where two connections should have been attempted.
  clock.tick(350);
  t.is(client.connectAttempts, 2);

  clock.tick(600);
  t.is(client.connectAttempts, 3);

  SIMULTATE_ONLINE = true;
  clock.tick(1100);
  t.is(client.connectAttempts, 4);
  t.is(client.connected, true);

  // make sure it didn't keep trying
  clock.tick(10000);
  t.is(client.connectAttempts, 4);
});

test('when started it reconnects on backoff (long reconnect)', async t => {
  const client = new Client(400);
  const reconnect = new Reconnector(client);
  reconnect.start();

  // move forward in time to where two connections should have been attempted.
  clock.tick(200);
  client._stanzaio.transport = { conn: { readyState: 0 } };
  clock.tick(350);
  t.is(client.connectAttempts, 1);

  client._stanzaio.transport = { conn: { readyState: 1 } };
  clock.tick(450);
  t.is(client.connectAttempts, 1);

  clock.tick(1100);
  t.is(client.connectAttempts, 1);
  client._stanzaio.transport = { conn: { readyState: 3 } };

  clock.tick(3000);
  t.is(client.connectAttempts, 2);

  SIMULTATE_ONLINE = true;
  clock.tick(6000);
  t.is(client.connectAttempts, 3);
  t.is(client.connected, true);

  // make sure it didn't keep trying
  clock.tick(10000);
  t.is(client.connectAttempts, 3);
});

test('when started a second time it will not immediately retry the backoff', async t => {
  const client = new Client();
  const reconnect = new Reconnector(client);
  reconnect.start();

  // move forward in time to where two connections should have been attempted.
  clock.tick(350);
  t.is(client.connectAttempts, 2);

  // Will not throw an error
  reconnect.start();
  t.is(client.connectAttempts, 2);

  clock.tick(600);
  t.is(client.connectAttempts, 3);
});

test('when stopped it will cease the backoff', async t => {
  const client = new Client();
  const reconnect = new Reconnector(client);
  reconnect.start();

  // move forward in time to where two connections should have been attempted.
  clock.tick(350);
  t.is(client.connectAttempts, 2);

  clock.tick(600);
  t.is(client.connectAttempts, 3);

  reconnect.stop();
  clock.tick(1100);
  t.is(client.connectAttempts, 3);
  t.is(client.connected, false);

  // make sure it didn't keep trying
  clock.tick(10000);
  t.is(client.connectAttempts, 3);
});

test('will attempt a full reconnection after 10 failures', async t => {
  const client = new Client();
  sinon.stub(client, 'connect');
  const reconnect = new Reconnector(client);
  reconnect.start();

  // move forward in time to where two connections should have been attempted.
  clock.tick(350);
  t.is(client.connectAttempts, 2);

  sinon.assert.notCalled(client.connect);

  // Fail a lot more
  clock.tick(50000);
  t.is(client.connectAttempts > 10, true);

  // make sure client connect was called
  sinon.assert.calledOnce(client.connect);
});

test('when an auth failure occurs it will cease the backoff', async t => {
  const client = new Client();
  const reconnect = new Reconnector(client);
  reconnect.start();

  // move forward in time to where two connections should have been attempted.
  clock.tick(350);
  t.is(client.connectAttempts, 2);

  clock.tick(600);
  t.is(client.connectAttempts, 3);

  client.emit('sasl:failure');
  clock.tick(1100);
  t.is(client.connectAttempts, 3);
  t.is(client.connected, false);

  // make sure it didn't keep trying
  clock.tick(10000);
  t.is(client.connectAttempts, 3);
});

test('when a temporary auth failure occurs it will not cease the backoff', async t => {
  const client = new Client();
  const reconnect = new Reconnector(client);
  reconnect.start();

  // move forward in time to where two connections should have been attempted.
  clock.tick(350);
  t.is(client.connectAttempts, 2);

  clock.tick(600);
  t.is(client.connectAttempts, 3);

  client.emit('sasl:failure', { condition: 'temporary-auth-failure' });
  clock.tick(1100);
  t.is(client.connectAttempts, 4);
  t.is(client.connected, false);

  clock.tick(2500);
  t.is(client.connectAttempts, 5);

  client.emit('sasl:failure');
});

test('when a connection transfer request comes in, will emit a reconnect request to the consuming application', async t => {
  const client = new Client();
  const reconnect = new Reconnector(client);
  sinon.stub(client, 'reconnect').callsFake(() => {
    client.emit('reconnected');
  });

  client.on('requestReconnect', (handler) => {
    setTimeout(() => handler({ done: true }), 1);
  });

  const reconnected = new Promise(resolve => {
    client.on('reconnected', resolve);
  });

  reconnect.client.emit('stream:data', {
    toJSON: () => ({
      cxfr: {
        domain: 'asdf.example.com',
        server: 'streaming.us-east-1.example.com'
      }
    })
  });

  clock.tick(10);

  await reconnected;
});

test('will wait to reconnect if called back with pending', async t => {
  const client = new Client();
  const reconnect = new Reconnector(client);
  sinon.stub(client, 'reconnect').callsFake(() => {
    client.emit('reconnected');
  });

  client.on('requestReconnect', (handler) => {
    setTimeout(() => handler({ pending: true }), 1);
    setTimeout(() => handler({ done: true }), 200);
  });

  const reconnected = new Promise(resolve => {
    client.on('reconnected', resolve);
  });

  reconnect.client.emit('stream:data', {
    toJSON: () => ({
      cxfr: {
        domain: 'asdf.example.com',
        server: 'streaming.us-east-1.example.com'
      }
    })
  });

  clock.tick(10);
  sinon.assert.notCalled(client.reconnect);
  clock.tick(300);
  sinon.assert.calledOnce(client.reconnect);

  await reconnected;
});

test('will wait no longer than 1 hour after pending callback to reconnect', async t => {
  const client = new Client();
  const reconnect = new Reconnector(client);
  sinon.stub(client, 'reconnect').callsFake(() => {
    client.emit('reconnected');
  });

  client.on('requestReconnect', (handler) => {
    setTimeout(() => handler({ pending: true }), 1);
  });

  const reconnected = new Promise(resolve => {
    client.on('reconnected', resolve);
  });

  reconnect.client.emit('stream:data', {
    toJSON: () => ({
      cxfr: {
        domain: 'asdf.example.com',
        server: 'streaming.us-east-1.example.com'
      }
    })
  });

  clock.tick(10);
  sinon.assert.notCalled(client.reconnect);
  clock.tick(10 * 60 * 1000);
  sinon.assert.calledOnce(client.reconnect);

  await reconnected;
});

test('will reconnect after a second if no pending or done response is received', async t => {
  const client = new Client();
  const reconnect = new Reconnector(client);
  sinon.stub(client, 'reconnect').callsFake(() => {
    client.emit('reconnected');
  });

  client.on('requestReconnect', (handler) => {
    setTimeout(() => handler({ pending: true }), 2000); // too late
  });

  const reconnected = new Promise(resolve => {
    client.on('reconnected', resolve);
  });

  reconnect.client.emit('stream:data', {
    toJSON: () => ({
      cxfr: {
        domain: 'asdf.example.com',
        server: 'streaming.us-east-1.example.com'
      }
    })
  });

  clock.tick(10);
  sinon.assert.notCalled(client.reconnect);
  clock.tick(1000);
  sinon.assert.calledOnce(client.reconnect);

  await reconnected;
});

test('will not reconnect if junk is received', async t => {
  const client = new Client();
  const reconnect = new Reconnector(client);
  sinon.stub(client, 'reconnect');

  reconnect.client.emit('stream:data', {
    toJSON: () => ({})
  });
  reconnect.client.emit('stream:data');

  clock.tick(10);
  sinon.assert.notCalled(client.reconnect);
  clock.tick(1000);
  sinon.assert.notCalled(client.reconnect);
});
