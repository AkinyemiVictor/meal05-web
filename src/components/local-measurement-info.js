import { IconInfoCircle } from "@tabler/icons-react";
import { formatKgPerCongo } from "@/lib/local-measurement";

export default function LocalMeasurementInfo({ measurementInfo, compact = false }) {
  const kgPerCongo = formatKgPerCongo(measurementInfo?.kgPerCongo);
  if (!kgPerCongo) return null;

  return (
    <details className={`local-measurement-info${compact ? " local-measurement-info--compact" : ""}`}>
      <summary className="local-measurement-info__summary">
        <IconInfoCircle size={18} stroke={1.9} aria-hidden="true" />
        <span>{compact ? "1 kg is not equal to 1 Congo" : "Measurement info"}</span>
      </summary>
      <div className="local-measurement-info__content">
        <strong>1 kg ≠ 1 Congo</strong>
        <p>For this product, 1 Congo ≈ {kgPerCongo} kg.</p>
        {!compact ? <small>Meal05 uses standardized kilogram measurements for this product.</small> : null}
      </div>
    </details>
  );
}
