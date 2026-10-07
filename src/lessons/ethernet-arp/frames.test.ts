import { describe, expect, it } from 'vitest';
import { sequenceLayout } from '../../core/sequenceLayout';
import { captionText } from '../../core/testing/captions';
import { ladderActors, ladderMessages, stepCaption, txFrames } from './frames';
import { GATEWAY, HOSTS, REMOTE_IP, clearSwitch, emptyWorld, hostByMac, send, wait, type HostId } from './model';

const T = 60;
const senders: HostId[] = ['A', 'B', 'C', 'D'];

/** Every sender × destination × starting state the controls can reach. */
function* runs() {
  for (const s of senders) {
    const me = HOSTS.find((h) => h.id === s)!;
    for (const target of [...HOSTS.map((h) => h.ip), REMOTE_IP].filter((ip) => ip !== me.ip)) {
      const cold = emptyWorld();
      const warm = send(cold, s, target, T).world;
      yield { label: 'cold', tx: send(cold, s, target, T) };
      yield { label: 'warm', tx: send(warm, s, target, T) };
      yield { label: 'cleared', tx: send(clearSwitch(warm), s, target, T) };
      yield { label: 'aged', tx: send(wait(warm, T), s, target, T) };
    }
  }
}

describe('ARP captions over every combination', () => {
  it('each caption states what its step did', () => {
    let count = 0;
    for (const { label, tx } of runs()) {
      count++;
      const frames = txFrames(tx, T);
      expect(frames).toHaveLength(tx.steps.length);
      tx.steps.forEach((s, i) => {
        const text = captionText(stepCaption(tx, s, T));
        expect(captionText(frames[i].say)).toBe(text);
        if (s.kind === 'decide') expect(text).toContain(tx.hop.onLink ? 'the same subnet' : `default gateway ${GATEWAY.ip}`);
        if (s.kind === 'miss') expect(text).toContain(label === 'aged' ? 'aged out' : 'no entry');
        if (s.kind === 'arp-request') expect(text).toContain(`Who has ${tx.hop.ip}? Tell ${tx.sender.ip}`);
        if (s.kind === 'arp-reply') expect(text).toContain(`${tx.owner.ip} is at ${tx.owner.mac}`);
        if (s.kind === 'data') {
          expect(text).toContain(s.switchAction === 'flood' ? 'floods' : `on port ${s.out![0]}`);
          expect(hostByMac(s.frame!.dst)!.id).toBe(tx.owner.id);
          expect(text.includes('MAC changes every hop')).toBe(!tx.hop.onLink);
        }
      });
      const kinds = tx.steps.map((s) => s.kind).join(',');
      expect(kinds).toBe(label === 'warm' || label === 'cleared' ? 'decide,hit,data' : 'decide,miss,arp-request,arp-reply,data');
      if (label === 'cleared') expect(tx.steps.at(-1)!.switchAction).toBe('flood');
      if (label === 'warm') expect(tx.steps.at(-1)!.switchAction).toBe('forward');
      // the ladder lays out with three lifelines and one row per step
      const layout = sequenceLayout(ladderActors(tx), ladderMessages(tx));
      expect(Object.keys(layout.lanes)).toHaveLength(3);
      expect(layout.rows).toHaveLength(tx.steps.length);
    }
    expect(count).toBe(80);
  });
});
