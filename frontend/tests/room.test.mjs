import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../worker/src/index.js', import.meta.url));
const { RoomHub } = await import(`data:text/javascript;base64,${source.toString('base64')}`);

function fixture(role = 'GM', ready = true) {
  const hub = new RoomHub({}, {});
  const messages = [];
  const socket = { send: message => messages.push(JSON.parse(message)) };
  hub.clients.set(socket, { id: 'one', roomId: 'test', role, ready, name: 'Test' });
  const send = data => hub.webSocketMessage(socket, JSON.stringify(data));
  return { hub, socket, messages, send };
}

test('accepted Play broadcasts only Play, never Pause', () => {
  const { send, messages } = fixture();
  send({ type: 'PLAY_REQUEST', trackName: 'Track', sectionName: 'Main', serverMs: 12345 });
  assert.deepEqual(messages.map(message => message.type), ['PLAY']);
});

test('Play respects role and readiness gates', () => {
  for (const [role, ready, code] of [['PASSIVE', true, 'FORBIDDEN'], ['GM', false, 'NOT_READY']]) {
    const { send, messages } = fixture(role, ready);
    send({ type: 'PLAY_REQUEST', trackName: 'Track', sectionName: 'Main' });
    assert.equal(messages.length, 1);
    assert.equal(messages[0].code, code);
  }
});

test('commands remain isolated to their room', () => {
  const { hub, send } = fixture();
  const otherMessages = [];
  hub.clients.set({ send: value => otherMessages.push(value) }, { id: 'other', roomId: 'other', role: 'PASSIVE', ready: true });
  send({ type: 'PLAY_REQUEST', trackName: 'Track', sectionName: 'Main' });
  assert.deepEqual(otherMessages, []);
});
