import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { ANOMALIES, anomalyCaption, stageCaption } from './frames';
import { STAGE_LABEL, normalForm, runAnomaly, schemaAt, type StageId } from './model';

const STAGES: StageId[] = [0, 1, 2, 3];

describe('stage captions come from the checker', () => {
  for (const st of STAGES)
    it(`${STAGE_LABEL[st]}`, () => {
      const say = text(stageCaption(st));
      const nf = normalForm(schemaAt(st));
      if (nf === 'BCNF') expect(say).toMatch(/3NF, and BCNF as well/);
      else expect(say).toContain(`finds it in ${nf}`);
    });

  it('names the broken form at each stage', () => {
    expect(text(stageCaption(0))).toMatch(/breaks 1NF/);
    expect(text(stageCaption(1))).toMatch(/breaks 2NF on order_id → customer_id, warehouse/);
    expect(text(stageCaption(2))).toMatch(/breaks 3NF on customer_id → customer_name, customer_email/);
  });
});

describe('anomaly captions, every stage x anomaly', () => {
  for (const st of STAGES)
    for (const a of ANOMALIES)
      it(`${STAGE_LABEL[st]} ${a.id}`, () => {
        const run = runAnomaly(a.id, schemaAt(st));
        const say = text(anomalyCaption(st, a.id, run));
        expect(say).toContain(run.ok ? `no ${a.name}` : a.name);
        if (a.id === 'delete' && !run.ok) for (const f of run.lost) expect(say).toContain(f);
        if (a.id === 'update' && !run.ok) expect(say).toMatch(new RegExp(`${run.inconsistent.size - 1} other cop`));
      });
});

describe('number agreement in the update caption', () => {
  it('1 other copy still says; 2 other copies still say', () => {
    expect(text(anomalyCaption(2, 'update'))).toMatch(/1 other copy still says the old one/);
    expect(text(anomalyCaption(1, 'update'))).toMatch(/2 other copies still say the old one/);
  });
});
