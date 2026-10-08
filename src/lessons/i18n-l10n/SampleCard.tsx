import type { CardText } from './model';

function Row({ value, api }: { value: string; api: string }) {
  return (
    <div className="i18n-row">
      <span className="i18n-value">{value}</span>
      <span className="i18n-api" dir="ltr" lang="en">{api}</span>
    </div>
  );
}

/** A tiny product card whose every string comes from `text`, laid out in the text's own direction. */
export function SampleCard({ text }: { text: CardText }) {
  return (
    <div className="i18n-card" dir={text.dir} lang={text.lang}>
      <h4 className="i18n-card-title">{text.title}</h4>
      <Row value={text.count} api="Intl.PluralRules" />
      <Row value={text.price} api="Intl.NumberFormat" />
      <Row value={text.date} api="Intl.DateTimeFormat" />
      <Row value={text.relative} api="Intl.RelativeTimeFormat" />
      <span className="i18n-btn" data-fit="button"><span className="i18n-btn-text">{text.button}</span></span>
    </div>
  );
}
