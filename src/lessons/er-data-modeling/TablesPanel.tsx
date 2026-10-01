import type { Column, Table } from './model';

/** The generated tables: keys, foreign keys, join tables, and any column that's a modelling error. */
export function TablesPanel({ tables }: { tables: Table[] }) {
  return (
    <div className="er-tables">
      {tables.map((t) => (
        <div key={t.name} className={`er-table ${t.join ? 'is-join' : ''}`}>
          <div className="er-table-head">
            <b>{t.name}</b>
            {t.join && <span className="chip tone-info is-on">join table</span>}
          </div>
          <table className="data-table">
            <tbody>
              {t.columns.map((c) => (
                <tr key={c.name} className={`er-col er-col-${c.kind}`}>
                  <td className="er-col-name">
                    {(c.kind === 'pk' || c.partOfKey) && <span aria-label="primary key">🔑 </span>}
                    {c.name}
                  </td>
                  <td className="er-col-info">{info(c)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function info(c: Column) {
  if (c.kind === 'pk') return 'primary key';
  if (c.kind === 'error') return c.note;
  if (c.kind === 'fk') {
    const flags = [c.partOfKey ? 'part of the key' : c.nullable ? 'NULL allowed' : 'NOT NULL', c.unique && 'UNIQUE'].filter(Boolean).join(', ');
    return <><span>→ {c.ref}</span> · <span>{flags}</span></>;
  }
  return c.note ?? '';
}
