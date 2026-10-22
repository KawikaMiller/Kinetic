import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, TextField } from '../../components/ui';
import { shaderCaption } from './captions';
import { MESH_IDS, meshOf } from './mesh';
import { paintPixels, tokenRgb } from '../../components/canvasImage';
import { IMAGE, matrices, shadeImage } from './render';
import { FUNCTIONS, INPUT_NAMES, MAX_CHARS, MAX_TOKENS, SHADER_PRESETS, compileChannels } from './shader';
import { SHADER_TURN, activePreset, choosePreset, initialShader, typeField, type ShaderState } from './shaderState';

const IMAGE_SCALE = 2;
const BACKGROUND = tokenRgb('bg2');
const BAD = tokenRgb('bad');
const CHANNELS = ['red', 'green', 'blue'] as const;
/** The field accepts a little more than the limit so a refusal can say how long the text is; it never grows without bound. */
const FIELD_HARD_LIMIT = MAX_CHARS * 2;
const MESH_OPTIONS = MESH_IDS.map((id) => ({ value: id, label: id }));
const LEGEND = (
  <Legend
    items={[
      { color: 'var(--bad)', label: 'a pixel whose result is NaN or infinite (hatched)', shape: 'square' },
      { color: 'var(--dim)', label: 'background, no triangle', shape: 'square' },
    ]}
  />
);

export function ShaderScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<ShaderState>(initialShader);
  const { mesh, turnDeg } = s;
  const [appliedRed, appliedGreen, appliedBlue] = s.applied;
  const image = useMemo(() => {
    const compiled = compileChannels([appliedRed, appliedGreen, appliedBlue]);
    if (!compiled.ok) throw new RangeError('the applied fields always compile');
    return shadeImage(meshOf(mesh), matrices(turnDeg), compiled.shader, BACKGROUND);
  }, [mesh, turnDeg, appliedRed, appliedGreen, appliedBlue]);
  const url = useMemo(
    () => paintPixels(image.w, image.h, (i) => {
      const px = image.pixels[i];
      if (px.kind === 'bad') return (i % image.w + Math.floor(i / image.w)) % 2 === 0 ? BAD : BACKGROUND;
      return px.rgb;
    }, IMAGE_SCALE),
    [image],
  );
  const caption = shaderCaption({ fields: s.fields, errors: s.errors, shaded: image.shaded, badCount: image.badCount });
  const active = activePreset(s);
  return (
    <StageFrame
      height={560}
      legend={LEGEND}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Fragment shader runs" value={image.shaded} sub="one per visible pixel" />
          <Stat label="Bad pixels" value={image.badCount} color={image.badCount > 0 ? 'var(--bad)' : undefined} sub="NaN or infinite" />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented ariaLabel="Mesh" value={s.mesh} onChange={(m) => setS((c) => ({ ...c, mesh: m }))} options={MESH_OPTIONS} />
          <Slider label="Turn about y" value={s.turnDeg} min={SHADER_TURN.min} max={SHADER_TURN.max} step={SHADER_TURN.step} format={(v) => `${v}°`} onChange={(t) => setS((c) => ({ ...c, turnDeg: t }))} />
        </>,
        <>
          <ControlGroup label="Presets" inline>
            {SHADER_PRESETS.map((p) => (
              <ChipButton key={p.id} tone="pink" on={active === p.id} onClick={() => setS((c) => choosePreset(c, p.id))}>{p.label}</ChipButton>
            ))}
          </ControlGroup>
          <Button onClick={() => setS(initialShader())}>Reset</Button>
        </>,
      ]}
    >
      <div className="gp-stage stage-pad">
        <div className="gp-row">
          <div className="gp-col">
            <Box>
              <SectionTitle hint={`${IMAGE.w} by ${IMAGE.h} pixels, re-rendered on every change`}>The image</SectionTitle>
              {url && <img className="gp-img" src={url} alt={`The ${s.mesh} shaded by your expressions; ${image.badCount} pixels are NaN or infinite`} width={IMAGE.w * IMAGE_SCALE} height={IMAGE.h * IMAGE_SCALE} />}
            </Box>
          </div>
          <div className="gp-col">
            <Box>
              <SectionTitle hint="a toy expression language, not GLSL">Fragment shader</SectionTitle>
              <div className="gp-fields">
                {CHANNELS.map((name, i) => (
                  <div key={name} className="gp-field-row">
                    <TextField
                      label={name}
                      value={s.fields[i]}
                      maxLength={FIELD_HARD_LIMIT}
                      spellCheck={false}
                      className="gp-field"
                      onChange={(text) => setS((c) => typeField(c, i, text))}
                    />
                    {s.errors[i] && <p className="gp-error" role="status">{`${name}: ${s.errors[i]}`}</p>}
                  </div>
                ))}
              </div>
              <p className="hint is-muted">
                {`Inputs: ${INPUT_NAMES.join(', ')} (u, v surface coordinates; nl the Lambert term; z depth 0 to 1; x, y screen 0 to 1; bx, by, bz barycentric weights). Functions: ${Object.keys(FUNCTIONS).join(', ')}. At most ${MAX_CHARS} characters and ${MAX_TOKENS} tokens per field; nothing you type is run as JavaScript.`}
              </p>
            </Box>
          </div>
        </div>
        <ProvenanceRow>
          <Provenance kind="toy">a toy expression language evaluated by a hand-written parser, not GLSL; the pipeline is a software teaching pipeline</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
