/**
 * A colour picker with its label and the picked hex printed beside it: accessibility's contrast
 * checker, color-spaces. `value` is the `#rrggbb` the native input reports.
 */
export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (hex: string) => void }) {
  return (
    <label className="color-field">
      <span>{label}</span>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      <code>{value}</code>
    </label>
  );
}
